import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { BOOKING_UNIT_MINUTES, addDays, isBookingBoundary, isDateStr, kstAt, kstWeekday, todayKst } from "@/lib/time";
import { BookingError, isExclusionViolation } from "@/server/booking/errors";
import { newBookingNo } from "@/server/booking/booking-no";
import { policyOf } from "@/server/booking/policy";
import { quoteRefund } from "@/server/refund";
import { refundPayment } from "@/server/payment/refund";

type Tx = Prisma.TransactionClient;

const ACTIVE = (now: Date): Prisma.LessonBookingWhereInput => ({
  OR: [{ status: "confirmed" }, { status: "held", holdExpiresAt: { gt: now } }],
});

export async function listCoaches(facilityId: string) {
  return db.coach.findMany({
    where: { facilityId, isActive: true },
    include: { availabilities: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

/** 코치가 그 날 레슨을 시작할 수 있는 시각(분) 목록. 지난 시간·이미 잡힌 레슨은 뺀다. */
export async function lessonStartsFor(coachId: string, date: string, now: Date = new Date()) {
  const coach = await db.coach.findUnique({
    where: { id: coachId },
    include: { availabilities: true, facility: { include: { bookingPolicy: true } } },
  });
  if (!coach || !coach.isActive || coach.facility.status !== "approved") return { coach: null, starts: [] as { minute: number; free: boolean }[] };
  const policy = policyOf(coach.facility.bookingPolicy);
  if (!isDateStr(date) || date < todayKst(now) || date > addDays(todayKst(now), policy.advanceDays)) {
    return { coach, starts: [] };
  }
  const windows = coach.availabilities.filter((a) => a.weekday === kstWeekday(date));
  const taken = await db.lessonBooking.findMany({
    where: { coachId, startAt: { lt: kstAt(date, 24 * 60) }, endAt: { gt: kstAt(date, 0) }, ...ACTIVE(now) },
    select: { startAt: true, endAt: true },
  });
  const starts: { minute: number; free: boolean }[] = [];
  for (const w of windows) {
    const first = Math.ceil(w.startMinute / BOOKING_UNIT_MINUTES) * BOOKING_UNIT_MINUTES;
    for (let m = first; m + coach.lessonMinutes <= w.endMinute; m += BOOKING_UNIT_MINUTES) {
      const s = kstAt(date, m);
      const e = kstAt(date, m + coach.lessonMinutes);
      if (s.getTime() <= now.getTime()) continue;
      const busy = taken.some((t) => t.startAt < e && t.endAt > s);
      starts.push({ minute: m, free: !busy });
    }
  }
  return { coach, starts };
}

/** 6단계와 같은 방식: 같은 코치의 겹치는 만료 held 레슨을 먼저 정리한다. */
async function releaseExpiredLessonHolds(tx: Tx, coachId: string, startAt: Date, endAt: Date, now: Date) {
  await tx.lessonBooking.updateMany({
    where: { coachId, status: "held", holdExpiresAt: { lte: now }, startAt: { lt: endAt }, endAt: { gt: startAt } },
    data: { status: "cancelled", cancelledAt: now, cancelReason: "선점 시간 만료" },
  });
}

/** 레슨 선점: 코치 가능 시간·사전예약 기간·차단 고객 확인 → held. 시간 겹침은 DB EXCLUDE 가 막는다. */
export async function holdLesson(input: { userId: string; coachId: string; date: string; startMinute: number }, now: Date = new Date()) {
  const { userId, coachId, date, startMinute } = input;
  try {
    return await db.$transaction(async (tx) => {
      const coach = await tx.coach.findUnique({
        where: { id: coachId },
        include: { availabilities: true, facility: { include: { bookingPolicy: true } } },
      });
      if (!coach || !coach.isActive || coach.facility.status !== "approved") throw new BookingError("COACH_UNAVAILABLE");
      if (!isDateStr(date) || !isBookingBoundary(startMinute)) throw new BookingError("INVALID_TIME");
      const endMinute = startMinute + coach.lessonMinutes;
      const startAt = kstAt(date, startMinute);
      const endAt = kstAt(date, endMinute);
      if (startAt.getTime() <= now.getTime()) throw new BookingError("PAST");
      const inWindow = coach.availabilities.some(
        (a) => a.weekday === kstWeekday(date) && a.startMinute <= startMinute && endMinute <= a.endMinute,
      );
      if (!inWindow) throw new BookingError("COACH_UNAVAILABLE");
      const policy = policyOf(coach.facility.bookingPolicy);
      if (date > addDays(todayKst(now), policy.advanceDays)) throw new BookingError("TOO_FAR");
      const customer = await tx.facilityCustomer.findUnique({
        where: { facilityId_userId: { facilityId: coach.facilityId, userId } },
        select: { isBlocked: true },
      });
      if (customer?.isBlocked) throw new BookingError("BLOCKED");

      await releaseExpiredLessonHolds(tx, coachId, startAt, endAt, now);
      return tx.lessonBooking.create({
        data: {
          bookingNo: newBookingNo(now).replace("PB-", "LS-"),
          coachId,
          facilityId: coach.facilityId,
          userId,
          startAt,
          endAt,
          amount: coach.lessonPrice,
          status: "held",
          holdExpiresAt: new Date(now.getTime() + policy.holdMinutes * 60_000),
        },
      });
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("SLOT_TAKEN");
    throw e;
  }
}

export async function startLessonPayment(args: { lessonId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const lb = await db.lessonBooking.findUnique({ where: { id: args.lessonId } });
  if (!lb || lb.userId !== args.userId) throw new BookingError("NOT_FOUND");
  if (lb.status !== "held" || !lb.holdExpiresAt || lb.holdExpiresAt <= now) throw new BookingError("HOLD_EXPIRED");
  const existing = await db.payment.findFirst({
    where: { lessonBookingId: lb.id, status: "ready", amount: lb.amount, tossPaymentKey: null },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return db.payment.create({
    data: { orderId: `ORD-${lb.bookingNo}-${Date.now().toString(36)}`, lessonBookingId: lb.id, userId: args.userId, amount: lb.amount, status: "ready" },
  });
}

/** 레슨 취소 환불액: 코트 예약과 같은 시설 취소 규정을 쓴다 (PRD 가정). */
export async function lessonRefundQuote(lessonId: string, now: Date = new Date()) {
  const lb = await db.lessonBooking.findUnique({
    where: { id: lessonId },
    include: { payments: true, facility: { include: { cancellationTiers: true } } },
  });
  if (!lb || lb.status !== "confirmed") return null;
  const paid = lb.payments.find((p) => p.status === "done");
  return quoteRefund({
    paidAmount: paid?.amount ?? 0,
    startAt: lb.startAt,
    approvedAt: paid?.approvedAt ?? null,
    tiers: lb.facility.cancellationTiers,
    now,
  });
}

/** 레슨 취소(이용자). held 면 선점만 풀고, confirmed 면 취소 규정대로 환불한다. */
export async function cancelLessonByUser(args: { lessonId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const lb = await db.lessonBooking.findUnique({ where: { id: args.lessonId }, include: { payments: true } });
  if (!lb || lb.userId !== args.userId) throw new BookingError("NOT_FOUND");
  if (lb.status === "held") {
    await db.lessonBooking.updateMany({
      where: { id: lb.id, status: "held" },
      data: { status: "cancelled", cancelledAt: now, cancelReason: "결제 전 취소" },
    });
    return { refundAmount: 0 };
  }
  const quote = await lessonRefundQuote(lb.id, now);
  if (!quote || !quote.cancellable) throw new BookingError("NOT_CANCELLABLE");
  const updated = await db.lessonBooking.updateMany({
    where: { id: lb.id, status: "confirmed" },
    data: { status: "cancelled", cancelledAt: now, cancelReason: "이용자 취소" },
  });
  if (updated.count === 0) throw new BookingError("NOT_CANCELLABLE");
  const paid = lb.payments.find((p) => p.status === "done");
  if (paid) {
    await refundPayment({
      paymentId: paid.id,
      amount: quote.refundAmount,
      refundPercent: quote.refundPercent,
      reason: "user_cancel",
      cancelReason: "레슨 취소",
    });
  }
  return { refundAmount: quote.refundAmount };
}
