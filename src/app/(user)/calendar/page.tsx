// U18 캘린더: 내 매장 하루 시간표(06~23시, 1시간 칸) — 오픈플레이 / 마감 / 대여·레슨 가능 / 내 예약
import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { addDays, formatKst, isDateStr, kstAt, kstDateStr, minuteLabel, todayKst } from "@/lib/time";
import { resolveHomeFacility } from "@/server/club";
import { listMyItems } from "@/server/club/my-items";
import { listOpenPlaySessions } from "@/server/open-play";
import { TIMELINE_END, TIMELINE_START, getClubTimeline } from "@/server/club/timeline";
import { BottomTabs } from "@/components/bottom-tabs";
import { MyItemCard } from "@/components/my-item-card";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DAYS = 14;
const HOURS = (TIMELINE_END - TIMELINE_START) / 60;

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const store = await cookies();
  const user = await getCurrentUser();
  const facility = await resolveHomeFacility(store.get("pb_club")?.value, user?.id);
  const now = new Date();
  const today = todayKst(now);
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const date = sp.date && isDateStr(sp.date) && dates.includes(sp.date) ? sp.date : today;

  const [sessions, items, rows] = await Promise.all([
    facility ? listOpenPlaySessions(facility.id, now) : Promise.resolve([]),
    user ? listMyItems(user.id, "upcoming", now, 50) : Promise.resolve([]),
    facility ? getClubTimeline(facility.id, date, user?.id ?? null, now) : Promise.resolve([]),
  ]);
  const dayItems = items.filter((it) => kstDateStr(it.startAt) === date && it.kind !== "court");
  const marks = new Set([...sessions.map((s) => kstDateStr(s.startAt)), ...items.map((it) => kstDateStr(it.startAt))]);

  return (
    <main className="pb-28">
      <header className="px-5 pt-7 pb-3">
        <h1 className="text-[24px] font-extrabold">캘린더</h1>
        {facility && <p className="text-[14px] text-muted">{facility.name} 하루 시간표</p>}
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

      {facility && (
        <div className="flex flex-wrap gap-3 px-5 pb-3 text-[12px] text-muted">
          <Legend cls="bg-ink" text="오픈플레이" />
          <Legend cls="border border-line-strong bg-surface" text="대여·레슨 가능" />
          <Legend cls="hatch border border-line" text="마감" />
          {user && <Legend cls="bg-primary" text="내 예약" />}
        </div>
      )}

      <div className="space-y-6 px-5">
        {!facility ? (
          <p className="card p-5 text-[14px] text-muted">아직 열린 매장이 없어요.</p>
        ) : (
          <section
            className="grid gap-x-2 gap-y-1"
            style={{ gridTemplateColumns: "48px minmax(0, 1fr)", gridTemplateRows: `repeat(${HOURS}, 64px)` }}
            aria-label="하루 시간표"
          >
            {Array.from({ length: HOURS }, (_, i) => (
              <div key={i} style={{ gridColumn: 1, gridRow: i + 1 }} className="tabular pt-1 text-right text-[12px] text-muted">
                {minuteLabel(TIMELINE_START + i * 60)}
              </div>
            ))}
            {rows.map((r) => {
              const style = { gridColumn: 2, gridRow: `${(r.minute - TIMELINE_START) / 60 + 1} / span ${r.span}` };
              const time = `${minuteLabel(r.minute)}~${minuteLabel(r.minute + r.span * 60)}`;
              if (r.kind === "open_play") {
                const left = r.capacity - r.joined;
                return (
                  <Link key={r.minute} href={`/open-play/${r.sessionId}`} style={style} className="flex flex-col justify-between bg-ink p-3 text-white">
                    <div>
                      <p className="flex items-center gap-1.5 text-[12px] font-bold text-accent">
                        오픈플레이 {left <= 0 ? "· 마감" : left <= 3 ? `· ${left}자리 남음` : ""}
                      </p>
                      <p className="text-[16px] font-bold">{r.title}</p>
                    </div>
                    <p className="tabular text-[13px] opacity-85">
                      {time} · {formatWon(r.fee)} · {r.joined}/{r.capacity}명
                    </p>
                  </Link>
                );
              }
              if (r.kind === "mine") {
                return (
                  <Link key={r.minute} href={r.href} style={style} className="flex flex-col justify-center bg-primary px-3 text-white">
                    <p className="text-[15px] font-bold">내 코트 예약</p>
                    <p className="tabular text-[13px] opacity-85">{time}</p>
                  </Link>
                );
              }
              if (r.kind === "closed") {
                return (
                  <div key={r.minute} style={style} className="hatch flex items-center border border-line px-3 text-[14px] font-semibold text-muted-2">
                    마감
                  </div>
                );
              }
              return (
                <div key={r.minute} style={style} className="flex items-center justify-between gap-2 border border-line-strong bg-surface px-3">
                  <span className="text-[14px] font-semibold">대여 · 레슨 가능</span>
                  <span className="flex gap-1.5">
                    <Link
                      href={`/facilities/${facility.id}?date=${date}&start=${r.minute}&end=${r.minute + 60}`}
                      className="inline-flex h-9 items-center bg-primary px-3 text-[13px] font-bold text-white"
                    >
                      코트 대여
                    </Link>
                    <Link href={`/facilities/${facility.id}/lessons`} className="inline-flex h-9 items-center border border-line-strong px-3 text-[13px] font-bold">
                      레슨
                    </Link>
                  </span>
                </div>
              );
            })}
          </section>
        )}

        {dayItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-[18px] font-extrabold">이 날 내 일정</h2>
            <div className="space-y-3">
              {dayItems.map((it) => (
                <MyItemCard key={`${it.kind}-${it.id}`} item={it} now={now} />
              ))}
            </div>
          </section>
        )}
      </div>
      <BottomTabs />
    </main>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3.5 w-3.5 ${cls}`} /> {text}
    </span>
  );
}
