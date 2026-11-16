"use client";

import Link from "next/link";
import { useState } from "react";
import { BottomBar, btnPrimary } from "@/components/ui";
import { useHoldExpired } from "@/components/hold-timer";

export function AgreeAndPay({ bookingId, amountLabel, expiresAt }: { bookingId: string; amountLabel: string; expiresAt: string }) {
  const [agreed, setAgreed] = useState(false);
  const expired = useHoldExpired(expiresAt);
  return (
    <>
      <label className="card flex min-h-14 items-center gap-3 px-4 text-[15px] font-semibold">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-5 w-5 accent-primary" />
        취소 규정을 확인했고 동의해요 (필수)
      </label>
      <BottomBar>
        {agreed && !expired ? (
          <Link href={`/bookings/${bookingId}/pay`} className={btnPrimary}>
            {amountLabel} 결제하기
          </Link>
        ) : (
          <button className={btnPrimary} disabled>
            {expired ? "선점 시간이 지났어요" : `${amountLabel} 결제하기`}
          </button>
        )}
      </BottomBar>
    </>
  );
}
