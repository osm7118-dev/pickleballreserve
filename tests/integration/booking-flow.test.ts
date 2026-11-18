import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "./helpers";
import { BookingError } from "@/server/booking/errors";
import { expireHolds, holdBooking } from "@/server/booking/hold";
import { cancelByFacility, cancelByUser, createManualBooking, markNoShow } from "@/server/booking/manage";
import { searchFacilities } from "@/server/booking/search";
import { approvePayment, startPayment } from "@/server/payment/service";
import { mockPaymentKey } from "@/server/payment/mock";
import { kstAt } from "@/lib/time";

const h = (x: number, m = 0) => x * 60 + m;
// 2026-12-01(화) 09:00 KST
const NOW = new Date("2026-12-01T00:00:00Z");
const DATE = "2026-12-02"; // 수요일
let seq = 0;

async function setup() {
  const f = await db.facility.create({
    data: {
      name: `시설 ${++seq}`,
      address: "서울 성동구",
      regionSido: "서울",
      regionSigungu: "성동구",
      status: "approved",
      phone: "0200000000",
      courts: { create: [{ name: "A코트", sortOrder: 0 }, { name: "B코트", sortOrder: 1 }] },
      operatingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: h(7), closeMinute: h(23) })) },
      priceRules: {
        create: [
          { dayType: "weekday", startMinute: h(7), endMinute: h(18), pricePer30min: 10000 },
          { dayType: "weekday", startMinute: h(18), endMinute: h(23), pricePer30min: 15000 },
          { dayType: "weekend", startMinute: h(7), endMinute: h(23), pricePer30min: 15000 },
        ],
      },
      bookingPolicy: { create: { advanceDays: 14, maxMinutesPerDay: 120, minMinutesPerBooking: 60, maxMinutesPerBooking: 120, holdMinutes: 10 } },
      cancellationTiers: {
        create: [
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 24, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      },
    },
    include: { courts: { orderBy: { sortOrder: "asc" } } },
  });
  const user = await db.user.create({ data: { kakaoId: `k-${++seq}`, name: "이용자", phone: "01011112222" } });
  const owner = await db.user.create({ data: { kakaoId: `k-${++seq}`, name: "사장님" } });
  await db.facilityStaff.create({ data: { facilityId: f.id, userId: owner.id } });
  return { f, court: f.courts[0], court2: f.courts[1], user, owner };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof BookingError) return e.code;
    throw e;
  }
};

