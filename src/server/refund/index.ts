import { percentOf } from "@/lib/money";

export type TierLike = { hoursBefore: number; refundPercent: number };

/** 결제 완료 후 이 시간 안에 취소하면(이용 시작 전이라면) 항상 전액 환불 (PRD 1장). */
export const GRACE_MINUTES_AFTER_PAYMENT = 10;
const HOUR_MS = 60 * 60 * 1000;

export type RefundQuote = {
  /** 취소 가능 여부 (이용 시작 후에는 이용자가 취소할 수 없다) */
  cancellable: boolean;
  refundPercent: number;
  refundAmount: number;
  /** 화면 안내용 */
  reason: "grace" | "tier" | "started";
};

/**
 * cancellation_tiers 기반 환불액.
 * tiers 예: (48,100), (24,50), (0,0) → 이용 48시간 전까지 100%, 24시간 전까지 50%, 그 이후 0%.
 * 남은 시간이 hours_before 이상인 구간 중 hours_before가 가장 큰 구간을 쓴다. 맞는 구간이 없으면 0%.
 */
export function quoteRefund(args: {
  paidAmount: number;
  startAt: Date;
  approvedAt: Date | null;
  tiers: TierLike[];
  now: Date;
}): RefundQuote {
  const { paidAmount, startAt, approvedAt, tiers, now } = args;
  if (now.getTime() >= startAt.getTime()) {
    return { cancellable: false, refundPercent: 0, refundAmount: 0, reason: "started" };
  }
  if (approvedAt && now.getTime() - approvedAt.getTime() <= GRACE_MINUTES_AFTER_PAYMENT * 60 * 1000) {
    return { cancellable: true, refundPercent: 100, refundAmount: paidAmount, reason: "grace" };
  }
  const hoursLeft = (startAt.getTime() - now.getTime()) / HOUR_MS;
  const tier = [...tiers]
    .sort((a, b) => b.hoursBefore - a.hoursBefore)
    .find((t) => hoursLeft >= t.hoursBefore);
  const percent = tier?.refundPercent ?? 0;
  return { cancellable: true, refundPercent: percent, refundAmount: percentOf(paidAmount, percent), reason: "tier" };
}
