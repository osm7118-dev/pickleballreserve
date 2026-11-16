import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

// 저장은 UTC timestamptz, 표시와 "같은 날" 판단은 Asia/Seoul.
// 날짜는 KST 기준 "yyyy-MM-dd" 문자열, 하루 중 시각은 자정부터의 분(0~1440)으로 다룬다.
export const TZ = "Asia/Seoul";
export const SLOT_MINUTES = 30;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** KST 날짜 + 자정부터의 분 → Date */
export function kstAt(dateStr: string, minute: number): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const midnight = new TZDate(y, m - 1, d, 0, 0, 0, TZ);
  return new Date(midnight.getTime() + minute * MINUTE_MS);
}

/** Date → KST 날짜 문자열 */
export function kstDateStr(date: Date): string {
  return format(new TZDate(date, TZ), "yyyy-MM-dd");
}

export function todayKst(now: Date = new Date()): string {
  return kstDateStr(now);
}

/** Date → KST 자정부터의 분 */
export function kstMinuteOfDay(date: Date): number {
  return Math.round((date.getTime() - kstAt(kstDateStr(date), 0).getTime()) / MINUTE_MS);
}

/** 0=일요일 … 6=토요일 (KST) */
export function kstWeekday(dateStr: string): number {
  return new TZDate(kstAt(dateStr, 0), TZ).getDay();
}

export function addDays(dateStr: string, days: number): string {
  return kstDateStr(new Date(kstAt(dateStr, 0).getTime() + days * DAY_MS + 12 * 60 * MINUTE_MS));
}

export function isSlotBoundary(minute: number): boolean {
  return Number.isInteger(minute) && minute % SLOT_MINUTES === 0;
}

/** [start, end) 를 30분 슬롯 시작 시각 목록으로 */
export function slotStartsOf(startAt: Date, endAt: Date): Date[] {
  const out: Date[] = [];
  for (let t = startAt.getTime(); t < endAt.getTime(); t += SLOT_MINUTES * MINUTE_MS) out.push(new Date(t));
  return out;
}

/** 540 → "09:00", 1440 → "24:00" */
export function minuteLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatKst(date: Date, pattern: string): string {
  return format(new TZDate(date, TZ), pattern, { locale: ko });
}

/** "11월 18일 (수)" */
export function dateLabel(dateStr: string): string {
  return formatKst(kstAt(dateStr, 0), "M월 d일 (EEE)");
}

/** "11월 18일 (수) 19:00~20:30" */
export function rangeLabel(startAt: Date, endAt: Date): string {
  return `${formatKst(startAt, "M월 d일 (EEE) HH:mm")}~${formatKst(endAt, "HH:mm")}`;
}

export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}
