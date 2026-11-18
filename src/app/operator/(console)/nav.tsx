"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/operator/dashboard", label: "오늘" },
  { href: "/operator/calendar", label: "예약 캘린더" },
];
// 이후 단계(빌드 5단계)에서 여는 메뉴
const LATER = ["오픈플레이", "회원·매출", "시설 정보", "코트 관리", "운영시간·휴무", "가격 설정", "예약 규칙·취소 규정"];

export function OperatorNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
      {MAIN.map((m) => {
        const active = path.startsWith(m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            className={`flex h-11 shrink-0 items-center px-3 text-[15px] font-bold ${
              active ? "bg-accent text-ink" : "text-white/85 hover:bg-white/10"
            }`}
          >
            {m.label}
          </Link>
        );
      })}
      <div className="hidden pt-4 lg:block">
        <p className="px-3 pb-1 text-[12px] font-semibold text-white/40">준비 중</p>
        {LATER.map((l) => (
          <span key={l} className="flex h-9 items-center px-3 text-[14px] text-white/35">
            {l}
          </span>
        ))}
      </div>
    </nav>
  );
}
