"use client";

import { useActionState, useEffect, useState } from "react";
import { payAction } from "@/app/(user)/actions";
import { BottomBar, btnPrimary } from "@/components/ui";
import { useHoldExpired } from "@/components/hold-timer";

const METHODS = [
  { value: "카드", label: "신용·체크카드" },
  { value: "간편결제", label: "간편결제 (토스페이 등)" },
  { value: "계좌이체", label: "계좌이체" },
];

/** U07 결제수단 선택. 실제 서비스에서는 토스 결제위젯이 이 영역을 그린다. */
export function PayForm({
  kind = "booking",
  targetId,
  amountLabel,
  expiresAt,
  children,
}: {
  kind?: "booking" | "open_play" | "lesson";
  targetId: string;
  amountLabel: string;
  /** 선점 만료 시각. 오픈플레이처럼 선점이 없으면 생략 */
  expiresAt?: string;
  /** 결제 버튼 위에 넣을 내용(예: 취소 규정 동의) */
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(payAction, undefined);
  const [method, setMethod] = useState("카드");
  const expired = useHoldExpired(expiresAt ?? "9999-12-31T00:00:00Z");
  const [agreed, setAgreed] = useState(children ? false : true);
  useEffect(() => {
    if (state?.next) window.location.assign(state.next);
  }, [state]);
  const busy = pending || !!state?.next;
  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="targetId" value={targetId} />
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[17px] font-bold">결제수단</h3>
          <span className="bg-slot-booked px-2.5 py-0.5 text-[12px] font-bold text-muted">테스트 결제</span>
        </div>
        <div className="space-y-2">
          {METHODS.map((m) => (
            <label
              key={m.value}
              className={`flex h-14 items-center gap-3 border px-4 text-[15px] font-semibold ${
                method === m.value ? "border-primary bg-primary-soft" : "border-line-strong bg-surface"
              }`}
            >
              <input
                type="radio"
                name="method"
                value={m.value}
                checked={method === m.value}
                onChange={() => setMethod(m.value)}
                className="h-5 w-5 accent-primary"
              />
              {m.label}
            </label>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-muted">지금은 테스트 결제라 실제로 돈이 나가지 않아요.</p>
      </div>
      {children && (
        <label className="card mt-3 flex min-h-14 items-center gap-3 px-4 text-[15px] font-semibold">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-5 w-5 accent-primary" />
          {children}
        </label>
      )}
      {state?.error && <p className="mt-3 text-[14px] font-semibold text-danger">{state.error}</p>}
      <BottomBar>
        <button className={btnPrimary} disabled={busy || expired || !agreed}>
          {expired ? "선점 시간이 지났어요" : busy ? "결제 중…" : `${amountLabel} 결제하기`}
        </button>
      </BottomBar>
    </form>
  );
}
