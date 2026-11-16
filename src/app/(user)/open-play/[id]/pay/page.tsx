// U11 → U07 오픈플레이 참가비 결제
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { rangeLabel } from "@/lib/time";
import { getOpenPlaySession } from "@/server/open-play";
import { PayForm } from "@/components/pay-form";
import { TopBar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OpenPlayPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/open-play/${id}/pay`);
  if (!user.phone) redirect(`/signup?next=/open-play/${id}/pay`);
  const info = await getOpenPlaySession(id, user.id);
  if (!info) notFound();
  if (info.mine) redirect(`/open-play/${id}`);
  const { session } = info;
  return (
    <main className="pb-32">
      <TopBar title="참가비 결제" back={`/open-play/${id}`} />
      <div className="space-y-3 px-5 pt-4">
        <div className="card p-5">
          <p className="text-[15px] font-bold">{session.title}</p>
          <p className="text-[14px] text-muted">{session.facility.name}</p>
          <p className="tabular text-[14px] text-muted">{rangeLabel(session.startAt, session.endAt)}</p>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="font-bold">참가비</span>
            <span className="tabular text-[22px] font-extrabold">{formatWon(session.fee)}</span>
          </div>
        </div>
        <PayForm kind="open_play" targetId={session.id} amountLabel={formatWon(session.fee)}>
          취소 규정을 확인했고 동의해요 (필수)
        </PayForm>
      </div>
    </main>
  );
}
