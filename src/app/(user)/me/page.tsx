// U12 마이페이지
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { maskPhone } from "@/lib/phone";
import { BottomTabs } from "@/components/bottom-tabs";
import { Row, TopBar, btnPrimary, btnSecondary } from "@/components/ui";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getCurrentUser();
  return (
    <main className="pb-24">
      <TopBar title="마이" />
      <div className="space-y-3 px-5 pt-4">
        {!user ? (
          <div className="card p-6 text-center">
            <p className="mb-4 text-muted">로그인하면 예약과 알림을 관리할 수 있어요.</p>
            <Link href="/login?next=/me" className={btnPrimary}>
              로그인
            </Link>
          </div>
        ) : (
          <>
            <div className="card p-5">
              <h2 className="text-[20px] font-extrabold">{user.name ?? "회원"}님</h2>
              <div className="mt-2 divide-y divide-line">
                <Row label="휴대폰">{maskPhone(user.phone)}</Row>
                <Row label="예약 알림톡">받음</Row>
                <Row label="혜택·이벤트 알림">{user.marketingAgreed ? "받음" : "받지 않음"}</Row>
              </div>
            </div>
            <div className="card divide-y divide-line px-5 text-[15px]">
              <p className="py-3">이용약관</p>
              <p className="py-3">개인정보 처리방침</p>
            </div>
            <form action={logoutAction}>
              <button className={btnSecondary}>로그아웃</button>
            </form>
          </>
        )}
        <Link href="/operator" className="block py-3 text-center text-[14px] font-semibold text-muted">
          시설 운영자이신가요? 운영자 화면으로
        </Link>
      </div>
      <BottomTabs />
    </main>
  );
}
