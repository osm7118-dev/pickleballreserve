// U18 캘린더: 내 매장의 날짜별 일정(프로그램·오픈플레이)과 내 예약을 한 화면에서
import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { addDays, formatKst, isDateStr, kstAt, kstDateStr, rangeLabel, todayKst } from "@/lib/time";
import { resolveHomeFacility } from "@/server/club";
import { listMyItems } from "@/server/club/my-items";
import { listOpenPlaySessions } from "@/server/open-play";
import { BottomTabs } from "@/components/bottom-tabs";
import { MyItemCard } from "@/components/my-item-card";
import { Badge } from "@/components/ui";
import { IconChevron } from "@/components/icons";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS = 14;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await cookies();
  const user = await getCurrentUser();
  const facility = await resolveHomeFacility(store.get("pb_club")?.value, user?.id);
  const now = new Date();
  const today = todayKst(now);
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const date = sp.date && isDateStr(sp.date) && dates.includes(sp.date) ? sp.date : today;

  const [sessions, items] = await Promise.all([
    facility ? listOpenPlaySessions(facility.id, now) : Promise.resolve([]),
    user ? listMyItems(user.id, "upcoming", now, 50) : Promise.resolve([]),
  ]);
  const daySessions = sessions.filter((s) => kstDateStr(s.startAt) === date);
  const dayItems = items.filter((it) => kstDateStr(it.startAt) === date);
  const marks = new Set([...sessions.map((s) => kstDateStr(s.startAt)), ...items.map((it) => kstDateStr(it.startAt))]);

  return (
    <main className="pb-28">
      <header className="px-5 pt-7 pb-3">
        <h1 className="text-[24px] font-extrabold">캘린더</h1>
        {facility && <p className="text-[14px] text-muted">{facility.name} 일정과 내 예약</p>}
      </header>

      <nav className="flex gap-2 overflow-x-auto px-5 pb-4" aria-label="날짜 선택">
        {dates.map((d) => {
          const dt = kstAt(d, 0);
          const wd = Number(formatKst(dt, "i")) % 7;
          const active = d === date;
          return (
            <Link
              key={d}
              href={`/calendar?date=${d}`}
              scroll={false}
              className={`flex h-[70px] w-12 shrink-0 flex-col items-center justify-center text-[13px] font-semibold ${
                active ? "bg-ink text-white" : "border border-line bg-surface"
              } ${!active && (wd === 0 || wd === 6) ? "text-danger" : ""}`}
            >
              <span>{d === today ? "오늘" : WEEKDAYS[wd]}</span>
              <span className="tabular text-[17px] font-extrabold">{formatKst(dt, "d")}</span>
              <span className={`mt-0.5 block h-1.5 w-1.5 rounded-full ${marks.has(d) ? (active ? "bg-accent" : "bg-primary") : "bg-transparent"}`} />
            </Link>
          );
        })}
      </nav>

      <div className="space-y-6 px-5">
        <section>
          <h2 className="mb-3 text-[18px] font-extrabold">내 일정</h2>
          {!user ? (
            <p className="card p-5 text-[14px] text-muted">
              <Link href="/login?next=/calendar" className="font-bold text-primary">
                로그인
              </Link>
              하면 내 예약이 날짜별로 보여요.
            </p>
          ) : dayItems.length === 0 ? (
            <p className="card p-5 text-[14px] text-muted">이 날 예약이 없어요.</p>
          ) : (
            <div className="space-y-3">
              {dayItems.map((it) => (
                <MyItemCard key={`${it.kind}-${it.id}`} item={it} now={now} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[18px] font-extrabold">매장 프로그램 · 오픈플레이</h2>
          {daySessions.length === 0 ? (
            <p className="card p-5 text-[14px] text-muted">이 날 열리는 프로그램이 없어요.</p>
          ) : (
            <div className="space-y-3">
              {daySessions.map((s) => {
                const left = s.capacity - s.joined;
                return (
                  <Link key={s.id} href={`/open-play/${s.id}`} className="card flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex gap-1.5">
                        <Badge tone="accent">오픈플레이</Badge>
                        {left <= 0 ? <Badge tone="danger">마감</Badge> : left <= 3 ? <Badge tone="warn">{left}자리 남음</Badge> : null}
                      </div>
                      <p className="text-[16px] font-bold">{s.title}</p>
                      <p className="tabular text-[14px] text-muted">{rangeLabel(s.startAt, s.endAt)}</p>
                      <p className="tabular text-[14px]">
                        <b>{formatWon(s.fee)}</b>
                        <span className="text-muted">
                          {" "}
                          · {s.joined}/{s.capacity}명
                        </span>
                      </p>
                    </div>
                    <IconChevron className="h-5 w-5 text-muted-2" />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <BottomTabs />
    </main>
  );
}
