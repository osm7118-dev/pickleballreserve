import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { rangeLabel } from "@/lib/time";
import { formatWon } from "@/lib/money";
import { BookingError } from "@/server/booking/errors";
import { notify } from "@/server/notification";
import { getPaymentGateway } from "./index";
import { confirmOpenPlayJoin } from "@/server/open-play";

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

export type ApproveOutcome =
  | { kind: "booking"; bookingId: string; facilityId: string; alreadyDone: boolean }
  | { kind: "open_play"; sessionId: string; alreadyDone: boolean }
  | { kind: "lesson"; lessonId: string; alreadyDone: boolean };

/**
 * 결제 성공 리다이렉트 처리 → 승인 → 대상 확정 (코트 예약 / 오픈플레이 참가 / 레슨).
 * - order_id 로 멱등: 이미 승인된 결제면 아무것도 바꾸지 않고 결과만 돌려준다.
 * - 코트·레슨: 승인 직전에 아직 held 이고 hold_expires_at 전인지 다시 확인한다.
 * - 결제 위젯이 보낸 금액이 서버 금액과 다르면 승인하지 않는다.
 * - 승인 뒤 확정에 실패하면(선점 만료·정원 마감) 승인한 결제를 전액 취소한다.
 */
export async function approvePayment(args: {
  orderId: string;
  paymentKey: string;
  amount: number;
  userId: string;
  now?: Date;
}): Promise<ApproveOutcome> {
  const now = args.now ?? new Date();
  const payment = await db.payment.findUnique({
    where: { orderId: args.orderId },
    include: { booking: true, participant: { include: { session: true } }, lessonBooking: true },
  });
  if (!payment || payment.userId !== args.userId) throw new BookingError("NOT_FOUND");

  let outcome: ApproveOutcome;
  let expected: number;
  if (payment.booking) {
    outcome = { kind: "booking", bookingId: payment.booking.id, facilityId: payment.booking.facilityId, alreadyDone: false };
    expected = payment.booking.totalAmount;
  } else if (payment.participant) {
    outcome = { kind: "open_play", sessionId: payment.participant.sessionId, alreadyDone: false };
    expected = payment.participant.session.fee;
  } else if (payment.lessonBooking) {
    outcome = { kind: "lesson", lessonId: payment.lessonBooking.id, alreadyDone: false };
    expected = payment.lessonBooking.amount;
  } else {
    throw new BookingError("NOT_FOUND");
  }

  if (payment.status === "done" || payment.status === "partial_cancelled" || payment.status === "cancelled") {
    return { ...outcome, alreadyDone: true };
  }
  if (args.amount !== payment.amount || payment.amount !== expected) {
    await db.payment.updateMany({ where: { id: payment.id, status: "ready" }, data: { status: "failed" } });
    throw new BookingError("AMOUNT_MISMATCH");
  }
  const held = payment.booking ?? payment.lessonBooking;
  if (held && (held.status !== "held" || !held.holdExpiresAt || held.holdExpiresAt <= now)) {
    throw new BookingError("HOLD_EXPIRED");
  }
  if (payment.participant && (payment.participant.session.status !== "open" || payment.participant.session.startAt <= now)) {
    throw new BookingError("SESSION_CLOSED");
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
  const paidData = { status: "done" as const, method: approved.method, approvedAt: approved.approvedAt, raw: approved.raw as object };

  const confirmed = await db.$transaction(async (tx) => {
    let ok = false;
    let facilityId: string;
    if (payment.booking) {
      const b = payment.booking;
      facilityId = b.facilityId;
      const u = await tx.booking.updateMany({
        where: { id: b.id, status: "held", holdExpiresAt: { gt: now } },
        data: { status: "confirmed", holdExpiresAt: null },
      });
      ok = u.count > 0;
    } else if (payment.lessonBooking) {
      const lb = payment.lessonBooking;
      facilityId = lb.facilityId;
      const u = await tx.lessonBooking.updateMany({
        where: { id: lb.id, status: "held", holdExpiresAt: { gt: now } },
        data: { status: "confirmed", holdExpiresAt: null },
      });
      ok = u.count > 0;
    } else {
      facilityId = payment.participant!.session.facilityId;
      // payment_id(UNIQUE) 를 참가 행에 걸기 전에 결제를 먼저 done 으로 만든다.
      await tx.payment.update({ where: { id: payment.id }, data: paidData });
      ok = await confirmOpenPlayJoin(tx, { participantId: payment.participant!.id, paymentId: payment.id });
      if (!ok) throw new RollbackToCancel();
    }
    if (!ok) return false;
    if (payment.booking || payment.lessonBooking) await tx.payment.update({ where: { id: payment.id }, data: paidData });
    await tx.facilityCustomer.upsert({
      where: { facilityId_userId: { facilityId, userId: payment.userId } },
      create: { facilityId, userId: payment.userId, visitCount: 1 },
      update: { visitCount: { increment: 1 } },
    });
    return true;
  }).catch((e) => {
    if (e instanceof RollbackToCancel) return false;
    throw e;
  });

  if (!confirmed) {
    await gateway.cancel({ paymentKey: args.paymentKey, amount: payment.amount, reason: payment.participant ? "정원 마감" : "선점 시간 만료" });
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "cancelled", method: approved.method, approvedAt: approved.approvedAt, raw: approved.raw as object },
    });
    throw new BookingError(payment.participant ? "FULL" : "HOLD_EXPIRED");
  }

  if (payment.booking) await notifyConfirmed(payment.booking.id);
  else await notifyOther(payment.id);
  return outcome;
}

class RollbackToCancel extends Error {}

async function notifyOther(paymentId: string) {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, participant: { include: { session: { include: { facility: true } } } }, lessonBooking: { include: { coach: true, facility: true } } },
  });
  if (!p) return;
  const text = p.participant
    ? `오픈플레이 참가가 확정됐어요. ${p.participant.session.facility.name} ${p.participant.session.title} ${rangeLabel(p.participant.session.startAt, p.participant.session.endAt)}`
    : p.lessonBooking
      ? `레슨 예약이 확정됐어요. ${p.lessonBooking.facility.name} ${p.lessonBooking.coach.name} ${rangeLabel(p.lessonBooking.startAt, p.lessonBooking.endAt)}`
      : "";
  if (text) await notify({ template: "user_booking_confirmed", userId: p.userId, phone: p.user.phone, text });
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
