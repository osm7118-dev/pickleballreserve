"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { holdAction } from "../../actions";
import { BottomBar, btnPrimary } from "@/components/ui";
import type { CellState } from "@/server/booking/schedule";

type Props = {
  facilityId: string;
  date: string;
  courts: { id: string; name: string }[];
  rows: number[];
  states: Record<string, CellState[]>;
  prices: (number | null)[];
  minMinutes: number;
  maxMinutes: number;
  initial: { courtId: string; start: number; end: number } | null;
};

type Sel = { courtId: string; startIdx: number; endIdx: number } | null;

const label = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const dur = (m: number) => (m % 60 === 0 ? `${m / 60}시간` : m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`);

/** U05 코트(열) × 30분(행) 시간표. 시작 칸 → 끝 칸 순서로 눌러 연속 선택한다. */
export function SlotPicker(props: Props) {
  const { facilityId, date, courts, rows, states, prices, minMinutes, maxMinutes } = props;
  const [state, action, pending] = useActionState(holdAction, undefined);

  const initialSel = useMemo<Sel>(() => {
    const init = props.initial;
    if (!init) return null;
    const s = rows.indexOf(init.start);
    const e = rows.indexOf(init.end - 30);
    if (s < 0 || e < s || !states[init.courtId]) return null;
    for (let i = s; i <= e; i++) if (states[init.courtId][i] !== "open") return null;
    return { courtId: init.courtId, startIdx: s, endIdx: e };
  }, [props.initial, rows, states]);
  const [sel, setSel] = useState<Sel>(initialSel);
  const gridRef = useRef<HTMLDivElement>(null);

  // 검색에서 넘어온 시간이 있으면 그 칸이 보이게 스크롤한다.
  useEffect(() => {
    if (!initialSel) return;
    gridRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "center" });
  }, [initialSel]);

  const tap = (courtId: string, idx: number) => {
    if (states[courtId][idx] !== "open") return;
    if (!sel || sel.courtId !== courtId || idx < sel.startIdx || (idx >= sel.startIdx && idx <= sel.endIdx && sel.endIdx !== sel.startIdx)) {
      setSel({ courtId, startIdx: idx, endIdx: idx });
      return;
    }
    if (idx === sel.startIdx) {
      setSel(null);
      return;
    }
    for (let i = sel.startIdx; i <= idx; i++) {
      if (states[courtId][i] !== "open") {
        setSel({ courtId, startIdx: idx, endIdx: idx });
        return;
      }
    }
    setSel({ ...sel, endIdx: idx });
  };

  const minutes = sel ? (sel.endIdx - sel.startIdx + 1) * 30 : 0;
  const amount = sel ? prices.slice(sel.startIdx, sel.endIdx + 1).reduce<number>((a, p) => a + (p ?? 0), 0) : 0;
  const reason = !sel
    ? "시작 칸과 끝 칸을 차례로 눌러 주세요"
    : minutes < minMinutes
      ? `최소 ${dur(minMinutes)} 이상 골라 주세요`
      : minutes > maxMinutes
        ? `최대 ${dur(maxMinutes)}까지 예약할 수 있어요`
        : null;
  const courtName = sel ? courts.find((c) => c.id === sel.courtId)?.name : "";

  if (rows.length === 0) {
    return <div className="card mx-5 p-6 text-center text-muted">이 날은 운영하지 않아요.</div>;
  }

  return (
    <>
      <div className="flex gap-3 px-5 pb-3 text-[12px] text-muted">
        <Legend cls="border border-line-strong bg-surface" text="가능" />
        <Legend cls="bg-primary" text="선택" />
        <Legend cls="bg-slot-booked" text="예약됨" />
        <Legend cls="hatch" text="마감" />
      </div>
      <div className="px-3 pb-44">
        <div
          ref={gridRef}
          className="grid gap-1"
          style={{ gridTemplateColumns: `44px repeat(${courts.length}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="코트별 30분 시간표"
        >
          <div />
          {courts.map((c) => (
            <div key={c.id} className="pb-1 text-center text-[13px] font-bold">
              {c.name}
            </div>
          ))}
          {rows.map((m, idx) => (
            <Row key={m} m={m} idx={idx} courts={courts} states={states} sel={sel} tap={tap} />
          ))}
        </div>
      </div>

      <BottomBar>
        <form action={action}>
          <input type="hidden" name="facilityId" value={facilityId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="courtId" value={sel?.courtId ?? ""} />
          <input type="hidden" name="start" value={sel ? rows[sel.startIdx] : ""} />
          <input type="hidden" name="end" value={sel ? rows[sel.endIdx] + 30 : ""} />
          <div className="mb-2 flex min-h-11 items-end justify-between gap-3">
            {sel ? (
              <div>
                <p className="tabular text-[14px] font-semibold text-muted">
                  {courtName} · {label(rows[sel.startIdx])}~{label(rows[sel.endIdx] + 30)} · {dur(minutes)}
                </p>
                <p className="tabular text-[20px] leading-tight font-extrabold">{amount.toLocaleString("ko-KR")}원</p>
              </div>
            ) : (
              <span />
            )}
          </div>
          {(reason || state?.error) && (
            <p className={`mb-2 text-[13px] font-semibold ${state?.error ? "text-danger" : "text-muted"}`}>
              {state?.error ?? reason}
            </p>
          )}
          <button className={btnPrimary} disabled={!!reason || pending}>
            {pending ? "자리 잡는 중…" : "예약하기"}
          </button>
        </form>
      </BottomBar>
    </>
  );
}

function Row({
  m,
  idx,
  courts,
  states,
  sel,
  tap,
}: {
  m: number;
  idx: number;
  courts: { id: string }[];
  states: Record<string, CellState[]>;
  sel: Sel;
  tap: (courtId: string, idx: number) => void;
}) {
  return (
    <>
      <div className="tabular -mt-2 pr-1 text-right text-[12px] text-muted">{m % 60 === 0 ? label(m) : ""}</div>
      {courts.map((c) => {
        const st = states[c.id][idx];
        const selected = sel && sel.courtId === c.id && idx >= sel.startIdx && idx <= sel.endIdx;
        const isStart = selected && idx === sel.startIdx;
        const cls = selected
          ? "bg-primary text-white"
          : st === "open"
            ? "border border-line-strong bg-surface hover:border-primary"
            : st === "booked"
              ? "bg-slot-booked text-muted-2"
              : "hatch";
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => tap(c.id, idx)}
            disabled={st !== "open"}
            aria-pressed={!!selected}
            aria-label={`${label(m)} ${st === "open" ? "예약 가능" : st === "booked" ? "예약됨" : "마감"}`}
            className={`h-11 rounded-[8px] text-[12px] font-bold ${cls}`}
          >
            {isStart ? "시작" : st === "booked" && !selected ? "예약됨" : ""}
          </button>
        );
      })}
    </>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3.5 w-3.5 rounded-[4px] ${cls}`} /> {text}
    </span>
  );
}
