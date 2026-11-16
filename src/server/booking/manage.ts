import { db } from "@/lib/db";
import { formatWon } from "@/lib/money";
import { kstDateStr, rangeLabel, slotStartsOf, todayKst } from "@/lib/time";
import { isFacilityStaff } from "@/server/auth/staff";
import { notify } from "@/server/notification";
import { getPaymentGateway } from "@/server/payment";
import { PriceMissingError, priceForRange } from "@/server/pricing";
import { quoteRefund, type RefundQuote } from "@/server/refund";
import type { RefundReason } from "@prisma/client";
import { newBookingNo } from "./booking-no";
import { BookingError, isSlotConflict } from "./errors";
import { checkTimeAndHours, releaseExpiredHoldsOn } from "./hold";

function paidPaymentOf<T extends { status: string }>(payments: T[]): T | undefined {
  return payments.find((p) => p.status === "done");
}

/** U10 환불 예상액 */
export async function refundQuoteFor(bookingId: string, now: Date = new Date()): Promise<RefundQuote | null> {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: { payments: true, facility: { include: { cancellationTiers: true } } },
  });
  if (!b || b.status !== "confirmed") return null;
  const paid = paidPaymentOf(b.payments);
  return quoteRefund({
    paidAmount: paid?.amount ?? 0,
    startAt: b.startAt,
    approvedAt: paid?.approvedAt ?? null,
    tiers: b.facility.cancellationTiers,
    now,
  });
}

/**
 * 예약 취소 공통: booking 을 조건부로 cancelled 로 바꾸고(동시 요청은 한 번만 통과) 슬롯을 지운 뒤
 * 결제를 부분/전액 취소하고 refunds 에 남긴다.
 */
async function cancelConfirmed(args: {
  bookingId: string;
  refundPercent: number;
  refundAmount: number;
  reason: RefundReason;
  cancelReason: string;
  now: Date;
}) {
  const { bookingId, refundPercent, refundAmount, reason, cancelReason, now } = args;
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: "confirmed" },
      data: { status: "cancelled", cancelledAt: now, cancelReason },
    });
    if (updated.count === 0) return null;
    await tx.bookingSlot.deleteMany({ where: { bookingId } });
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payments: true } });
    if (b.userId) {
      await tx.facilityCustomer.updateMany({
        where: { facilityId: b.facilityId, userId: b.userId, visitCount: { gt: 0 } },
        data: { visitCount: { decrement: 1 } },
      });
    }
    return b;
  });
  if (!result) throw new BookingError("NOT_CANCELLABLE");

  const paid = paidPaymentOf(result.payments);
  if (paid && paid.tossPaymentKey && refundAmount > 0) {
    const res = await getPaymentGateway().cancel({ paymentKey: paid.tossPaymentKey, amount: refundAmount, reason: cancelReason });
    await db.$transaction([
      db.refund.create({
        data: { paymentId: paid.id, amount: refundAmount, refundPercent, reason, tossCancelTx: res.transactionKey },
      }),
      db.payment.update({
        where: { id: paid.id },
        data: { status: refundAmount >= paid.amount ? "cancelled" : "partial_cancelled" },
      }),
    ]);
  }
  await notifyCancelled(bookingId, refundAmount);
}

async function notifyCancelled(bookingId: string, refundAmount: number) {
  const b = await db.booking.findUnique({ where: { id: bookingId }, include: { user: true, court: true, facility: true } });
  if (!b) return;
  const what = `${b.facility.name} ${b.court.name} ${rangeLabel(b.startAt, b.endAt)}`;
  await notify({
    template: "user_booking_cancelled",
    userId: b.userId,
    phone: b.user?.phone ?? b.guestPhone,
    bookingId: b.id,
    text: `예약이 취소됐어요. ${what} 환불 ${formatWon(refundAmount)}`,
  });
  await notify({
    template: "operator_booking_cancelled",
    phone: b.facility.phone,
    bookingId: b.id,
    text: `예약 취소: ${what}`,
  });
}

