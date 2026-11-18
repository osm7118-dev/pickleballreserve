import { db } from "@/lib/db";
import { kstAt, kstMinuteOfDay } from "@/lib/time";
import { getFacilityDay, hourCellState } from "@/server/booking/schedule";
import { PAID_JOINED } from "@/server/open-play";

/** U18 캘린더 하루 시간표 범위: 06:00 ~ 23:00 */
export const TIMELINE_START = 6 * 60;
export const TIMELINE_END = 23 * 60;

export type TimelineRow =
  | { kind: "open_play"; minute: number; span: number; sessionId: string; title: string; joined: number; capacity: number; fee: number }
  | { kind: "mine"; minute: number; span: number; href: string }
  | { kind: "closed"; minute: number; span: 1 }
  | { kind: "open"; minute: number; span: 1 };

/**
 * 내 매장 하루를 1시간 칸으로: 오픈플레이(여러 칸 묶음) / 내 예약 / 마감(예약·차단·지난 시간·운영 외) / 대여·레슨 가능.
 * 코트가 여러 면이면 한 면이라도 비어 있을 때 "가능"으로 본다.
 */
export async function getClubTimeline(facilityId: string, date: string, userId: string | null, now: Date = new Date()) {
  const dayStart = kstAt(date, 0);
  const dayEnd = kstAt(date, 24 * 60);
  const [day, sessions, mine] = await Promise.all([
    getFacilityDay(facilityId, date, now),
    db.openPlaySession.findMany({
      where: { facilityId, status: "open", startAt: { gte: dayStart, lt: dayEnd } },
      include: { _count: { select: { participants: { where: PAID_JOINED } } } },
      orderBy: { startAt: "asc" },
    }),
    userId
      ? db.booking.findMany({
          where: {
            userId,
            facilityId,
            startAt: { gte: dayStart, lt: dayEnd },
            OR: [{ status: "confirmed" }, { status: "held", holdExpiresAt: { gt: now } }],
          },
          orderBy: { startAt: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const rows: TimelineRow[] = [];
  let m = TIMELINE_START;
  while (m < TIMELINE_END) {
    const s = sessions.find((x) => kstMinuteOfDay(x.startAt) <= m && m < kstMinuteOfDay(x.endAt));
    if (s) {
      const end = Math.min(TIMELINE_END, kstMinuteOfDay(s.endAt));
      const span = Math.max(1, Math.ceil((end - m) / 60));
      rows.push({ kind: "open_play", minute: m, span, sessionId: s.id, title: s.title, joined: s._count.participants, capacity: s.capacity, fee: s.fee });
      m += span * 60;
      continue;
    }
    const b = mine.find((x) => kstMinuteOfDay(x.startAt) <= m && m < kstMinuteOfDay(x.endAt));
    if (b) {
      const end = Math.min(TIMELINE_END, kstMinuteOfDay(b.endAt));
      const span = Math.max(1, Math.ceil((end - m) / 60));
      rows.push({ kind: "mine", minute: m, span, href: `/bookings/${b.id}` });
      m += span * 60;
      continue;
    }
    const open = day.courts.some((c) => hourCellState(day, c, m, now) === "open");
    rows.push({ kind: open ? "open" : "closed", minute: m, span: 1 });
    m += 60;
  }
  return rows;
}
