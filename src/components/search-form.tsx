import { addDays, dateLabel, durationLabel, minuteLabel, todayKst } from "@/lib/time";
import { listRegions } from "@/server/booking/search";
import { btnPrimary } from "./ui";
import { IconPin } from "./icons";

const selectCls =
  "h-12 w-full appearance-none border border-line-strong bg-surface px-3 text-[15px] font-semibold outline-none focus:border-primary";

/** U03 검색 조건 (지역·날짜·시작 시간·이용 시간) → U04 */
export async function SearchForm() {
  const regions = await listRegions();
  const today = todayKst();
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const starts: number[] = [];
  for (let m = 6 * 60; m <= 23 * 60; m += 60) starts.push(m);
  return (
    <form action="/search" className="card space-y-4 p-5">
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
            {[60, 120].map((m) => (
              <option key={m} value={m}>
                {durationLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className={btnPrimary}>빈 코트 찾기</button>
    </form>
  );
}
