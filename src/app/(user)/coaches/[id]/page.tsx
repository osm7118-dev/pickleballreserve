// 개인 레슨: 코치 소개 + 날짜·시간 고르기
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWon } from "@/lib/money";
import { addDays, durationLabel, formatKst, isDateStr, kstAt, todayKst } from "@/lib/time";
import { policyOf } from "@/server/booking/policy";
import { lessonStartsFor } from "@/server/lesson";
import { db } from "@/lib/db";
import { Notice, TopBar } from "@/components/ui";
import { LessonTimePicker } from "./time-picker";

export const dynamic = "force-dynamic";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; start?: string; notice?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const coachRow = await db.coach.findUnique({ where: { id }, include: { facility: { include: { bookingPolicy: true } } } });
  if (!coachRow || !coachRow.isActive) notFound();
  const policy = policyOf(coachRow.facility.bookingPolicy);
  const today = todayKst();
  const last = addDays(today, policy.advanceDays);
  const date = sp.date && isDateStr(sp.date) && sp.date >= today && sp.date <= last ? sp.date : today;
  const dates = Array.from({ length: policy.advanceDays + 1 }, (_, i) => addDays(today, i));
  const { coach, starts } = await lessonStartsFor(id, date);
  if (!coach) notFound();

  return (
    <main>
      <TopBar title="개인 레슨" back={`/facilities/${coach.facilityId}/lessons`} />
      <section className="bg-surface px-5 pt-4 pb-5">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[20px] font-bold text-primary-hover">
            {coach.name.slice(0, 1)}
          </span>
          <div>
            <h1 className="text-[21px] font-extrabold">{coach.name}</h1>
            <p className="text-[14px] text-muted">{coach.facility.name}</p>
            <p className="tabular text-[15px] font-bold">
              {formatWon(coach.lessonPrice)} <span className="font-medium text-muted">/ {durationLabel(coach.lessonMinutes)}</span>
            </p>
          </div>
        </div>
        {coach.bio && <p className="mt-3 text-[15px]">{coach.bio}</p>}
      </section>

      {sp.notice === "expired" && (
        <div className="px-5 pt-3">
          <Notice tone="danger">선점 시간이 지났어요. 시간을 다시 골라 주세요.</Notice>
        </div>
      )}

      <nav className="flex gap-2 overflow-x-auto px-5 py-4" aria-label="날짜 선택">
        {dates.map((d) => {
          const dt = kstAt(d, 0);
          const wd = Number(formatKst(dt, "i")) % 7;
          const active = d === date;
          return (
            <Link
              key={d}
              href={`/coaches/${coach.id}?date=${d}`}
              scroll={false}
              className={`flex h-16 w-12 shrink-0 flex-col items-center justify-center rounded-[12px] text-[13px] font-semibold ${
                active ? "bg-ink text-white" : "border border-line bg-surface"
              } ${!active && (wd === 0 || wd === 6) ? "text-danger" : ""}`}
            >
              <span>{d === today ? "오늘" : WEEKDAYS[wd]}</span>
              <span className="tabular text-[17px] font-extrabold">{formatKst(dt, "d")}</span>
            </Link>
          );
        })}
      </nav>
      <p className="px-5 pb-2 text-[13px] text-muted">시작 시간을 고르세요. 레슨은 {durationLabel(coach.lessonMinutes)} 진행돼요.</p>
      <LessonTimePicker
        key={date}
        coachId={coach.id}
        date={date}
        starts={starts}
        lessonMinutes={coach.lessonMinutes}
        priceLabel={formatWon(coach.lessonPrice)}
        initial={sp.start ? Number(sp.start) : null}
      />
    </main>
  );
}
