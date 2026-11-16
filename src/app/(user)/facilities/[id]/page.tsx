// U05 시설 상세
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatWon } from "@/lib/money";
import { addDays, durationLabel, formatKst, isDateStr, kstAt, minuteLabel, todayKst } from "@/lib/time";
import { cellState, getFacilityDay } from "@/server/booking/schedule";
import { policyOf } from "@/server/booking/policy";
import { Notice, TopBar } from "@/components/ui";
import { IconClock, IconPin } from "@/components/icons";
import { SlotPicker } from "./slot-picker";
import { CancellationList } from "@/components/cancellation-list";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default async function FacilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const facility = await db.facility.findUnique({
    where: { id },
    include: {
      bookingPolicy: true,
      cancellationTiers: { orderBy: { hoursBefore: "desc" } },
      priceRules: { orderBy: [{ dayType: "asc" }, { startMinute: "asc" }] },
      operatingHours: { orderBy: { weekday: "asc" } },
      courts: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!facility || facility.status !== "approved") notFound();

  const policy = policyOf(facility.bookingPolicy);
  const today = todayKst();
  const lastDate = addDays(today, policy.advanceDays);
  const date = sp.date && isDateStr(sp.date) && sp.date >= today && sp.date <= lastDate ? sp.date : today;
  const dates = Array.from({ length: policy.advanceDays + 1 }, (_, i) => addDays(today, i));

  const now = new Date();
  const day = await getFacilityDay(facility.id, date, now);
  const rows: number[] = [];
  if (day.openMinute !== null && day.closeMinute !== null) {
    for (let m = day.openMinute; m < day.closeMinute; m += 30) rows.push(m);
  }
  const states = Object.fromEntries(day.courts.map((c) => [c.id, rows.map((m) => cellState(day, c, m, now))]));
  const prices = rows.map((m) => day.prices[m] ?? null);

  const start = Number(sp.start);
  const end = Number(sp.end);
  let initial: { courtId: string; start: number; end: number } | null = null;
  if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
    const s0 = rows.indexOf(start);
    const len = (end - start) / 30;
    const free = (courtId: string) =>
      s0 >= 0 && Array.from({ length: len }, (_, i) => states[courtId]?.[s0 + i]).every((st) => st === "open");
    const courtId = sp.court && states[sp.court] ? sp.court : day.courts.find((c) => free(c.id))?.id;
    if (courtId) initial = { courtId, start, end };
  }

  const surfaces = [...new Set(facility.courts.map((c) => c.surface).filter(Boolean))].join(", ");
  const amenities = Array.isArray(facility.amenities) ? (facility.amenities as unknown[]).map(String) : [];

  return (
    <main>
      <TopBar title={facility.name} back="/" />
      <section className="bg-surface px-5 pt-4 pb-5">
        <h2 className="text-[22px] font-extrabold">{facility.name}</h2>
        <p className="mt-1 flex items-center gap-1 text-[14px] text-muted">
          <IconPin /> {facility.address}
        </p>
        <p className="mt-1 text-[14px] text-muted">
          코트 {facility.courts.length}면{surfaces ? ` · ${surfaces}` : ""}
          {amenities.length > 0 ? ` · ${amenities.join(" · ")}` : ""}
        </p>
      </section>

      <details className="group border-b border-line bg-surface">
        <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-5 text-[14px] font-bold">
          운영시간 · 가격표 · 취소 규정
          <span className="text-muted-2 group-open:rotate-90">›</span>
        </summary>
        <div className="bg-bg pb-4">
      <section className="space-y-3 px-5 pt-3">
        <div className="card p-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-[17px] font-bold">
            <IconClock className="h-5 w-5" /> 운영시간
          </h3>
          <ul className="tabular grid grid-cols-2 gap-x-4 text-[14px]">
            {facility.operatingHours.map((h) => (
              <li key={h.weekday} className="flex justify-between py-0.5">
                <span className="text-muted">{WEEKDAYS[h.weekday]}</span>
                {minuteLabel(h.openMinute)}~{minuteLabel(h.closeMinute)}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-[17px] font-bold">가격 (30분당)</h3>
          <ul className="tabular space-y-1 text-[14px]">
            {facility.priceRules
              .filter((r) => r.dayType !== "holiday")
              .map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span className="text-muted">
                    {r.dayType === "weekday" ? "평일" : "주말"} {minuteLabel(r.startMinute)}~{minuteLabel(r.endMinute)}
                  </span>
                  <b>{formatWon(r.pricePer30min)}</b>
                </li>
              ))}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-[17px] font-bold">취소 규정</h3>
          <CancellationList tiers={facility.cancellationTiers} />
        </div>
      </section>
        </div>
      </details>

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
              href={`/facilities/${facility.id}?date=${d}`}
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

      <p className="px-5 pb-2 text-[13px] text-muted">
        1회 {durationLabel(policy.minMinutesPerBooking)}~{durationLabel(policy.maxMinutesPerBooking)} · 하루 최대{" "}
        {durationLabel(policy.maxMinutesPerDay)}
      </p>

      <SlotPicker
        key={date}
        facilityId={facility.id}
        date={date}
        courts={day.courts.map((c) => ({ id: c.id, name: c.name }))}
        rows={rows}
        states={states}
        prices={prices}
        minMinutes={policy.minMinutesPerBooking}
        maxMinutes={policy.maxMinutesPerBooking}
        initial={initial}
      />

    </main>
  );
}
