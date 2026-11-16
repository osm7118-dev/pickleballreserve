import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "./helpers";
import { BookingError } from "@/server/booking/errors";
import { cancelOpenPlayByUser, getOpenPlaySession, startOpenPlayPayment } from "@/server/open-play";
import { cancelLessonByUser, holdLesson, lessonStartsFor, startLessonPayment } from "@/server/lesson";
import { approvePayment } from "@/server/payment/service";
import { mockPaymentKey } from "@/server/payment/mock";
import { kstAt } from "@/lib/time";

const h = (x: number, m = 0) => x * 60 + m;
const NOW = new Date("2026-12-01T00:00:00Z"); // 12/1(화) 09:00 KST
const DATE = "2026-12-02"; // 수
let seq = 0;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    if (e instanceof BookingError) return e.code;
    throw e;
  }
};

async function facility() {
  return db.facility.create({
    data: {
      name: `시설 ${++seq}`,
      address: "서울",
      regionSido: "서울",
      regionSigungu: "성동구",
      status: "approved",
      courts: { create: [{ name: "A코트" }] },
      cancellationTiers: {
        create: [
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 24, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      },
    },
    include: { courts: true },
  });
}
const newUser = () => db.user.create({ data: { kakaoId: `u-${++seq}`, name: "이용자", phone: "01011112222" } });

async function pay(orderId: string, amount: number, userId: string, now = NOW) {
  return approvePayment({ orderId, paymentKey: mockPaymentKey("카드"), amount, userId, now });
}

describe("open play", () => {
  beforeEach(resetDb);

  async function session(capacity: number) {
    const f = await facility();
    return db.openPlaySession.create({
      data: {
        facilityId: f.id,
        courtIds: [f.courts[0].id],
        title: "오픈플레이",
        startAt: kstAt(DATE, h(20)),
        endAt: kstAt(DATE, h(22)),
        capacity,
        fee: 15000,
      },
    });
  }

  it("joins after payment, refuses double join and full sessions", async () => {
    const s = await session(1);
    const [a, b] = [await newUser(), await newUser()];
    const pa = await startOpenPlayPayment({ sessionId: s.id, userId: a.id, now: NOW });
    expect(pa.amount).toBe(15000);
    // b 도 결제창까지는 들어갈 수 있다 (아직 확정 0명)
    const pb = await startOpenPlayPayment({ sessionId: s.id, userId: b.id, now: NOW });
    expect((await pay(pa.orderId, 15000, a.id)).kind).toBe("open_play");
    expect((await getOpenPlaySession(s.id, a.id))?.joined).toBe(1);
    expect(await code(startOpenPlayPayment({ sessionId: s.id, userId: a.id, now: NOW }))).toBe("ALREADY_JOINED");
    // 정원이 찬 뒤 b 의 승인은 자동 취소된다
    expect(await code(pay(pb.orderId, 15000, b.id))).toBe("FULL");
    expect((await db.payment.findUniqueOrThrow({ where: { id: pb.id } })).status).toBe("cancelled");
    expect((await getOpenPlaySession(s.id, b.id))?.mine).toBeNull();
    expect(await code(startOpenPlayPayment({ sessionId: s.id, userId: b.id, now: NOW }))).toBe("FULL");
  });

  it("concurrent approvals never exceed capacity", async () => {
    const s = await session(2);
    const users = await Promise.all(Array.from({ length: 5 }, () => newUser()));
    const payments = [];
    for (const u of users) payments.push(await startOpenPlayPayment({ sessionId: s.id, userId: u.id, now: NOW }));
    const results = await Promise.all(payments.map((p, i) => code(pay(p.orderId, 15000, users[i].id))));
    expect(results.filter((r) => r === "OK")).toHaveLength(2);
    expect((await getOpenPlaySession(s.id, null))?.joined).toBe(2);
  });

  it("cancel refunds by tiers and frees the seat", async () => {
    const s = await session(1);
    const a = await newUser();
    const pa = await startOpenPlayPayment({ sessionId: s.id, userId: a.id, now: NOW });
    await pay(pa.orderId, 15000, a.id);
    await db.payment.update({ where: { id: pa.id }, data: { approvedAt: new Date("2026-11-30T00:00:00Z") } });
    const now = new Date(kstAt(DATE, h(20)).getTime() - 30 * 3600_000); // 30시간 전 → 50%
    expect((await cancelOpenPlayByUser({ sessionId: s.id, userId: a.id, now })).refundAmount).toBe(7500);
    expect((await db.payment.findUniqueOrThrow({ where: { id: pa.id } })).status).toBe("partial_cancelled");
    expect((await getOpenPlaySession(s.id, null))?.joined).toBe(0);
    // 다시 참가 가능
    const again = await startOpenPlayPayment({ sessionId: s.id, userId: a.id, now });
    await pay(again.orderId, 15000, a.id, now);
    expect((await getOpenPlaySession(s.id, a.id))?.mine?.paymentId).toBe(again.id);
  });
});

describe("private lessons", () => {
  beforeEach(resetDb);

  async function coach() {
    const f = await facility();
    return db.coach.create({
      data: {
        facilityId: f.id,
        name: "김코치",
        lessonMinutes: 60,
        lessonPrice: 60000,
        availabilities: { create: [{ weekday: 3, startMinute: h(10), endMinute: h(13) }] }, // 수 10~13시
      },
    });
  }

  it("lists start times inside availability and hides taken ones", async () => {
    const c = await coach();
    const u = await newUser();
    expect((await lessonStartsFor(c.id, DATE, NOW)).starts.map((s) => s.minute)).toEqual([h(10), h(10, 30), h(11), h(11, 30), h(12)]);
    await holdLesson({ userId: u.id, coachId: c.id, date: DATE, startMinute: h(11) }, NOW);
    const free = (await lessonStartsFor(c.id, DATE, NOW)).starts.filter((s) => s.free).map((s) => s.minute);
    expect(free).toEqual([h(10), h(12)]);
    expect((await lessonStartsFor(c.id, "2026-12-03", NOW)).starts).toEqual([]); // 목요일은 없음
  });

  it("rejects times outside availability and overlapping lessons (DB EXCLUDE)", async () => {
    const c = await coach();
    const [a, b] = [await newUser(), await newUser()];
    expect(await code(holdLesson({ userId: a.id, coachId: c.id, date: DATE, startMinute: h(12, 30) }, NOW))).toBe("COACH_UNAVAILABLE");
    expect(await code(holdLesson({ userId: a.id, coachId: c.id, date: "2026-12-03", startMinute: h(10) }, NOW))).toBe("COACH_UNAVAILABLE");
    await holdLesson({ userId: a.id, coachId: c.id, date: DATE, startMinute: h(10) }, NOW);
    expect(await code(holdLesson({ userId: b.id, coachId: c.id, date: DATE, startMinute: h(10, 30) }, NOW))).toBe("SLOT_TAKEN");
    // 선점이 만료되면 다른 사람이 잡을 수 있다
    const later = new Date(NOW.getTime() + 10 * 60_000);
    expect(await code(holdLesson({ userId: b.id, coachId: c.id, date: DATE, startMinute: h(10, 30) }, later))).toBe("OK");
  });

  it("concurrent holds on the same coach time: exactly one wins", async () => {
    const c = await coach();
    const users = await Promise.all(Array.from({ length: 6 }, () => newUser()));
    const results = await Promise.all(users.map((u) => code(holdLesson({ userId: u.id, coachId: c.id, date: DATE, startMinute: h(10) }, NOW))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "SLOT_TAKEN")).toHaveLength(5);
  });

  it("pays, confirms, and cancels with a tiered refund", async () => {
    const c = await coach();
    const u = await newUser();
    const lb = await holdLesson({ userId: u.id, coachId: c.id, date: DATE, startMinute: h(10) }, NOW);
    expect(lb.amount).toBe(60000);
    const p = await startLessonPayment({ lessonId: lb.id, userId: u.id, now: NOW });
    expect(await code(pay(p.orderId, 1000, u.id))).toBe("AMOUNT_MISMATCH");
    const p2 = await startLessonPayment({ lessonId: lb.id, userId: u.id, now: NOW });
    expect((await pay(p2.orderId, 60000, u.id)).kind).toBe("lesson");
    expect((await pay(p2.orderId, 60000, u.id)).alreadyDone).toBe(true);
    expect((await db.lessonBooking.findUniqueOrThrow({ where: { id: lb.id } })).status).toBe("confirmed");

    // 결제 직후(10분 이내)는 전액 환불
    const res = await cancelLessonByUser({ lessonId: lb.id, userId: u.id, now: new Date(Date.now() + 60_000) });
    expect(res.refundAmount).toBe(60000);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p2.id } })).status).toBe("cancelled");
    expect(await code(cancelLessonByUser({ lessonId: lb.id, userId: u.id, now: NOW }))).toBe("NOT_CANCELLABLE");
  });

  it("refuses to approve an expired lesson hold", async () => {
    const c = await coach();
    const u = await newUser();
    const lb = await holdLesson({ userId: u.id, coachId: c.id, date: DATE, startMinute: h(10) }, NOW);
    const p = await startLessonPayment({ lessonId: lb.id, userId: u.id, now: NOW });
    expect(await code(pay(p.orderId, 60000, u.id, new Date(NOW.getTime() + 10 * 60_000)))).toBe("HOLD_EXPIRED");
  });
});
