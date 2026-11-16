"use client";

import { useActionState, useState } from "react";
import { cancelAction } from "../../actions";
import { btnDanger } from "@/components/ui";

export function CancelForm({ bookingId, refundLabel }: { bookingId: string; refundLabel: string }) {
  const [state, action, pending] = useActionState(cancelAction, undefined);
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state?.error && <p className="text-[14px] font-semibold text-danger">{state.error}</p>}
      {confirming ? (
        <>
          <p className="text-center text-[14px] font-semibold">정말 취소할까요? {refundLabel} 환불돼요.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirming(false)} className="h-12 rounded-[12px] border border-line-strong font-semibold">
              돌아가기
            </button>
            <button className={btnDanger} disabled={pending}>
              {pending ? "취소 중…" : "예약 취소"}
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="h-12 w-full rounded-[12px] border border-danger font-bold text-danger">
          예약 취소하기
        </button>
      )}
    </form>
  );
}
