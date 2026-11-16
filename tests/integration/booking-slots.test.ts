// PRD 4장: 예약을 30분 슬롯 행으로 쪼개고 UNIQUE(court_id, slot_start)로
// 동시 예약·중복 예약을 DB 레벨에서 막는다.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFacilityWithCourts, createUser, db, holdBooking, isUniqueViolation, kst, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("booking_slots UNIQUE(court_id, slot_start)", () => {
  it("rejects a second booking that overlaps an existing one on the same court", async () => {
    const facility = await createFacilityWithCourts();
    const court = facility.courts[0];
    const [alice, bob] = [await createUser(), await createUser()];

    await holdBooking({
      userId: alice.id, facilityId: facility.id, courtId: court.id,
      startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T20:30"),
    });

    // Overlaps only the last slot (20:00~20:30).
    const err = await holdBooking({
      userId: bob.id, facilityId: facility.id, courtId: court.id,
      startAt: kst("2026-12-01T20:00"), endAt: kst("2026-12-01T21:00"),
    }).catch((e: unknown) => e);

    expect(isUniqueViolation(err)).toBe(true);
    // The whole transaction rolled back: Bob has no half-created booking.
    expect(await db.booking.count({ where: { userId: bob.id } })).toBe(0);
    expect(await db.bookingSlot.count()).toBe(3);
  });

  it("allows the same time on a different court, and back-to-back bookings on the same court", async () => {
    const facility = await createFacilityWithCourts();
    const [a, b] = facility.courts;
    const user = await createUser();
    const base = { userId: user.id, facilityId: facility.id };

    await holdBooking({ ...base, courtId: a.id, startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T20:00") });
    await holdBooking({ ...base, courtId: b.id, startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T20:00") });
    await holdBooking({ ...base, courtId: a.id, startAt: kst("2026-12-01T20:00"), endAt: kst("2026-12-01T21:00") });

    expect(await db.bookingSlot.count()).toBe(6);
  });

  it("lets exactly one of many simultaneous requests for the same slots win", async () => {
    const facility = await createFacilityWithCourts();
    const court = facility.courts[0];
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));

    const results = await Promise.allSettled(
      users.map((u) =>
        holdBooking({
          userId: u.id, facilityId: facility.id, courtId: court.id,
          startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T20:30"),
        }),
      ),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(9);
    for (const r of lost) expect(isUniqueViolation(r.reason)).toBe(true);
    expect(await db.booking.count()).toBe(1);
    expect(await db.bookingSlot.count()).toBe(3);
  });

  it("frees the slots when the booking is deleted (cancel / hold expiry)", async () => {
    const facility = await createFacilityWithCourts();
    const court = facility.courts[0];
    const [alice, bob] = [await createUser(), await createUser()];
    const slot = { facilityId: facility.id, courtId: court.id, startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T20:00") };

    const held = await holdBooking({ ...slot, userId: alice.id });
    await db.booking.delete({ where: { id: held.id } });

    await expect(holdBooking({ ...slot, userId: bob.id })).resolves.toBeDefined();
  });

  it("rejects slot_start that is not on a 30-minute boundary", async () => {
    const facility = await createFacilityWithCourts();
    const user = await createUser();
    const booking = await holdBooking({
      userId: user.id, facilityId: facility.id, courtId: facility.courts[0].id,
      startAt: kst("2026-12-01T19:00"), endAt: kst("2026-12-01T19:30"),
    });

    await expect(
      db.bookingSlot.create({
        data: { bookingId: booking.id, courtId: facility.courts[1].id, slotStart: kst("2026-12-01T19:15") },
      }),
    ).rejects.toThrow(/booking_slots_30min_check/);
  });
});
