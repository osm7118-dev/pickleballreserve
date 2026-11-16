"use client";

import { useActionState, useState } from "react";
import { holdLessonAction } from "../../actions";
import { BottomBar, btnPrimary } from "@/components/ui";

const label = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 레슨 시작 시간 고르기 → 선점 */
export function LessonTimePicker({
  coachId,
  date,
  starts,
  lessonMinutes,
  priceLabel,
  initial,
}: {
  coachId: string;
  date: string;
  starts: { minute: number; free: boolean }[];
  lessonMinutes: number;
  priceLabel: string;
  initial: number | null;
}) {
  const [state, action, pending] = useActionState(holdLessonAction, undefined);
  const [sel, setSel] = useState<number | null>(initial !== null && starts.some((s) => s.minute === initial && s.free) ? initial : null);
  return (
    <>
      {starts.length === 0 ? (
        <div className="card mx-5 p-6 text-center text-muted">이 날은 레슨 가능한 시간이 없어요.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 px-5 pb-40">
          {starts.map((s) => (
            <button
              key={s.minute}
              type="button"
              disabled={!s.free}
              onClick={() => setSel(s.minute)}
              aria-pressed={sel === s.minute}
              className={`tabular h-12 rounded-[10px] text-[15px] font-bold ${
                sel === s.minute
                  ? "bg-primary text-white"
                  : s.free
                    ? "border border-line-strong bg-surface hover:border-primary"
                    : "bg-slot-booked text-muted-2 line-through"
              }`}
            >
              {label(s.minute)}
            </button>
          ))}
        </div>
      )}
      <BottomBar>
        <form action={action}>
          <input type="hidden" name="coachId" value={coachId} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="start" value={sel ?? ""} />
          {sel !== null && (
            <p className="tabular mb-1 text-[14px] font-semibold text-muted">
              {label(sel)}~{label(sel + lessonMinutes)} · {priceLabel}
            </p>
          )}
          {state?.error && <p className="mb-2 text-[13px] font-semibold text-danger">{state.error}</p>}
          <button className={btnPrimary} disabled={sel === null || pending}>
            {pending ? "자리 잡는 중…" : sel === null ? "시간을 골라 주세요" : "이 시간으로 예약하기"}
          </button>
        </form>
      </BottomBar>
    </>
  );
}
