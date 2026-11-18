import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "./helpers";
import { getClubTimeline } from "@/server/club/timeline";
import { kstAt } from "@/lib/time";

const h = (x: number) => x * 60;
const NOW = new Date("2026-12-01T00:00:00Z"); // 12/1(화) 09:00 KST
const DATE = "2026-12-02"; // 수

async function setup() {
  const f = await db.facility.create({
    data: {
      name: "타임라인 시설",
      address: "서울",
      regionSido: "서울",
      regionSigungu: "영등포구",
      status: "approved",
      courts: { create: [{ name: "A코트" }] },
      operatingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: h(7), closeMinute: h(23) })) },
      priceRules: { create: [{ dayType: "weekday", startMinute: h(7), endMinute: h(23), pricePer30min: 10000 }] },
    },
    include: { courts: true },
  });
  const user = await db.user.create({ data: { kakaoId: "tl-user", name: "나" } });
  return { f, court: f.courts[0], user };
}

async function book(facilityId: string, courtId: string, start: number, end: number, extra: { userId?: string; source?: "app" | "manual" | "open_play"; openPlaySessionId?: string } = {}) {
  const startAt = kstAt(DATE, start);
  const endAt = kstAt(DATE, end);
  const slots: Date[] = [];
  for (let t = startAt.getTime(); t < endAt.getTime(); t += 30 * 60_000) slots.push(new Date(t));
  return db.booking.create({
    data: {
      bookingNo: `TL-${start}`,
      facilityId,
      courtId,
      startAt,
      endAt,
      totalAmount: 0,
      status: "confirmed",
      source: extra.source ?? "manual",
      guestName: (extra.source ?? "manual") === "manual" ? "손님" : null,
      userId: extra.userId,
      openPlaySessionId: extra.openPlaySessionId,
      slots: { create: slots.map((slotStart) => ({ courtId, slotStart })) },
    },
  });
}

describe("U18 club timeline", () => {
  beforeEach(resetDb);

  it("shows 06~23 in 1-hour rows: open play block, my booking, closed and open hours", async () => {
    const { f, court, user } = await setup();
    const s = await db.openPlaySession.create({
      data: { facilityId: f.id, courtIds: [court.id], title: "오픈플레이", startAt: kstAt(DATE, h(10)), endAt: kstAt(DATE, h(12)), capacity: 8, fee: 10000 },
    });
    await book(f.id, court.id, h(10), h(12), { source: "open_play", openPlaySessionId: s.id });
    await book(f.id, court.id, h(14), h(15));
    await book(f.id, court.id, h(19), h(21), { userId: user.id, source: "app" });

    const rows = await getClubTimeline(f.id, DATE, user.id, NOW);
    const at = (m: number) => rows.find((r) => r.minute === m);
    expect(rows[0].minute).toBe(h(6));
    expect(rows.reduce((sum, r) => sum + r.span, 0)).toBe(17); // 06~23
    expect(at(h(6))?.kind).toBe("closed"); // 운영 전
    expect(at(h(7))?.kind).toBe("open");
    expect(at(h(10))).toMatchObject({ kind: "open_play", span: 2, joined: 0, capacity: 8 });
    expect(at(h(11))).toBeUndefined(); // 오픈플레이 블록에 묶임
    expect(at(h(14))?.kind).toBe("closed"); // 다른 사람 예약
    expect(at(h(19))).toMatchObject({ kind: "mine", span: 2 });
    expect(at(h(22))?.kind).toBe("open");
  });
});
