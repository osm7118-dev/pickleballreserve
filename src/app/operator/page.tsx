// O01 운영자 로그인/시작
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { findStaffFacility } from "@/server/auth/staff";
import { demoLoginAction, logoutAction } from "../(user)/actions";
import { btnPrimary, btnSecondary } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OperatorStartPage() {
  const user = await getCurrentUser();
  if (user && (await findStaffFacility(user.id))) redirect("/operator/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <div className="card w-full max-w-md p-8">
        <p className="text-[13px] font-bold text-primary">시설 운영자</p>
        <h1 className="mt-1 text-[26px] font-extrabold">코트 예약, 한 화면에서 관리하세요</h1>
        <p className="mt-2 text-[15px] text-muted">예약 캘린더, 전화 예약 등록, 노쇼 처리까지 무료로 쓸 수 있어요.</p>

        {user ? (
          <div className="mt-6 space-y-3">
            <p className=" bg-warn-bg px-4 py-3 text-[14px] text-warn-ink">
              {user.name ?? "회원"}님 계정에는 관리 중인 시설이 없어요. 입점 신청 화면은 다음 단계에서 열려요.
            </p>
            <form action={logoutAction}>
              <button className={btnSecondary}>다른 계정으로 로그인</button>
            </form>
          </div>
        ) : (
          <div className="mt-8 space-y-3">
            <button
              type="button"
              disabled
              className="flex h-[54px] w-full items-center justify-center bg-[#FEE500] text-[16px] font-bold text-[#191919] opacity-50"
            >
              카카오로 시작하기
            </button>
            {env.DEMO_LOGIN === "on" && (
              <form action={demoLoginAction}>
                <input type="hidden" name="who" value="operator" />
                <button className={btnPrimary}>테스트 운영자로 체험하기</button>
              </form>
            )}
            <p className="text-center text-[13px] text-muted">카카오 로그인은 연결 준비 중이에요.</p>
          </div>
        )}
        <Link href="/" className="mt-6 block text-center text-[14px] font-semibold text-muted">
          이용자 화면으로
        </Link>
      </div>
    </main>
  );
}
