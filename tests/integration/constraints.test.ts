// CHECK / EXCLUDE / UNIQUE constraints from prisma/migrations/*_constraints.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFacilityWithCourts, createUser, db, isUniqueViolation, kst, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const h = (hour: number, minute = 0) => hour * 60 + minute;

describe("operating_hours", () => {
  it("accepts 30-minute multiples up to midnight (24:00)", async () => {
    const f = await createFacilityWithCourts(1);
    await expect(
      db.operatingHour.create({ data: { facilityId: f.id, weekday: 1, openMinute: h(6, 30), closeMinute: h(24) } }),
    ).resolves.toBeDefined();
  });

  it("rejects times that are not 30-minute multiples", async () => {
    const f = await createFacilityWithCourts(1);
    await expect(
      db.operatingHour.create({ data: { facilityId: f.id, weekday: 1, openMinute: h(7, 15), closeMinute: h(22) } }),
    ).rejects.toThrow(/operating_hours_30min_check/);
  });

  it("rejects close <= open and an invalid weekday", async () => {
    const f = await createFacilityWithCourts(1);
    await expect(
      db.operatingHour.create({ data: { facilityId: f.id, weekday: 1, openMinute: h(22), closeMinute: h(7) } }),
    ).rejects.toThrow(/operating_hours_range_check/);
    await expect(
      db.operatingHour.create({ data: { facilityId: f.id, weekday: 7, openMinute: h(7), closeMinute: h(22) } }),
    ).rejects.toThrow(/operating_hours_weekday_check/);
  });

  it("allows only one row per facility and weekday", async () => {
    const f = await createFacilityWithCourts(1);
    await db.operatingHour.create({ data: { facilityId: f.id, weekday: 1, openMinute: h(7), closeMinute: h(22) } });
    const err = await db.operatingHour
      .create({ data: { facilityId: f.id, weekday: 1, openMinute: h(8), closeMinute: h(20) } })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });
});

describe("price_rules", () => {
  it("rejects overlapping time ranges for the same facility and day type", async () => {
    const f = await createFacilityWithCourts(1);
    await db.priceRule.create({
      data: { facilityId: f.id, dayType: "weekday", startMinute: h(7), endMinute: h(18), pricePer30min: 10000 },
    });
    await expect(
      db.priceRule.create({
        data: { facilityId: f.id, dayType: "weekday", startMinute: h(17), endMinute: h(23), pricePer30min: 15000 },
      }),
    ).rejects.toThrow(/price_rules_no_overlap/);
  });

  it("allows adjacent ranges, other day types and other facilities", async () => {
    const f = await createFacilityWithCourts(1);
    const g = await createFacilityWithCourts(1);
    await db.priceRule.createMany({
      data: [
        { facilityId: f.id, dayType: "weekday", startMinute: h(7), endMinute: h(18), pricePer30min: 10000 },
        { facilityId: f.id, dayType: "weekday", startMinute: h(18), endMinute: h(23), pricePer30min: 15000 },
        { facilityId: f.id, dayType: "weekend", startMinute: h(7), endMinute: h(23), pricePer30min: 15000 },
        { facilityId: g.id, dayType: "weekday", startMinute: h(7), endMinute: h(23), pricePer30min: 12000 },
      ],
    });
    expect(await db.priceRule.count()).toBe(4);
  });

  it("rejects negative prices", async () => {
    const f = await createFacilityWithCourts(1);
    await expect(
      db.priceRule.create({
        data: { facilityId: f.id, dayType: "weekday", startMinute: h(7), endMinute: h(18), pricePer30min: -1 },
      }),
    ).rejects.toThrow(/price_rules_price_check/);
  });
});

describe("booking_policies and cancellation_tiers", () => {
  it("rejects min > max booking minutes and non-30-minute values", async () => {
    const f = await createFacilityWithCourts(1);
    await expect(
      db.bookingPolicy.create({
        data: { facilityId: f.id, minMinutesPerBooking: 120, maxMinutesPerBooking: 60, maxMinutesPerDay: 120 },
      }),
    ).rejects.toThrow(/booking_policies_minutes_range_check/);
    await expect(
      db.bookingPolicy.create({
        data: { facilityId: f.id, minMinutesPerBooking: 45, maxMinutesPerBooking: 120, maxMinutesPerDay: 120 },
      }),
    ).rejects.toThrow(/booking_policies_minutes_30min_check/);
  });

  it("uses the PRD defaults (14 days, 120 min/day, 60~120 min, 10 min hold)", async () => {
    const f = await createFacilityWithCourts(1);
    const p = await db.bookingPolicy.create({ data: { facilityId: f.id } });
    expect(p).toMatchObject({
      advanceDays: 14, maxMinutesPerDay: 120, minMinutesPerBooking: 60, maxMinutesPerBooking: 120, holdMinutes: 10,
    });
  });

  it("rejects refund_percent outside 0~100", async () => {
    const f = await createFacilityWithCourts(1);
    await expect(
      db.cancellationTier.create({ data: { facilityId: f.id, hoursBefore: 48, refundPercent: 110 } }),
    ).rejects.toThrow(/cancellation_tiers_percent_check/);
  });
});

