"use client";

import { useActionState } from "react";
import { signupAction } from "../actions";
import { btnPrimary, inputCls } from "@/components/ui";

const items = [
  { name: "terms", label: "[필수] 이용약관 동의" },
  { name: "privacy", label: "[필수] 개인정보 수집·이용 동의" },
  { name: "alimtalk", label: "[필수] 예약 알림톡 수신 동의" },
  { name: "marketing", label: "[선택] 혜택·이벤트 알림 수신" },
];

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-2 block text-[14px] font-bold">휴대폰 번호</span>
        <input name="phone" inputMode="tel" placeholder="010-1234-5678" className={inputCls} required />
        <span className="mt-1.5 block text-[13px] text-muted">예약 확정·취소 알림톡을 이 번호로 보내요.</span>
      </label>
      <div className="card divide-y divide-line px-4">
        {items.map((it) => (
          <label key={it.name} className="flex min-h-12 items-center gap-3 py-2 text-[15px]">
            <input type="checkbox" name={it.name} className="h-5 w-5 accent-primary" />
            {it.label}
          </label>
        ))}
      </div>
      {state?.error && <p className="text-[14px] font-semibold text-danger">{state.error}</p>}
      <button className={btnPrimary} disabled={pending}>
        {pending ? "저장 중…" : "동의하고 시작하기"}
      </button>
    </form>
  );
}