describe("holdBooking — PRD 4장 검증 1~7단계", () => {
  beforeEach(resetDb);

  it("holds a booking with slots and a server-computed amount", async () => {
    const { f, court, user } = await setup();
    const b = await holdBooking({ userId: user.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(17), endMinute: h(19) }, NOW);
    expect(b.status).toBe("held");
    expect(b.totalAmount).toBe(2 * 10000 + 2 * 15000);
    expect(b.holdExpiresAt?.getTime()).toBe(NOW.getTime() + 10 * 60_000);
    expect(await db.bookingSlot.count({ where: { bookingId: b.id } })).toBe(4);
  });

  it("step 1: rejects off-boundary, outside hours, past and blacked-out times", async () => {
    const { f, court, user } = await setup();
    const base = { userId: user.id, facilityId: f.id, courtId: court.id, date: DATE };
    expect(await code(holdBooking({ ...base, startMinute: h(19, 15), endMinute: h(20, 15) }, NOW))).toBe("INVALID_TIME");
    // 예약 단위는 1시간: 30분 경계여도 정시가 아니면 거절
    expect(await code(holdBooking({ ...base, startMinute: h(19, 30), endMinute: h(20, 30) }, NOW))).toBe("INVALID_TIME");
    expect(await code(holdBooking({ ...base, startMinute: h(22), endMinute: h(24) }, NOW))).toBe("OUTSIDE_HOURS");
    expect(await code(holdBooking({ ...base, date: "2026-12-01", startMinute: h(7), endMinute: h(8) }, NOW))).toBe("PAST");
    await db.blackout.create({ data: { facilityId: f.id, courtId: null, startAt: kstAt(DATE, h(19, 30)), endAt: kstAt(DATE, h(20)) } });
    expect(await code(holdBooking({ ...base, startMinute: h(19), endMinute: h(20) }, NOW))).toBe("BLACKED_OUT");
  });

  it("step 2: enforces min/max minutes per booking", async () => {
    const { f, court, user } = await setup();
    const base = { userId: user.id, facilityId: f.id, courtId: court.id, date: DATE };
    await db.bookingPolicy.update({ where: { facilityId: f.id }, data: { minMinutesPerBooking: 120, maxMinutesPerBooking: 120 } });
    expect(await code(holdBooking({ ...base, startMinute: h(19), endMinute: h(20) }, NOW))).toBe("DURATION");
    expect(await code(holdBooking({ ...base, startMinute: h(19), endMinute: h(22) }, NOW))).toBe("DURATION");
  });

  it("step 3: only within advance_days", async () => {
    const { f, court, user } = await setup();
    const base = { userId: user.id, facilityId: f.id, courtId: court.id, startMinute: h(19), endMinute: h(20) };
    expect(await code(holdBooking({ ...base, date: "2026-12-15" }, NOW))).toBe("OK");
    expect(await code(holdBooking({ ...base, date: "2026-12-16" }, NOW))).toBe("TOO_FAR");
  });

  it("step 4: caps a user's minutes per facility per KST day (confirmed + live held)", async () => {
    const { f, court, court2, user } = await setup();
    await holdBooking({ userId: user.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(9), endMinute: h(11) }, NOW);
    expect(
      await code(holdBooking({ userId: user.id, facilityId: f.id, courtId: court2.id, date: DATE, startMinute: h(19), endMinute: h(20) }, NOW)),
    ).toBe("DAILY_LIMIT");
    // 다른 날은 괜찮다
    expect(
      await code(holdBooking({ userId: user.id, facilityId: f.id, courtId: court2.id, date: "2026-12-03", startMinute: h(19), endMinute: h(20) }, NOW)),
    ).toBe("OK");
    // 만료된 held 는 합계에서 빠진다
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect(
      await code(holdBooking({ userId: user.id, facilityId: f.id, courtId: court2.id, date: DATE, startMinute: h(19), endMinute: h(20) }, later)),
    ).toBe("OK");
  });

  it("step 5: blocked customers cannot book", async () => {
    const { f, court, user } = await setup();
    await db.facilityCustomer.create({ data: { facilityId: f.id, userId: user.id, isBlocked: true } });
    expect(
      await code(holdBooking({ userId: user.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(20) }, NOW)),
    ).toBe("BLOCKED");
  });

  it("step 6: DB unique constraint stops double booking; expired holds are cleared first", async () => {
    const { f, court, user } = await setup();
    const other = await db.user.create({ data: { kakaoId: "other", phone: "01033334444" } });
    await holdBooking({ userId: user.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(20) }, NOW);
    expect(
      await code(holdBooking({ userId: other.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(21) }, NOW)),
    ).toBe("SLOT_TAKEN");
    const later = new Date(NOW.getTime() + 10 * 60_000 + 1);
    const b = await holdBooking({ userId: other.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(21) }, later);
    expect(b.status).toBe("held");
    const expired = await db.booking.findFirstOrThrow({ where: { userId: user.id } });
    expect(expired.status).toBe("cancelled");
  });

  it("concurrent holds on the same slot: exactly one wins", async () => {
    const { f, court } = await setup();
    const users = await Promise.all(
      Array.from({ length: 8 }, (_, i) => db.user.create({ data: { kakaoId: `c-${i}-${++seq}`, phone: "01000000000" } })),
    );
    const results = await Promise.all(
      users.map((u) => code(holdBooking({ userId: u.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(20) }, NOW))),
    );
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "SLOT_TAKEN")).toHaveLength(7);
    expect(await db.bookingSlot.count({ where: { courtId: court.id } })).toBe(2);
  });

  it("expireHolds cron releases slots", async () => {
    const { f, court, user } = await setup();
    await holdBooking({ userId: user.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(20) }, NOW);
    expect(await expireHolds(NOW)).toBe(0);
    expect(await expireHolds(new Date(NOW.getTime() + 10 * 60_000))).toBe(1);
    expect(await db.bookingSlot.count()).toBe(0);
  });
});

