import { db } from "@/lib/db";

export type MyItem = {
  kind: "court" | "lesson" | "open_play";
  id: string;
  href: string;
  title: string;
  place: string;
  startAt: Date;
  endAt: Date;
  amount: number;
  status: "held" | "confirmed" | "cancelled" | "completed" | "no_show" | "joined";
};

/** 코트 예약·레슨·오픈플레이 참가를 한 목록으로 (U03 홈, U09 내 예약) */
export async function listMyItems(
  userId: string,
  tab: "upcoming" | "past" | "cancelled",
  now: Date = new Date(),
  take = 50,
): Promise<MyItem[]> {
  const [bookings, lessons, plays] = await Promise.all([
    db.booking.findMany({
      where: {
        userId,
        ...(tab === "upcoming"
          ? { OR: [{ status: "confirmed", endAt: { gt: now } }, { status: "held", holdExpiresAt: { gt: now } }] }
          : tab === "past"
            ? { OR: [{ status: { in: ["completed", "no_show"] } }, { status: "confirmed", endAt: { lte: now } }] }
            : { status: "cancelled", cancelReason: { not: "선점 시간 만료" } }),
      },
      include: { facility: true, court: true },
      take,
    }),
    db.lessonBooking.findMany({
      where: {
        userId,
        ...(tab === "upcoming"
          ? { OR: [{ status: "confirmed", endAt: { gt: now } }, { status: "held", holdExpiresAt: { gt: now } }] }
          : tab === "past"
            ? { OR: [{ status: { in: ["completed", "no_show"] } }, { status: "confirmed", endAt: { lte: now } }] }
            : { status: "cancelled", cancelReason: { not: "선점 시간 만료" } }),
      },
      include: { facility: true, coach: true },
      take,
    }),
    db.openPlayParticipant.findMany({
      where: {
        userId,
        paymentId: { not: null },
        ...(tab === "cancelled"
          ? { status: "cancelled" }
          : { status: "joined", session: tab === "upcoming" ? { endAt: { gt: now } } : { endAt: { lte: now } } }),
      },
      include: { session: { include: { facility: true } }, payment: true },
      take,
    }),
  ]);
  const items: MyItem[] = [
    ...bookings.map((b) => ({
      kind: "court" as const,
      id: b.id,
      href: b.status === "held" ? `/bookings/${b.id}/confirm` : `/bookings/${b.id}`,
      title: `코트 예약 · ${b.court.name}`,
      place: b.facility.name,
      startAt: b.startAt,
      endAt: b.endAt,
      amount: b.totalAmount,
      status: b.status,
    })),
    ...lessons.map((l) => ({
      kind: "lesson" as const,
      id: l.id,
      href: l.status === "held" ? `/lessons/${l.id}/pay` : `/lessons/${l.id}`,
      title: `개인 레슨 · ${l.coach.name}`,
      place: l.facility.name,
      startAt: l.startAt,
      endAt: l.endAt,
      amount: l.amount,
      status: l.status,
    })),
    ...plays.map((p) => ({
      kind: "open_play" as const,
      id: p.id,
      href: `/open-play/${p.sessionId}`,
      title: `오픈플레이 · ${p.session.title}`,
      place: p.session.facility.name,
      startAt: p.session.startAt,
      endAt: p.session.endAt,
      amount: p.payment?.amount ?? p.session.fee,
      status: p.status === "cancelled" ? ("cancelled" as const) : ("joined" as const),
    })),
  ];
  items.sort((a, b) => (tab === "upcoming" ? a.startAt.getTime() - b.startAt.getTime() : b.startAt.getTime() - a.startAt.getTime()));
  return items.slice(0, take);
}
