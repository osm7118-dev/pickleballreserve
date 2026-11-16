// U02 추가 정보·약관 동의
import { requireUser, safeNext } from "@/lib/auth";
import { TopBar } from "@/components/ui";
import { SignupForm } from "./form";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const user = await requireUser("/signup");
  return (
    <main className="pb-10">
      <TopBar title="추가 정보" />
      <div className="px-5 pt-6">
        <h2 className="text-[22px] font-extrabold">{user.name ?? "회원"}님, 반가워요</h2>
        <p className="mt-1 mb-6 text-[15px] text-muted">예약 알림을 받을 번호와 약관 동의만 확인할게요.</p>
        <SignupForm next={safeNext(next)} />
      </div>
    </main>
  );
}
