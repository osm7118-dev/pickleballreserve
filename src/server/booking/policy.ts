import type { BookingPolicy } from "@prisma/client";

// booking_policies 행이 없을 때의 기본값 (PRD 흐름 B-7).
export const DEFAULT_POLICY = {
  advanceDays: 14,
  maxMinutesPerDay: 120,
  minMinutesPerBooking: 60,
  maxMinutesPerBooking: 120,
  holdMinutes: 10,
} as const;

export type PolicyValues = Pick<
  BookingPolicy,
  "advanceDays" | "maxMinutesPerDay" | "minMinutesPerBooking" | "maxMinutesPerBooking" | "holdMinutes"
>;

export function policyOf(p: PolicyValues | null | undefined): PolicyValues {
  return p ?? DEFAULT_POLICY;
}