describe("payment (mock) → confirm → cancel", () => {
  beforeEach(resetDb);

  async function heldBooking() {
    const ctx = await setup();
    const b = await holdBooking(
      { userId: ctx.user.id, facilityId: ctx.f.id, courtId: ctx.court.id, date: DATE, startMinute: h(19), endMinute: h(21) },
      NOW,
    );
    return { ...ctx, b };
  }

  it("approves once (idempotent by order_id) and confirms the booking", async () => {
    const { b, user, f } = await heldBooking();
    const p = await startPayment({ bookingId: b.id, userId: user.id, now: NOW });
    expect(p.amount).toBe(60000);
    expect((await startPayment({ bookingId: b.id, userId: user.id, now: NOW })).id).toBe(p.id);
    const key = mockPaymentKey("카드");
    const first = await approvePayment({ orderId: p.orderId, paymentKey: key, amount: 60000, userId: user.id, now: NOW });
    const second = await approvePayment({ orderId: p.orderId, paymentKey: key, amount: 60000, userId: user.id, now: NOW });
    expect(first.alreadyDone).toBe(false);
    expect(second.alreadyDone).toBe(true);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("confirmed");
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("done");
    const fc = await db.facilityCustomer.findUniqueOrThrow({ where: { facilityId_userId: { facilityId: f.id, userId: user.id } } });
    expect(fc.visitCount).toBe(1);
    expect(await db.notification.count({ where: { bookingId: b.id } })).toBe(2);
  });

  it("refuses a tampered amount", async () => {
    const { b, user } = await heldBooking();
    const p = await startPayment({ bookingId: b.id, userId: user.id, now: NOW });
    expect(await code(approvePayment({ orderId: p.orderId, paymentKey: mockPaymentKey("카드"), amount: 100, userId: user.id, now: NOW }))).toBe(
      "AMOUNT_MISMATCH",
    );
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("held");
  });

  it("refuses to approve after the hold expired", async () => {
    const { b, user } = await heldBooking();
    const p = await startPayment({ bookingId: b.id, userId: user.id, now: NOW });
    const late = new Date(NOW.getTime() + 10 * 60_000);
    expect(await code(approvePayment({ orderId: p.orderId, paymentKey: mockPaymentKey("카드"), amount: 60000, userId: user.id, now: late }))).toBe(
      "HOLD_EXPIRED",
    );
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("ready");
  });

  it("user cancel applies tiers, records a partial refund and frees the slots", async () => {
    const { b, user } = await heldBooking();
    const p = await startPayment({ bookingId: b.id, userId: user.id, now: NOW });
    await approvePayment({ orderId: p.orderId, paymentKey: mockPaymentKey("간편결제"), amount: 60000, userId: user.id, now: NOW });
    // 결제 직후 grace 를 피하려고 approved_at 을 과거로 둔다. 이용(12/2 19:00 KST) 30시간 전 → 50%
    await db.payment.update({ where: { id: p.id }, data: { approvedAt: new Date("2026-11-30T00:00:00Z") } });
    const now = new Date(kstAt(DATE, h(19)).getTime() - 30 * 3600_000);
    const res = await cancelByUser({ bookingId: b.id, userId: user.id, now });
    expect(res.refundAmount).toBe(30000);
    expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("cancelled");
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("partial_cancelled");
    expect(await db.refund.count({ where: { paymentId: p.id, reason: "user_cancel", amount: 30000 } })).toBe(1);
    expect(await db.bookingSlot.count({ where: { bookingId: b.id } })).toBe(0);
    expect(await code(cancelByUser({ bookingId: b.id, userId: user.id, now }))).toBe("NOT_CANCELLABLE");
  });

  it("facility cancel refunds 100%; no-show only on the day", async () => {
    const { b, user, owner, f, court2 } = await heldBooking();
    const p = await startPayment({ bookingId: b.id, userId: user.id, now: NOW });
    await approvePayment({ orderId: p.orderId, paymentKey: mockPaymentKey("카드"), amount: 60000, userId: user.id, now: NOW });

    expect(await code(markNoShow({ bookingId: b.id, staffUserId: owner.id, now: NOW }))).toBe("NOT_CANCELLABLE");
    expect(await code(cancelByFacility({ bookingId: b.id, staffUserId: user.id, now: NOW }))).toBe("FORBIDDEN");
    await cancelByFacility({ bookingId: b.id, staffUserId: owner.id, now: NOW });
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("cancelled");

    const b2 = await holdBooking({ userId: user.id, facilityId: f.id, courtId: court2.id, date: DATE, startMinute: h(9), endMinute: h(10) }, NOW);
    const p2 = await startPayment({ bookingId: b2.id, userId: user.id, now: NOW });
    await approvePayment({ orderId: p2.orderId, paymentKey: mockPaymentKey("카드"), amount: b2.totalAmount, userId: user.id, now: NOW });
    await markNoShow({ bookingId: b2.id, staffUserId: owner.id, now: kstAt(DATE, h(10)) });
    expect((await db.booking.findUniqueOrThrow({ where: { id: b2.id } })).status).toBe("no_show");
    const fc = await db.facilityCustomer.findUniqueOrThrow({ where: { facilityId_userId: { facilityId: f.id, userId: user.id } } });
    expect(fc.noShowCount).toBe(1);
  });
});

