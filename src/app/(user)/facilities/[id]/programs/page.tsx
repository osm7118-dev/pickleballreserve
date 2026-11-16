// U05 오픈플레이 탭 → 시설의 프로그램·오픈플레이 목록
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatWon } from "@/lib/money";
import { rangeLabel } from "@/lib/time";
import { listOpenPlaySessions } from "@/server/open-play";
import { Badge, TopBar } from "@/components/ui";
import { IconChevron } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function ProgramsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facility = await db.facility.findFirst({ where: { id, status: "approved" } });
  if (!facility) notFound();
  const sessions = await listOpenPlaySessions(facility.id);
  return (
    <main className="pb-12">
      <TopBar title="프로그램 · 오픈플레이" back="/" />
      <div className="space-y-3 px-5 pt-4">
        <p className="text-[14px] text-muted">
          {facility.name}의 오픈플레이예요. 혼자 와도 정원 안에서 순서대로 섞여 게임해요.
        </p>
        {sessions.length === 0 && <div className="card p-6 text-center text-muted">예정된 프로그램이 없어요.</div>}
        {sessions.map((s) => {
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
    </main>
  );
}
