import Link from "next/link";
import type { ReactNode } from "react";
import { IconBack } from "./icons";

export const btnPrimary =
  "inline-flex h-[54px] w-full items-center justify-center rounded-[14px] bg-primary px-5 text-[16px] font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slot-booked disabled:text-muted-2";
export const btnSecondary =
  "inline-flex h-12 w-full items-center justify-center rounded-[12px] border border-line-strong bg-surface px-4 text-[15px] font-semibold text-ink transition hover:bg-bg";
export const btnDanger =
  "inline-flex h-12 w-full items-center justify-center rounded-[12px] bg-danger px-4 text-[15px] font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slot-booked disabled:text-muted-2";
export const inputCls =
  "h-12 w-full rounded-[12px] border border-line-strong bg-surface px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export function TopBar({ title, back }: { title: string; back?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-line bg-surface/95 px-2 backdrop-blur">
      {back ? (
        <Link href={back} aria-label="뒤로" className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-bg">
          <IconBack />
        </Link>
      ) : (
        <span className="w-3" />
      )}
      <h1 className="truncate text-[17px] font-bold">{title}</h1>
    </header>
  );
}

/** 화면 하단 고정 바 (흰 바탕 + 위쪽 구분선) */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto max-w-[430px] border-t border-line bg-surface px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}

type Tone = "primary" | "accent" | "warn" | "danger" | "muted";
const toneCls: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary-hover",
  accent: "bg-accent text-ink",
  warn: "bg-warn-bg text-warn-ink",
  danger: "bg-danger-bg text-danger-ink",
  muted: "bg-slot-booked text-muted",
};

export function Badge({ tone = "primary", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ${toneCls[tone]}`}>
      {children}
    </span>
  );
}

export function Notice({ tone = "warn", children }: { tone?: "warn" | "danger" | "primary"; children: ReactNode }) {
  const cls =
    tone === "danger"
      ? "bg-danger-bg text-danger-ink"
      : tone === "primary"
        ? "bg-primary-soft text-primary-hover"
        : "bg-warn-bg text-warn-ink";
  return <div className={`rounded-[12px] px-4 py-3 text-[14px] font-medium ${cls}`}>{children}</div>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[15px]">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