describe("operator manual booking & search", () => {
  beforeEach(resetDb);

  it("manual booking is confirmed, priced, and blocks the slot for app users", async () => {
    const { f, court, user, owner } = await setup();
    const m = await createManualBooking({
      staffUserId: owner.id,
      facilityId: f.id,
      courtId: court.id,
      date: DATE,
      startMinute: h(19),
      endMinute: h(20),
      guestName: "전화 손님",
      guestPhone: null,
      now: NOW,
    });
    expect(m).toMatchObject({ status: "confirmed", source: "manual", totalAmount: 30000, userId: null });
    expect(
      await code(holdBooking({ userId: user.id, facilityId: f.id, courtId: court.id, date: DATE, startMinute: h(19), endMinute: h(20) }, NOW)),
    ).toBe("SLOT_TAKEN");
    expect(
      await code(
        createManualBooking({
          staffUserId: user.id,
          facilityId: f.id,
          courtId: court.id,
          date: DATE,
          startMinute: h(9),
          endMinute: h(10),
          guestName: "x",
          guestPhone: null,
          now: NOW,
        }),
      ),
    ).toBe("FORBIDDEN");
  });

  it("search returns facilities with at least one fully free court", async () => {
    const { f, court, court2, owner } = await setup();
    const q = { sido: "서울", sigungu: "성동구", date: DATE, startMinute: h(19), minutes: 120 };
    expect((await searchFacilities(q, NOW))[0]).toMatchObject({ facilityId: f.id, freeCourts: 2, price: 60000 });
    for (const c of [court, court2]) {
      await createManualBooking({
        staffUserId: owner.id, facilityId: f.id, courtId: c.id, date: DATE,
        startMinute: h(20), endMinute: h(21), guestName: "손님", guestPhone: null, now: NOW,
      });
    }
    expect(await searchFacilities(q, NOW)).toHaveLength(0);
    expect(await searchFacilities({ ...q, minutes: 30 }, NOW)).toHaveLength(0); // 최소 이용시간 미만
  });
});