describe("bookings", () => {
  async function base() {
    const f = await createFacilityWithCourts(1);
    const user = await createUser();
    return {
      bookingNo: `B-${Math.random()}`,
      userId: user.id as string | null,
      facilityId: f.id,
      courtId: f.courts[0].id,
      startAt: kst("2026-12-01T19:00"),
      endAt: kst("2026-12-01T20:00"),
      totalAmount: 20000,
      status: "confirmed" as const,
      source: "app" as const,
    };
  }

  it("rejects start/end that are not on a 30-minute boundary", async () => {
    const data = await base();
    await expect(db.booking.create({ data: { ...data, startAt: kst("2026-12-01T19:10") } })).rejects.toThrow(
      /bookings_30min_check/,
    );
  });

  it("requires hold_expires_at while held", async () => {
    const data = await base();
    await expect(db.booking.create({ data: { ...data, status: "held" } })).rejects.toThrow(
      /bookings_held_expiry_check/,
    );
  });

  it("requires a user for app bookings and a guest name for manual bookings without a user", async () => {
    const data = await base();
    await expect(db.booking.create({ data: { ...data, userId: null } })).rejects.toThrow(/bookings_app_user_check/);
    await expect(db.booking.create({ data: { ...data, userId: null, source: "manual" } })).rejects.toThrow(
      /bookings_manual_guest_check/,
    );
    await expect(
      db.booking.create({ data: { ...data, userId: null, source: "manual", guestName: "전화 예약 손님" } }),
    ).resolves.toBeDefined();
  });

  it("rejects negative amounts", async () => {
    const data = await base();
    await expect(db.booking.create({ data: { ...data, totalAmount: -100 } })).rejects.toThrow(/bookings_amount_check/);
  });
});

describe("payments", () => {
  it("must belong to exactly one of booking or open-play participant", async () => {
    const user = await createUser();
    await expect(
      db.payment.create({ data: { orderId: "order-1", userId: user.id, amount: 10000 } }),
    ).rejects.toThrow(/payments_target_check/);
  });

  it("rejects a duplicate order_id (idempotency key)", async () => {
    const f = await createFacilityWithCourts(1);
    const user = await createUser();
    const booking = await db.booking.create({
      data: {
        bookingNo: "B-1", userId: user.id, facilityId: f.id, courtId: f.courts[0].id,
        startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T20:00"),
        totalAmount: 20000, status: "confirmed", source: "app",
      },
    });
    await db.payment.create({ data: { orderId: "order-1", bookingId: booking.id, userId: user.id, amount: 20000 } });
    const err = await db.payment
      .create({ data: { orderId: "order-1", bookingId: booking.id, userId: user.id, amount: 20000 } })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });
});

describe("open play", () => {
  it("allows one participant row per session and user", async () => {
    const f = await createFacilityWithCourts(2);
    const user = await createUser();
    const session = await db.openPlaySession.create({
      data: {
        facilityId: f.id, courtIds: f.courts.map((c) => c.id), title: "저녁 오픈플레이",
        startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T21:00"), capacity: 8, fee: 10000,
      },
    });
    await db.openPlayParticipant.create({ data: { sessionId: session.id, userId: user.id } });
    const err = await db.openPlayParticipant
      .create({ data: { sessionId: session.id, userId: user.id } })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("links court bookings with source=open_play to their session", async () => {
    const f = await createFacilityWithCourts(1);
    const data = {
      bookingNo: "B-op", facilityId: f.id, courtId: f.courts[0].id,
      startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T21:00"),
      totalAmount: 0, status: "confirmed" as const, source: "open_play" as const,
    };
    await expect(db.booking.create({ data })).rejects.toThrow(/bookings_open_play_session_check/);
  });
});
