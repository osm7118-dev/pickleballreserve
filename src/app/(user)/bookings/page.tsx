// U09 내 예약 목록 (코트 예약 · 개인 레슨 · 오픈플레이)
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMyItems } from "@/server/club/my-items";
import { BottomTabs } from "@/components/bottom-tabs";
import { MyItemCard } from "@/components/my-item-card";
import { TopBar } from "@/components/ui";

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
  const items = await listMyItems(user.id, tab, now);

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
        {items.length === 0 && (
          <div className="card p-6 text-center text-muted">
            {tab === "upcoming" ? "예정된 예약이 없어요." : tab === "past" ? "지난 예약이 없어요." : "취소한 예약이 없어요."}
            {tab === "upcoming" && (
              <Link href="/" className="mt-2 block font-bold text-primary">
                홈에서 예약하기
              </Link>
            )}
          </div>
        )}
        {items.map((it) => (
          <MyItemCard key={`${it.kind}-${it.id}`} item={it} now={now} />
        ))}
      </div>
      <BottomTabs />
    </main>
  );
}
