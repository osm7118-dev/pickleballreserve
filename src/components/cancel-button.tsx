"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/(user)/actions";
import { btnDanger } from "./ui";

/** 두 번 눌러야 실행되는 취소 버튼 (U10, U11, 레슨 공통) */
export function CancelButton({
  action,
  idName,
  id,
  label,
  confirmLabel,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  idName: string;
  id: string;
  label: string;
  confirmLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name={idName} value={id} />
      {state?.error && <p className="text-[14px] font-semibold text-danger">{state.error}</p>}
      {confirming ? (
        <>
          <p className="text-center text-[14px] font-semibold">정말 취소할까요? {confirmLabel}돼요.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="h-12 border border-line-strong font-semibold">
              돌아가기
            </button>
            <button className={btnDanger} disabled={pending}>
              {pending ? "취소 중…" : "취소하기"}
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="h-12 w-full border border-danger font-bold text-danger">
          {label}
        </button>
      )}
    </form>
  );
}
