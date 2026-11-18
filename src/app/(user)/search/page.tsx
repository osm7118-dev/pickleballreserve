// U04 검색 결과
import Link from "next/link";
import { z } from "zod";
import { formatWon } from "@/lib/money";
import { dateLabel, durationLabel, isDateStr, minuteLabel, todayKst } from "@/lib/time";
import { searchFacilities } from "@/server/booking/search";
import { Badge, TopBar } from "@/components/ui";
import { IconChevron, IconPin } from "@/components/icons";

export const dynamic = "force-dynamic";

const schema = z.object({
  region: z.string().regex(/^[^|]+\|[^|]+$/),
  date: z.string().refine(isDateStr),
  start: z.coerce.number().int().min(0).max(1380).multipleOf(60),
  minutes: z.coerce.number().int().min(60).max(240).multipleOf(60),
});

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const parsed = schema.safeParse(await searchParams);
  if (!parsed.success) {
    return (
      <main>
        <TopBar title="검색 결과" back="/clubs" />
        <p className="p-5 text-muted">검색 조건을 다시 골라 주세요.</p>
      </main>
    );
  }
  const { region, date, start, minutes } = parsed.data;
  const [sido, sigungu] = region.split("|");
  const results = date < todayKst() ? [] : await searchFacilities({ sido, sigungu, date, startMinute: start, minutes });
  const end = start + minutes;

  return (
    <main className="pb-10">
      <TopBar title="검색 결과" back="/clubs" />
      <div className="border-b border-line bg-surface px-5 py-3 text-[14px] font-semibold">
        <span className="tabular">
          {sido} {sigungu} · {dateLabel(date)} · {minuteLabel(start)}~{minuteLabel(end)} ({durationLabel(minutes)})
        </span>
      </div>
      <div className="space-y-3 px-5 pt-4">
        <p className="text-[14px] text-muted">
          이 시간에 빈 코트가 있는 시설 <b className="text-ink">{results.length}곳</b>
        </p>
        {results.length === 0 && (
          <div className="card p-6 text-center text-[15px] text-muted">
            조건에 맞는 빈 코트가 없어요.
            <br />
            시간이나 날짜를 바꿔 보세요.
          </div>
        )}
        {results.map((r) => (
          <Link
            key={r.facilityId}
            href={`/facilities/${r.facilityId}?date=${date}&start=${start}&end=${end}`}
            className="card flex items-center gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold">{r.name}</p>
              <p className="flex items-center gap-1 truncate text-[13px] text-muted">
                <IconPin className="h-3.5 w-3.5 shrink-0" /> {r.address}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge>
                  빈 코트 {r.freeCourts}/{r.totalCourts}
                </Badge>
                <span className="tabular text-[18px] font-extrabold">{formatWon(r.price)}</span>
              </div>
            </div>
            <IconChevron className="h-5 w-5 text-muted-2" />
          </Link>
        ))}
      </div>
    </main>
  );
}
