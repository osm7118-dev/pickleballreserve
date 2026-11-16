"use client";

import { useEffect, useState } from "react";
import { IconClock } from "./icons";

/** 선점 남은 시간(분:초). 0이 되면 onExpire 대신 안내 문구로 바뀐다. */
export function HoldTimer({ expiresAt }: { expiresAt: string }) {
  const end = new Date(expiresAt).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 500);
    return () => clearInterval(t);
  }, [end]);
  const sec = Math.ceil(left / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  if (sec <= 0) {
    return (
      <div className="flex items-center gap-2 rounded-[12px] bg-danger-bg px-4 py-3 text-[14px] font-semibold text-danger-ink">
        <IconClock /> 선점 시간이 지났어요. 시간을 다시 골라 주세요.
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-[12px] bg-warn-bg px-4 py-3 text-warn-ink">
      <span className="flex items-center gap-2 text-[14px] font-semibold">
        <IconClock /> 이 시간을 잠시 잡아 두었어요
      </span>
      <span className="tabular text-[18px] font-extrabold">{mm}:{ss}</span>
    </div>
  );
}

export function useHoldExpired(expiresAt: string): boolean {
  const end = new Date(expiresAt).getTime();
  const [expired, setExpired] = useState(() => Date.now() >= end);
  useEffect(() => {
    const t = setInterval(() => setExpired(Date.now() >= end), 500);
    return () => clearInterval(t);
  }, [end]);
  return expired;
}
