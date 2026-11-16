import { Prisma } from "@prisma/client";

export const BOOKING_ERRORS = {
  FACILITY_UNAVAILABLE: "지금은 예약할 수 없는 시설이에요.",
  COURT_UNAVAILABLE: "지금은 예약할 수 없는 코트예요.",
  INVALID_TIME: "30분 단위로 시간을 골라 주세요.",
  PAST: "이미 지난 시간이에요.",
  OUTSIDE_HOURS: "운영시간 밖의 시간이에요.",
  BLACKED_OUT: "시설 사정으로 예약을 받지 않는 시간이에요.",
  DURATION: "이용시간이 시설의 최소·최대 이용시간을 벗어나요.",
  TOO_FAR: "아직 예약을 열지 않은 날짜예요.",
  DAILY_LIMIT: "이 시설의 하루 최대 예약 시간을 넘어요.",
  BLOCKED: "이 시설에서는 예약할 수 없는 계정이에요. 시설에 문의해 주세요.",
  SLOT_TAKEN: "방금 다른 분이 예약한 시간이에요. 다른 시간을 골라 주세요.",
  PRICE_MISSING: "가격이 정해지지 않은 시간이 있어요.",
  NOT_FOUND: "예약을 찾을 수 없어요.",
  HOLD_EXPIRED: "선점 시간이 지났어요. 시간을 다시 골라 주세요.",
  NOT_CANCELLABLE: "취소할 수 없는 예약이에요.",
  AMOUNT_MISMATCH: "결제 금액이 예약 금액과 달라 결제를 진행하지 않았어요.",
  FORBIDDEN: "권한이 없어요.",
} as const;

export type BookingErrorCode = keyof typeof BOOKING_ERRORS;

export class BookingError extends Error {
  constructor(public readonly code: BookingErrorCode) {
    super(BOOKING_ERRORS[code]);
    this.name = "BookingError";
  }
}

export function isBookingErrorCode(value: string): value is BookingErrorCode {
  return value in BOOKING_ERRORS;
}

/** booking_slots UNIQUE(court_id, slot_start) 위반인지 */
export function isSlotConflict(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  const target = e.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  return fields.some((f) => f.includes("slot_start") || f.includes("slotStart") || f.includes("booking_slots"));
}
