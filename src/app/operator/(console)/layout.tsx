import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { findStaffFacility } from "@/server/auth/staff";
import { logoutAction } from "../../(user)/actions";
import { OperatorNav } from "./nav";

export const dynamic = "force-dynamic";

/** 운영자 웹(PC): 왼쪽 ink 사이드 메뉴 + 오른쪽 본문. 해당 시설 staff 만. */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/operator");
  const facility = await findStaffFacility(user.id);
  if (!facility) redirect("/operator");
  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <aside className="bg-ink text-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between px-5 py-4 lg:block lg:py-6">
          <div>
            <p className="text-[12px] font-semibold text-white/60">운영자</p>
            <p className="text-[17px] font-extrabold">{facility.name}</p>
          </div>
          <form action={logoutAction} className="lg:hidden">
            <button className="text-[13px] font-semibold text-white/70">로그아웃</button>
          </form>
        </div>
        <OperatorNav />
        <form action={logoutAction} className="hidden px-5 pt-6 lg:block">
          <button className="text-[13px] font-semibold text-white/60 hover:text-white">로그아웃</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-8">{children}</main>
    </div>
  );
}
