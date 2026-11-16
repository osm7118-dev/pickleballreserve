// U03 홈(검색)
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, dateLabel, durationLabel, minuteLabel, rangeLabel, todayKst } from "@/lib/time";
import { listRegions } from "@/server/booking/search";
import { BottomTabs } from "@/components/bottom-tabs";
import { Badge, btnPrimary } from "@/components/ui";
import { IconPin } from "@/components/icons";

export const dynamic = "force-dynamic";

const selectCls =
  "h-12 w-full appearance-none rounded-[12px] border border-line-strong bg-surface px-3 text-[15px] font-semibold outline-none focus:border-primary";

export default async function HomePage() {
  const [user, regions] = await Promise.all([getCurrentUser(), listRegions()]);
  const today = todayKst();
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const starts: number[] = [];
  for (let m = 6 * 60; m <= 23 * 60; m += 30) starts.push(m);
  const nextBooking = user
    ? await db.booking.findFirst({
        where: { userId: user.id, status: "confirmed", startAt: { gt: new Date() } },
        include: { facility: true, court: true },
        orderBy: { startAt: "asc" },
      })
    : null;

  return (
    <main className="px-5 pt-8 pb-28">
      <p className="text-[14px] font-semibold text-primary">{user ? `${user.name ?? "회원"}님` : "반가워요"}</p>
      <h1 className="mt-1 text-[26px] leading-tight font-extrabold">어디서 칠까요?</h1>

      {nextBooking && (
        <Link href={`/bookings/${nextBooking.id}`} className="card mt-5 block p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-muted">다가오는 예약</span>
            <Badge tone="accent">D-{Math.max(0, daysBetween(today, nextBooking.startAt))}</Badge>
          </div>
          <p className="mt-1 text-[17px] font-bold">
            {nextBooking.facility.name} · {nextBooking.court.name}
          </p>
          <p className="tabular text-[15px] text-muted">{rangeLabel(nextBooking.startAt, nextBooking.endAt)}</p>
        </Link>
      )}

      <form action="/search" className="card mt-5 space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1 text-[13px] font-bold text-muted">
            <IconPin /> 지역
          </span>
          <select name="region" className={selectCls} defaultValue={regions[0] ? `${regions[0].sido}|${regions[0].sigungu}` : ""}>
            {regions.map((r) => (
              <option key={`${r.sido}|${r.sigungu}`} value={`${r.sido}|${r.sigungu}`}>
                {r.sido} {r.sigungu}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-bold text-muted">날짜</span>
          <select name="date" className={selectCls} defaultValue={dates[1]}>
            {dates.map((d, i) => (
              <option key={d} value={d}>
                {dateLabel(d)}
                {i === 0 ? " · 오늘" : i === 1 ? " · 내일" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-muted">시작 시간</span>
            <select name="start" className={`${selectCls} tabular`} defaultValue={19 * 60}>
              {starts.map((m) => (
                <option key={m} value={m}>
                  {minuteLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-muted">이용 시간</span>
            <select name="minutes" className={selectCls} defaultValue={90}>
              {[60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {durationLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className={btnPrimary}>빈 코트 찾기</button>
      </form>

      {!user && (
        <p className="mt-5 text-center text-[14px] text-muted">
          검색은 로그인 없이 할 수 있어요.{" "}
          <Link href="/login" className="font-bold text-primary">
            로그인
          </Link>
        </p>
      )}
      <BottomTabs />
    </main>
  );
}

function daysBetween(today: string, startAt: Date): number {
  const t = new Date(`${today}T00:00:00+09:00`).getTime();
  return Math.floor((startAt.getTime() - t) / 86400000);
}
