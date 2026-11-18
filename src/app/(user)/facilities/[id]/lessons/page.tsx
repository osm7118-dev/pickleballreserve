// 개인 레슨: 시설 코치 목록
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatWon } from "@/lib/money";
import { durationLabel, minuteLabel } from "@/lib/time";
import { listCoaches } from "@/server/lesson";
import { TopBar } from "@/components/ui";
import { IconChevron } from "@/components/icons";

export const dynamic = "force-dynamic";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function LessonsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facility = await db.facility.findFirst({ where: { id, status: "approved" } });
  if (!facility) notFound();
  const coaches = await listCoaches(facility.id);
  return (
    <main className="pb-12">
      <TopBar title="개인 레슨" back="/" />
      <div className="space-y-3 px-5 pt-4">
        <p className="text-[14px] text-muted">{facility.name} 코치에게 1:1 레슨을 받아요. 코트는 시설에서 잡아 드려요.</p>
        {coaches.length === 0 && <div className="card p-6 text-center text-muted">레슨하는 코치가 아직 없어요.</div>}
        {coaches.map((c) => {
          const days = [...new Set(c.availabilities.map((a) => a.weekday))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
          const first = c.availabilities[0];
          return (
            <Link key={c.id} href={`/coaches/${c.id}`} className="card flex items-center gap-4 p-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[17px] font-bold text-primary-hover">
                {c.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold">{c.name}</p>
                {c.bio && <p className="line-clamp-2 text-[14px] text-muted">{c.bio}</p>}
                <p className="tabular mt-1 text-[14px]">
                  <b>{formatWon(c.lessonPrice)}</b>
                  <span className="text-muted">
                    {" "}
                    / {durationLabel(c.lessonMinutes)} · {days.map((d) => WEEKDAYS[d]).join("")}
                    {first ? ` ${minuteLabel(first.startMinute)}~${minuteLabel(first.endMinute)}` : ""}
                  </span>
                </p>
              </div>
              <IconChevron className="h-5 w-5 text-muted-2" />
            </Link>
          );
        })}
      </div>
    </main>
  );
}
