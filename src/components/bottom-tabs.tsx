"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconTicket, IconUser } from "./icons";

const TABS = [
  { href: "/", label: "홈", Icon: IconHome, match: (p: string) => p === "/" || p.startsWith("/search") || p.startsWith("/facilities") },
  { href: "/bookings", label: "내 예약", Icon: IconTicket, match: (p: string) => p.startsWith("/bookings") },
  { href: "/me", label: "마이", Icon: IconUser, match: (p: string) => p.startsWith("/me") },
];

/** 이용자 하단 탭: 홈 / 내 예약 / 마이 */
export function BottomTabs() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30">
      <div className="mx-auto grid max-w-[430px] grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${active ? "text-primary" : "text-muted-2"}`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
