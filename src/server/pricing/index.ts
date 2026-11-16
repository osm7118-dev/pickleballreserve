import type { DayType } from "@prisma/client";
import { SLOT_MINUTES, kstWeekday } from "@/lib/time";

export type PriceRuleLike = { dayType: DayType; startMinute: number; endMinute: number; pricePer30min: number };

/**
 * 평일/주말 구분 (KST).
 * TODO(open-issue): 공휴일 가격(주말가 적용 여부)과 공휴일 데이터 소스가 정해지면 holiday를 반환한다.
 */
export function dayTypeOf(dateStr: string): DayType {
  const wd = kstWeekday(dateStr);
  return wd === 0 || wd === 6 ? "weekend" : "weekday";
}

export class PriceMissingError extends Error {
  constructor(public readonly minute: number) {
    super(`no price rule covers minute ${minute}`);
  }
}

/** 30분 슬롯 하나의 가격. 해당 시간대 가격이 없으면 null. */
export function slotPrice(rules: PriceRuleLike[], dayType: DayType, slotMinute: number): number | null {
  const rule = rules.find((r) => r.dayType === dayType && r.startMinute <= slotMinute && slotMinute < r.endMinute);
  return rule ? rule.pricePer30min : null;
}

/** [startMinute, endMinute) 의 슬롯별 가격 합계(원). 가격이 빈 슬롯이 있으면 PriceMissingError. */
export function priceForRange(
  rules: PriceRuleLike[],
  dateStr: string,
  startMinute: number,
  endMinute: number,
): number {
  const dayType = dayTypeOf(dateStr);
  let total = 0;
  for (let m = startMinute; m < endMinute; m += SLOT_MINUTES) {
    const p = slotPrice(rules, dayType, m);
    if (p === null) throw new PriceMissingError(m);
    total += p;
  }
  return total;
}
