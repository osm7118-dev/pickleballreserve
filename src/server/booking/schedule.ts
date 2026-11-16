import type { BookingSource, BookingStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { SLOT_MINUTES, kstAt, kstWeekday } from "@/lib/time";
import { dayTypeOf, slotPrice } from "@/server/pricing";

export type SlotBooking = {
  id: string;
  bookingNo: string;
  status: BookingStatus;
  source: BookingSource;
  startMinute: number;
  endMinute: number;
  name: string;
  phone: string | null;
  totalAmount: number;
};

export type SlotBlackout = { id: string; startMinute: number; endMinute: number; reason: string | null; allCourts: boolean };

export type CourtDay = {
  id: string;
  name: string;
  surface: string | null;
  bookings: SlotBooking[];
  blackouts: SlotBlackout[];
};

export type FacilityDay = {
  date: string;
  /** 운영 안 하는 날이면 null */
  openMinute: number | null;
  closeMinute: number | null;
  courts: CourtDay[];
  /** 30분 슬롯 시작 분 → 가격(원). 가격이 없으면 null */
  prices: Record<number, number | null>;
};

const clampMinute = (d: Date, date: string) => {
  const dayStart = kstAt(date, 0).getTime();
  const m = Math.round((d.getTime() - dayStart) / 60000);
  return Math.max(0, Math.min(24 * 60, m));
};

/**
 * 시설 하루 시간표 (U05, O09 공통). 유효한 held·confirmed·completed·no_show 예약이 슬롯을 차지한다.
 * 만료된 held 는 크론이 돌기 전이라도 빈 칸으로 본다.
 */
export async function getFacilityDay(facilityId: string, date: string, now: Date = new Date()): Promise<FacilityDay> {
  const dayStart = kstAt(date, 0);
  const dayEnd = kstAt(date, 24 * 60);
  const [hours, courts, bookings, blackouts, rules] = await Promise.all([
    db.operatingHour.findUnique({ where: { facilityId_weekday: { facilityId, weekday: kstWeekday(date) } } }),
    db.court.findMany({ where: { facilityId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.booking.findMany({
      where: {
        facilityId,
        startAt: { lt: dayEnd },
        endAt: { gt: dayStart },
        OR: [{ status: { in: ["confirmed", "completed", "no_show"] } }, { status: "held", holdExpiresAt: { gt: now } }],
      },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { startAt: "asc" },
    }),
    db.blackout.findMany({ where: { facilityId, startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }),
    db.priceRule.findMany({ where: { facilityId } }),
  ]);

  const dayType = dayTypeOf(date);
  const prices: Record<number, number | null> = {};
  if (hours) {
    for (let m = hours.openMinute; m < hours.closeMinute; m += SLOT_MINUTES) prices[m] = slotPrice(rules, dayType, m);
  }

  return {
    date,
    openMinute: hours?.openMinute ?? null,
    closeMinute: hours?.closeMinute ?? null,
    prices,
    courts: courts.map((c) => ({
      id: c.id,
      name: c.name,
      surface: c.surface,
      bookings: bookings
        .filter((b) => b.courtId === c.id)
        .map((b) => ({
          id: b.id,
          bookingNo: b.bookingNo,
          status: b.status,
          source: b.source,
          startMinute: clampMinute(b.startAt, date),
          endMinute: clampMinute(b.endAt, date),
          name: b.user?.name ?? b.guestName ?? "이름 없음",
          phone: b.user?.phone ?? b.guestPhone,
          totalAmount: b.totalAmount,
        })),
      blackouts: blackouts
        .filter((bo) => bo.courtId === null || bo.courtId === c.id)
        .map((bo) => ({
          id: bo.id,
          startMinute: clampMinute(bo.startAt, date),
          endMinute: clampMinute(bo.endAt, date),
          reason: bo.reason,
          allCourts: bo.courtId === null,
        })),
    })),
  };
}

export type CellState = "open" | "booked" | "blocked" | "closed";

/** 이용자 시간표용: 코트·슬롯별 상태. 지난 시간과 가격 없는 시간은 closed. */
export function cellState(day: FacilityDay, court: CourtDay, minute: number, now: Date): CellState {
  if (day.openMinute === null || day.closeMinute === null) return "closed";
  if (minute < day.openMinute || minute >= day.closeMinute) return "closed";
  if (court.bookings.some((b) => b.startMinute <= minute && minute < b.endMinute)) return "booked";
  if (court.blackouts.some((bo) => bo.startMinute <= minute && minute < bo.endMinute)) return "blocked";
  if (kstAt(day.date, minute).getTime() <= now.getTime()) return "closed";
  if (day.prices[minute] == null) return "closed";
  return "open";
}

export function isRangeOpen(day: FacilityDay, court: CourtDay, start: number, end: number, now: Date): boolean {
  for (let m = start; m < end; m += SLOT_MINUTES) if (cellState(day, court, m, now) !== "open") return false;
  return true;
}

export function rangePrice(day: FacilityDay, start: number, end: number): number | null {
  let total = 0;
  for (let m = start; m < end; m += SLOT_MINUTES) {
    const p = day.prices[m];
    if (p == null) return null;
    total += p;
  }
  return total;
}

