import { describe, expect, it } from "vitest";
import { quoteRefund } from "@/server/refund";

const tiers = [
  { hoursBefore: 48, refundPercent: 100 },
  { hoursBefore: 24, refundPercent: 50 },
  { hoursBefore: 0, refundPercent: 0 },
];
const H = 3600_000;
const start = new Date("2026-12-10T10:00:00Z");
const longAgo = new Date("2026-12-01T00:00:00Z");
const at = (hoursBefore: number) => new Date(start.getTime() - hoursBefore * H);

describe("quoteRefund", () => {
  it("applies the PRD default tiers", () => {
    expect(quoteRefund({ paidAmount: 45000, startAt: start, approvedAt: longAgo, tiers, now: at(72) })).toMatchObject({
      refundPercent: 100,
      refundAmount: 45000,
    });
    expect(quoteRefund({ paidAmount: 45000, startAt: start, approvedAt: longAgo, tiers, now: at(48) }).refundPercent).toBe(100);
    expect(quoteRefund({ paidAmount: 45000, startAt: start, approvedAt: longAgo, tiers, now: at(47.9) })).toMatchObject({
      refundPercent: 50,
      refundAmount: 22500,
    });
    expect(quoteRefund({ paidAmount: 45000, startAt: start, approvedAt: longAgo, tiers, now: at(23) })).toMatchObject({
      refundPercent: 0,
      refundAmount: 0,
      cancellable: true,
    });
  });

  it("floors fractional won", () => {
    expect(quoteRefund({ paidAmount: 15001, startAt: start, approvedAt: longAgo, tiers, now: at(30) }).refundAmount).toBe(7500);
  });

  it("refunds 100% within 10 minutes after payment if not started", () => {
    const now = at(2);
    const approvedAt = new Date(now.getTime() - 9 * 60_000);
    expect(quoteRefund({ paidAmount: 30000, startAt: start, approvedAt, tiers, now })).toMatchObject({
      refundPercent: 100,
      refundAmount: 30000,
      reason: "grace",
    });
    const late = new Date(now.getTime() - 11 * 60_000);
    expect(quoteRefund({ paidAmount: 30000, startAt: start, approvedAt: late, tiers, now }).refundPercent).toBe(0);
  });

  it("cannot be cancelled after start", () => {
    expect(quoteRefund({ paidAmount: 30000, startAt: start, approvedAt: longAgo, tiers, now: start })).toMatchObject({
      cancellable: false,
      refundAmount: 0,
    });
  });

  it("defaults to 0% when no tier matches", () => {
    expect(quoteRefund({ paidAmount: 30000, startAt: start, approvedAt: longAgo, tiers: [], now: at(100) }).refundPercent).toBe(0);
  });
});
