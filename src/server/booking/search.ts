import { db } from "@/lib/db";
import { getFacilityDay, isRangeOpen, rangePrice } from "./schedule";
import { policyOf } from "./policy";
import { addDays, todayKst } from "@/lib/time";

export type SearchInput = { sido: string; sigungu: string; date: string; startMinute: number; minutes: number };

export type SearchResult = {
  facilityId: string;
  name: string;
  address: string;
  regionSigungu: string;
  freeCourts: number;
  totalCourts: number;
  price: number;
};

/** 검색 가능한 지역(승인된 시설이 있는 시/구) */
export async function listRegions() {
  const rows = await db.facility.findMany({
    where: { status: "approved" },
    select: { regionSido: true, regionSigungu: true },
    distinct: ["regionSido", "regionSigungu"],
    orderBy: [{ regionSido: "asc" }, { regionSigungu: "asc" }],
  });
  return rows.map((r) => ({ sido: r.regionSido, sigungu: r.regionSigungu }));
}

/** U04: 요청 시간대 슬롯이 모두 빈 코트가 1개 이상인 승인 시설만. */
export async function searchFacilities(input: SearchInput, now: Date = new Date()): Promise<SearchResult[]> {
  const facilities = await db.facility.findMany({
    where: { status: "approved", regionSido: input.sido, regionSigungu: input.sigungu },
    include: { bookingPolicy: true },
    orderBy: { name: "asc" },
  });
  const end = input.startMinute + input.minutes;
  const results: SearchResult[] = [];
  for (const f of facilities) {
    const policy = policyOf(f.bookingPolicy);
    if (input.minutes < policy.minMinutesPerBooking || input.minutes > policy.maxMinutesPerBooking) continue;
    if (input.date > addDays(todayKst(now), policy.advanceDays)) continue;
    const day = await getFacilityDay(f.id, input.date, now);
    const price = rangePrice(day, input.startMinute, end);
    if (price === null) continue;
    const free = day.courts.filter((c) => isRangeOpen(day, c, input.startMinute, end, now)).length;
    if (free === 0) continue;
    results.push({
      facilityId: f.id,
      name: f.name,
      address: f.address,
      regionSigungu: f.regionSigungu,
      freeCourts: free,
      totalCourts: day.courts.length,
      price,
    });
  }
  return results;
}
