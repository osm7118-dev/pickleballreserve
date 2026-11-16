// U09 내 예약 목록
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatWon } from "@/lib/money";
import { rangeLabel } from "@/lib/time";
import { BottomTabs } from "@/components/bottom-tabs";
import { TopBar } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { IconChevron } from "@/components/icons";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "upcoming", label: "예정" },
  { key: "past", label: "지난" },
  { key: "cancelled", label: "취소" },
] as const;

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "upcoming";
  const user = await requireUser("/bookings");
  const now = new Date();
  const where =
    tab === "upcoming"
      ? {
          OR: [
            { status: "confirmed" as const, endAt: { gt: now } },
            { status: "held" as const, holdExpiresAt: { gt: now } },
          ],
        }
      : tab === "past"
        ? { OR: [{ status: { in: ["completed" as const, "no_show" as const] } }, { status: "confirmed" as const, endAt: { lte: now } }] }
        : { status: "cancelled" as const, cancelReason: { not: "선점 시간 만료" } };
  const bookings = await db.booking.findMany({
    where: { userId: user.id, ...where },
    include: { facility: true, court: true },
    orderBy: { startAt: tab === "upcoming" ? "asc" : "desc" },
    take: 50,
  });

  return (
    <main className="pb-24">
      <TopBar title="내 예약" />
      <nav className="sticky top-14 z-10 grid grid-cols-3 border-b border-line bg-surface">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/bookings?tab=${t.key}`}
            className={`flex h-12 items-center justify-center text-[15px] font-bold ${
              tab === t.key ? "border-b-2 border-primary text-primary" : "text-muted-2"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-3 px-5 pt-4">
        {bookings.length === 0 && (
          <div className="card p-6 text-center text-muted">
            {tab === "upcoming" ? "예정된 예약이 없어요." : tab === "past" ? "지난 예약이 없어요." : "취소한 예약이 없어요."}
            {tab === "upcoming" && (
              <Link href="/" className="mt-2 block font-bold text-primary">
                빈 코트 찾기
              </Link>
            )}
          </div>
        )}
        {bookings.map((b) => (
          <Link
            key={b.id}
            href={b.status === "held" ? `/bookings/${b.id}/confirm` : `/bookings/${b.id}`}
            className="card flex items-center gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1"><StatusBadge b={b} now={now} /></div>
              <p className="text-[16px] font-bold">
                {b.facility.name} · {b.court.name}
              </p>
              <p className="tabular text-[14px] text-muted">{rangeLabel(b.startAt, b.endAt)}</p>
              <p className="tabular text-[14px] font-bold">{formatWon(b.totalAmount)}</p>
            </div>
            <IconChevron className="h-5 w-5 text-muted-2" />
          </Link>
        ))}
      </div>
      <BottomTabs />
    </main>
  );
}
