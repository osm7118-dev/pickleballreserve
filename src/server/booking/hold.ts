import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { addDays, isBookingBoundary, isDateStr, kstAt, kstWeekday, slotStartsOf, todayKst } from "@/lib/time";
import { PriceMissingError, priceForRange } from "@/server/pricing";
import { newBookingNo } from "./booking-no";
import { BookingError, isSlotConflict } from "./errors";
import { policyOf } from "./policy";

type Tx = Prisma.TransactionClient;

export type HoldInput = {
  userId: string;
  facilityId: string;
  courtId: string;
  /** KST 날짜 yyyy-MM-dd */
  date: string;
  startMinute: number;
  endMinute: number;
};

/** 1단계 중 "1시간 경계 · 운영시간 · blackout" 검사. 수동 예약도 함께 쓴다. */
export async function checkTimeAndHours(
  tx: Tx,
  args: { facilityId: string; courtId: string; date: string; startMinute: number; endMinute: number; now: Date },
): Promise<{ startAt: Date; endAt: Date }> {
  const { facilityId, courtId, date, startMinute, endMinute, now } = args;
  if (!isDateStr(date) || !isBookingBoundary(startMinute) || !isBookingBoundary(endMinute) || startMinute >= endMinute) {
    throw new BookingError("INVALID_TIME");
  }
  const startAt = kstAt(date, startMinute);
  const endAt = kstAt(date, endMinute);
  if (startAt.getTime() <= now.getTime()) throw new BookingError("PAST");

  const hours = await tx.operatingHour.findUnique({
    where: { facilityId_weekday: { facilityId, weekday: kstWeekday(date) } },
  });
  if (!hours || startMinute < hours.openMinute || endMinute > hours.closeMinute) {
    throw new BookingError("OUTSIDE_HOURS");
  }
  const blackout = await tx.blackout.findFirst({
    where: {
      facilityId,
      OR: [{ courtId: null }, { courtId }],
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  if (blackout) throw new BookingError("BLACKED_OUT");
  return { startAt, endAt };
}

/**
 * 6단계: 같은 슬롯을 잡고 있던 만료된 held 예약을 먼저 정리한다
 * (크론이 돌기 전 최대 1분 동안 빈 슬롯이 막혀 보이지 않게).
 */
export async function releaseExpiredHoldsOn(tx: Tx, courtId: string, slotStarts: Date[], now: Date) {
  const expired = await tx.booking.findMany({
    where: {
      status: "held",
      holdExpiresAt: { lte: now },
      slots: { some: { courtId, slotStart: { in: slotStarts } } },
    },
    select: { id: true },
  });
  if (expired.length === 0) return;
  const ids = expired.map((b) => b.id);
  await tx.bookingSlot.deleteMany({ where: { bookingId: { in: ids } } });
  await tx.booking.updateMany({
    where: { id: { in: ids }, status: "held" },
    data: { status: "cancelled", cancelledAt: now, cancelReason: "선점 시간 만료" },
  });
}

/**
 * 예약 선점 (U06). PRD 4장 "예약 규칙 검증 순서" 1~7단계를 한 트랜잭션에서 순서대로 실행한다.
 * 다른 사람이 먼저 잡은 슬롯은 booking_slots 유니크 제약이 막고 SLOT_TAKEN 으로 응답한다.
 */
export async function holdBooking(input: HoldInput, now: Date = new Date()) {
  const { userId, facilityId, courtId, date, startMinute, endMinute } = input;
  try {
    return await db.$transaction(async (tx) => {
      const facility = await tx.facility.findUnique({
        where: { id: facilityId },
        include: { bookingPolicy: true, priceRules: true },
      });
      if (!facility || facility.status !== "approved") throw new BookingError("FACILITY_UNAVAILABLE");
      const court = await tx.court.findFirst({ where: { id: courtId, facilityId, isActive: true } });
      if (!court) throw new BookingError("COURT_UNAVAILABLE");
      const policy = policyOf(facility.bookingPolicy);

      // 1. 1시간 경계(저장은 30분 슬롯), 운영시간 안, blackout과 겹치지 않음
      const { startAt, endAt } = await checkTimeAndHours(tx, { facilityId, courtId, date, startMinute, endMinute, now });

      // 2. 1회 이용시간 min~max
      const minutes = endMinute - startMinute;
      if (minutes < policy.minMinutesPerBooking || minutes > policy.maxMinutesPerBooking) {
        throw new BookingError("DURATION");
      }

      // 3. 오늘 + advance_days 이내
      if (date > addDays(todayKst(now), policy.advanceDays)) throw new BookingError("TOO_FAR");

      // 4. 같은 이용자·시설·날(KST)의 confirmed + (유효한) held 합계 <= max_minutes_per_day
      const sameDay = await tx.booking.findMany({
        where: {
          userId,
          facilityId,
          startAt: { gte: kstAt(date, 0), lt: kstAt(date, 24 * 60) },
          OR: [{ status: "confirmed" }, { status: "held", holdExpiresAt: { gt: now } }],
        },
        select: { startAt: true, endAt: true },
      });
      const used = sameDay.reduce((sum, b) => sum + (b.endAt.getTime() - b.startAt.getTime()) / 60000, 0);
      if (used + minutes > policy.maxMinutesPerDay) throw new BookingError("DAILY_LIMIT");

      // 5. 시설의 예약 차단 고객이 아님
      const customer = await tx.facilityCustomer.findUnique({
        where: { facilityId_userId: { facilityId, userId } },
        select: { isBlocked: true },
      });
      if (customer?.isBlocked) throw new BookingError("BLOCKED");

      // 7. 금액은 price_rules 로 슬롯별 합산 (클라이언트 금액은 받지 않는다).
      //    6단계 INSERT 에 total_amount 가 필요해 계산만 먼저 해 둔다.
      let totalAmount: number;
      try {
        totalAmount = priceForRange(facility.priceRules, date, startMinute, endMinute);
      } catch (e) {
        if (e instanceof PriceMissingError) throw new BookingError("PRICE_MISSING");
        throw e;
      }

      // 6. 만료된 held 정리 → booking(held) + booking_slots INSERT (유니크 위반 = 이미 예약된 시간)
      const slotStarts = slotStartsOf(startAt, endAt);
      await releaseExpiredHoldsOn(tx, courtId, slotStarts, now);
      const booking = await tx.booking.create({
        data: {
          bookingNo: newBookingNo(now),
          userId,
          facilityId,
          courtId,
          startAt,
          endAt,
          totalAmount,
          status: "held",
          source: "app",
          holdExpiresAt: new Date(now.getTime() + policy.holdMinutes * 60 * 1000),
        },
      });
      await tx.bookingSlot.createMany({
        data: slotStarts.map((slotStart) => ({ bookingId: booking.id, courtId, slotStart })),
      });
      return booking;
    });
  } catch (e) {
    if (isSlotConflict(e)) throw new BookingError("SLOT_TAKEN");
    throw e;
  }
}

/** held 10분 만료 정리 (크론 1분 간격). 정리한 건수를 돌려준다. */
export async function expireHolds(now: Date = new Date()): Promise<number> {
  return db.$transaction(async (tx) => {
    const expired = await tx.booking.findMany({
      where: { status: "held", holdExpiresAt: { lte: now } },
      select: { id: true },
    });
    if (expired.length === 0) return 0;
    const ids = expired.map((b) => b.id);
    await tx.bookingSlot.deleteMany({ where: { bookingId: { in: ids } } });
    const res = await tx.booking.updateMany({
      where: { id: { in: ids }, status: "held" },
      data: { status: "cancelled", cancelledAt: now, cancelReason: "선점 시간 만료" },
    });
    return res.count;
  });
}
