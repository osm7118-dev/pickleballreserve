import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { rangeLabel } from "@/lib/time";
import { formatWon } from "@/lib/money";
import { BookingError } from "@/server/booking/errors";
import { notify } from "@/server/notification";
import { getPaymentGateway } from "./index";

/**
 * U07 진입: 선점 중인 예약의 결제 건(order_id)을 만든다.
 * 같은 예약으로 아직 승인 전인 결제 건이 있으면 그것을 다시 쓴다.
 */
export async function startPayment(args: { bookingId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const booking = await db.booking.findUnique({ where: { id: args.bookingId } });
  if (!booking || booking.userId !== args.userId) throw new BookingError("NOT_FOUND");
  if (booking.status !== "held" || !booking.holdExpiresAt || booking.holdExpiresAt <= now) {
    throw new BookingError("HOLD_EXPIRED");
  }
  const existing = await db.payment.findFirst({
    where: { bookingId: booking.id, status: "ready", amount: booking.totalAmount },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return db.payment.create({
    data: {
      orderId: `ORD-${booking.bookingNo}-${randomBytes(3).toString("hex")}`,
      bookingId: booking.id,
      userId: args.userId,
      amount: booking.totalAmount,
      status: "ready",
    },
  });
}

export type ApproveOutcome = { bookingId: string; facilityId: string; alreadyDone: boolean };

/**
 * 결제 성공 리다이렉트 처리 → 승인 → booking confirmed.
 * - order_id 로 멱등: 이미 승인된 결제면 아무것도 바꾸지 않고 결과만 돌려준다.
 * - 승인 직전에 booking 이 아직 held 이고 hold_expires_at 전인지 다시 확인한다.
 * - 결제 위젯이 보낸 금액이 서버 금액과 다르면 승인하지 않는다.
 */
export async function approvePayment(args: {
  orderId: string;
  paymentKey: string;
  amount: number;
  userId: string;
  now?: Date;
}): Promise<ApproveOutcome> {
  const now = args.now ?? new Date();
  const payment = await db.payment.findUnique({ where: { orderId: args.orderId }, include: { booking: true } });
  if (!payment || !payment.booking || payment.userId !== args.userId) throw new BookingError("NOT_FOUND");
  const booking = payment.booking;
  const outcome = { bookingId: booking.id, facilityId: booking.facilityId };

  if (payment.status === "done" || payment.status === "partial_cancelled" || payment.status === "cancelled") {
    return { ...outcome, alreadyDone: true };
  }
  if (args.amount !== payment.amount || payment.amount !== booking.totalAmount) {
    await db.payment.updateMany({ where: { id: payment.id, status: "ready" }, data: { status: "failed" } });
    throw new BookingError("AMOUNT_MISMATCH");
  }
  if (booking.status !== "held" || !booking.holdExpiresAt || booking.holdExpiresAt <= now) {
    throw new BookingError("HOLD_EXPIRED");
  }

  // 같은 order_id 승인 요청이 동시에 와도 한 번만 진행되도록 payment_key 를 조건부로 먼저 기록한다.
  const claimed = await db.payment.updateMany({
    where: { id: payment.id, status: "ready", tossPaymentKey: null },
    data: { tossPaymentKey: args.paymentKey },
  });
  if (claimed.count === 0) return { ...outcome, alreadyDone: true };

  const gateway = getPaymentGateway();
  let approved;
  try {
    approved = await gateway.approve({ paymentKey: args.paymentKey, orderId: payment.orderId, amount: payment.amount });
  } catch (e) {
    // 승인 실패: 선점 시간 안에 다시 시도할 수 있게 되돌린다.
    await db.payment.update({ where: { id: payment.id }, data: { tossPaymentKey: null } });
    throw e;
  }

  const confirmed = await db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: booking.id, status: "held", holdExpiresAt: { gt: now } },
      data: { status: "confirmed", holdExpiresAt: null },
    });
    if (updated.count === 0) return false;
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "done",
        method: approved.method,
        approvedAt: approved.approvedAt,
        raw: approved.raw as object,
      },
    });
    if (booking.userId) {
      await tx.facilityCustomer.upsert({
        where: { facilityId_userId: { facilityId: booking.facilityId, userId: booking.userId } },
        create: { facilityId: booking.facilityId, userId: booking.userId, visitCount: 1 },
        update: { visitCount: { increment: 1 } },
      });
    }
    return true;
  });

  if (!confirmed) {
    // 승인과 확정 사이에 선점이 풀렸다 → 승인한 결제를 전액 취소한다.
    await gateway.cancel({ paymentKey: args.paymentKey, amount: payment.amount, reason: "선점 시간 만료" });
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "cancelled", method: approved.method, approvedAt: approved.approvedAt, raw: approved.raw as object },
    });
    throw new BookingError("HOLD_EXPIRED");
  }

  await notifyConfirmed(booking.id);
  return { ...outcome, alreadyDone: false };
}

async function notifyConfirmed(bookingId: string) {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: { user: true, court: true, facility: true },
  });
  if (!b) return;
  const what = `${b.facility.name} ${b.court.name} ${rangeLabel(b.startAt, b.endAt)}`;
  await notify({
    template: "user_booking_confirmed",
    userId: b.userId,
    phone: b.user?.phone,
    bookingId: b.id,
    text: `예약이 확정됐어요. ${what} (${formatWon(b.totalAmount)}) 예약번호 ${b.bookingNo}`,
  });
  await notify({
    template: "operator_new_booking",
    phone: b.facility.phone,
    bookingId: b.id,
    text: `새 예약: ${what} ${b.user?.name ?? ""}`,
  });
}