/** U10 이용자 취소. held(결제 전)면 선점만 푼다. */
export async function cancelByUser(args: { bookingId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const b = await db.booking.findUnique({ where: { id: args.bookingId } });
  if (!b || b.userId !== args.userId) throw new BookingError("NOT_FOUND");

  if (b.status === "held") {
    await db.$transaction([
      db.bookingSlot.deleteMany({ where: { bookingId: b.id } }),
      db.booking.updateMany({
        where: { id: b.id, status: "held" },
        data: { status: "cancelled", cancelledAt: now, cancelReason: "결제 전 취소" },
      }),
    ]);
    return { refundAmount: 0 };
  }
  const quote = await refundQuoteFor(b.id, now);
  if (!quote || !quote.cancellable) throw new BookingError("NOT_CANCELLABLE");
  await cancelConfirmed({
    bookingId: b.id,
    refundPercent: quote.refundPercent,
    refundAmount: quote.refundAmount,
    reason: "user_cancel",
    cancelReason: "이용자 취소",
    now,
  });
  return { refundAmount: quote.refundAmount };
}

async function assertStaff(userId: string, facilityId: string) {
  if (!(await isFacilityStaff(userId, facilityId))) throw new BookingError("FORBIDDEN");
}

/**
 * O09 운영자 취소. 시설 사정 취소는 항상 전액 환불.
 * TODO(open-issue): 우천·시설 사정 취소 환불 정책 미정 — PRD 가정값(100%)을 쓴다.
 */
export async function cancelByFacility(args: { bookingId: string; staffUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const b = await db.booking.findUnique({ where: { id: args.bookingId }, include: { payments: true } });
  if (!b) throw new BookingError("NOT_FOUND");
  await assertStaff(args.staffUserId, b.facilityId);
  const paid = paidPaymentOf(b.payments);
  await cancelConfirmed({
    bookingId: b.id,
    refundPercent: 100,
    refundAmount: paid?.amount ?? 0,
    reason: "facility_cancel",
    cancelReason: "시설 취소",
    now,
  });
}

/** O09 노쇼 처리: 이용 당일(KST)이거나 시작 시각이 지난 확정 예약만. 환불 0% + 노쇼 1회 기록. */
export async function markNoShow(args: { bookingId: string; staffUserId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const b = await db.booking.findUnique({ where: { id: args.bookingId } });
  if (!b) throw new BookingError("NOT_FOUND");
  await assertStaff(args.staffUserId, b.facilityId);
  if (b.status !== "confirmed" || kstDateStr(b.startAt) > todayKst(now)) throw new BookingError("NOT_CANCELLABLE");
  await db.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: b.id, status: "confirmed" },
      data: { status: "no_show" },
    });
    if (updated.count === 0) throw new BookingError("NOT_CANCELLABLE");
    if (b.userId) {
      await tx.facilityCustomer.upsert({
        where: { facilityId_userId: { facilityId: b.facilityId, userId: b.userId } },
        create: { facilityId: b.facilityId, userId: b.userId, noShowCount: 1 },
        update: { noShowCount: { increment: 1 } },
      });
    }
  });
}

/** O09 수동 예약(전화·현장). 결제 없이 바로 confirmed. 금액은 price_rules 로 계산해 기록만 한다. */
export async function createManualBooking(args: {
  staffUserId: string;
  facilityId: string;
  courtId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  guestName: string;
  guestPhone: string | null;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  await assertStaff(args.staffUserId, args.facilityId);
  try {
    return await db.$transaction(async (tx) => {
      const court = await tx.court.findFirst({ where: { id: args.courtId, facilityId: args.facilityId, isActive: true } });
      if (!court) throw new BookingError("COURT_UNAVAILABLE");
      const { startAt, endAt } = await checkTimeAndHours(tx, { ...args, now });
      const rules = await tx.priceRule.findMany({ where: { facilityId: args.facilityId } });
      let totalAmount: number;
      try {
        totalAmount = priceForRange(rules, args.date, args.startMinute, args.endMinute);
      } catch (e) {
        if (e instanceof PriceMissingError) throw new BookingError("PRICE_MISSING");
        throw e;
      }
      const slotStarts = slotStartsOf(startAt, endAt);
      await releaseExpiredHoldsOn(tx, args.courtId, slotStarts, now);
      const booking = await tx.booking.create({
        data: {
          bookingNo: newBookingNo(now),
          facilityId: args.facilityId,
          courtId: args.courtId,
          startAt,
          endAt,
          totalAmount,
          status: "confirmed",
          source: "manual",
          guestName: args.guestName,
          guestPhone: args.guestPhone,
        },
      });
      await tx.bookingSlot.createMany({
        data: slotStarts.map((slotStart) => ({ bookingId: booking.id, courtId: args.courtId, slotStart })),
      });
      return booking;
    });
  } catch (e) {
    if (isSlotConflict(e)) throw new BookingError("SLOT_TAKEN");
    throw e;
  }
}


/** O09 임시 차단 (blackouts). courtId 가 null 이면 시설 전체. */
export async function createBlackout(args: {
  staffUserId: string;
  facilityId: string;
  courtId: string | null;
  startAt: Date;
  endAt: Date;
  reason: string | null;
}) {
  await assertStaff(args.staffUserId, args.facilityId);
  if (args.startAt >= args.endAt) throw new BookingError("INVALID_TIME");
  return db.blackout.create({
    data: { facilityId: args.facilityId, courtId: args.courtId, startAt: args.startAt, endAt: args.endAt, reason: args.reason },
  });
}

export async function deleteBlackout(args: { staffUserId: string; blackoutId: string }) {
  const bo = await db.blackout.findUnique({ where: { id: args.blackoutId } });
  if (!bo) throw new BookingError("NOT_FOUND");
  await assertStaff(args.staffUserId, bo.facilityId);
  await db.blackout.delete({ where: { id: bo.id } });
}
