// U01 스플래시/카카오 로그인
import Link from "next/link";
import { env } from "@/lib/env";
import { safeNext } from "@/lib/auth";
import { demoLoginAction } from "../actions";
import { btnPrimary, btnSecondary } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col px-5 pt-20 pb-10">
      <div className="flex-1">
        <div className="mb-6 flex h-14 w-14 items-center justify-center bg-primary">
          <span className="block h-6 w-6 rounded-full bg-accent" />
        </div>
        <h1 className="text-[28px] leading-tight font-extrabold">
          빈 피클볼 코트,
          <br />
          30분 단위로 바로 예약
        </h1>
        <p className="mt-3 text-[15px] text-muted">서울·수도권 인도어 피클볼장을 한 곳에서 찾고 결제까지 끝내요.</p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          disabled
          className="flex h-[54px] w-full items-center justify-center gap-2 bg-[#FEE500] text-[16px] font-bold text-[#191919] opacity-50"
        >
          카카오로 시작하기
        </button>
        <p className="text-center text-[13px] text-muted">카카오 로그인은 연결 준비 중이에요. 지금은 테스트 계정으로 체험해 보세요.</p>

        {env.DEMO_LOGIN === "on" && (
          <div className="card space-y-3 p-4">
            <p className="text-[13px] font-bold text-muted">테스트 계정</p>
            <form action={demoLoginAction}>
              <input type="hidden" name="who" value="customer" />
              <input type="hidden" name="next" value={safeNext(next)} />
              <button className={btnPrimary}>고객으로 체험하기</button>
            </form>
            <form action={demoLoginAction}>
              <input type="hidden" name="who" value="operator" />
              <button className={btnSecondary}>시설 운영자로 체험하기 (PC 화면)</button>
            </form>
          </div>
        )}
        <Link href="/" className="block py-2 text-center text-[14px] font-semibold text-muted">
          로그인 없이 둘러보기
        </Link>
      </div>
    </main>
  );
}
