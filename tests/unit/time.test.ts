import { describe, expect, it } from "vitest";
import { addDays, isDateStr, kstAt, kstDateStr, kstMinuteOfDay, kstWeekday, minuteLabel, slotStartsOf } from "@/lib/time";

describe("time (KST)", () => {
  it("converts KST wall clock to UTC instant", () => {
    expect(kstAt("2026-12-01", 19 * 60).toISOString()).toBe("2026-12-01T10:00:00.000Z");
    expect(kstAt("2026-12-01", 0).toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(kstAt("2026-12-01", 1440).toISOString()).toBe("2026-12-01T15:00:00.000Z");
  });

  it("uses Asia/Seoul for 'same day'", () => {
    // 2026-12-01 23:30 UTC = 2026-12-02 08:30 KST
    const d = new Date("2026-12-01T23:30:00Z");
    expect(kstDateStr(d)).toBe("2026-12-02");
    expect(kstMinuteOfDay(d)).toBe(8 * 60 + 30);
  });

  it("weekday and date arithmetic", () => {
    expect(kstWeekday("2026-11-22")).toBe(0); // Sunday
    expect(kstWeekday("2026-11-21")).toBe(6);
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 14)).toBe("2027-01-14");
    expect(addDays("2026-12-01", -1)).toBe("2026-11-30");
  });

  it("validates date strings", () => {
    expect(isDateStr("2026-02-29")).toBe(false);
    expect(isDateStr("2028-02-29")).toBe(true);
    expect(isDateStr("2026-1-01")).toBe(false);
  });

  it("splits a range into 30-minute slots", () => {
    const slots = slotStartsOf(kstAt("2026-12-01", 1140), kstAt("2026-12-01", 1230));
    expect(slots.map((s) => kstMinuteOfDay(s))).toEqual([1140, 1170, 1200]);
    expect(minuteLabel(1230)).toBe("20:30");
  });
});
