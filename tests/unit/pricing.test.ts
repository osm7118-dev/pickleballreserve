import { describe, expect, it } from "vitest";
import { PriceMissingError, dayTypeOf, priceForRange, type PriceRuleLike } from "@/server/pricing";

const h = (x: number) => x * 60;
const rules: PriceRuleLike[] = [
  { dayType: "weekday", startMinute: h(7), endMinute: h(18), pricePer30min: 10000 },
  { dayType: "weekday", startMinute: h(18), endMinute: h(23), pricePer30min: 15000 },
  { dayType: "weekend", startMinute: h(8), endMinute: h(22), pricePer30min: 15000 },
];

describe("pricing", () => {
  it("classifies weekday/weekend in KST", () => {
    expect(dayTypeOf("2026-11-18")).toBe("weekday"); // Wed
    expect(dayTypeOf("2026-11-21")).toBe("weekend"); // Sat
    expect(dayTypeOf("2026-11-22")).toBe("weekend"); // Sun
  });

  it("sums per-slot prices across a rule boundary", () => {
    // 17:00~19:00 weekday: 2 slots × 10,000 + 2 slots × 15,000
    expect(priceForRange(rules, "2026-11-18", h(17), h(19))).toBe(50000);
    expect(priceForRange(rules, "2026-11-18", h(19), h(20) + 30)).toBe(45000);
  });

  it("uses weekend prices on weekends", () => {
    expect(priceForRange(rules, "2026-11-21", h(10), h(11))).toBe(30000);
  });

  it("refuses ranges with no price", () => {
    expect(() => priceForRange(rules, "2026-11-21", h(7), h(9))).toThrow(PriceMissingError);
  });

  it("returns integer won", () => {
    expect(Number.isInteger(priceForRange(rules, "2026-11-18", h(7), h(23)))).toBe(true);
  });
});
