// 개인 레슨 확인·결제 (U06 + U07 과 같은 흐름)
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { kstDateStr, rangeLabel } from "@/lib/time";
import { BOOKING_ERRORS, isBookingErrorCode } from "@/server/booking/errors";
import { HoldTimer } from "@/components/hold-timer";
import { CancellationList } from "@/components/cancellation-list";
import { PayForm } from "@/components/pay-form";
import { Notice, Row, TopBar } from "@/components/ui";
import { loadOwnLesson } from "../load";

export const dynamic = "force-dynamic";

export default async function LessonPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser(`/lessons/${id}/pay`);
  const lb = await loadOwnLesson(id, user.id);
  if (lb.status === "confirmed") redirect(`/lessons/${lb.id}`);
  if (lb.status !== "held" || !lb.holdExpiresAt || lb.holdExpiresAt <= new Date()) {
    redirect(`/coaches/${lb.coachId}?date=${kstDateStr(lb.startAt)}&notice=expired`);
  }
  return (
    <main className="pb-32">
      <TopBar title="레슨 결제" back={`/coaches/${lb.coachId}?date=${kstDateStr(lb.startAt)}`} />
      <div className="space-y-3 px-5 pt-4">
        <HoldTimer expiresAt={lb.holdExpiresAt.toISOString()} />
        {error && <Notice tone="danger">{isBookingErrorCode(error) ? BOOKING_ERRORS[error] : "결제가 완료되지 않았어요. 다시 시도해 주세요."}</Notice>}
        <div className="card p-5">
          <p className="text-[13px] font-bold text-muted">개인 레슨</p>
          <h1 className="text-[20px] font-extrabold">{lb.coach.name}</h1>
          <div className="mt-2 divide-y divide-line">
            <Row label="시설">{lb.facility.name}</Row>
            <Row label="일시">
              <span className="tabular">{rangeLabel(lb.startAt, lb.endAt)}</span>
            </Row>
            <div className="flex items-center justify-between pt-3">
              <span className="font-bold">결제 금액</span>
              <span className="tabular text-[22px] font-extrabold">{formatWon(lb.amount)}</span>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-2 text-[17px] font-bold">취소 규정</h2>
          <CancellationList tiers={lb.facility.cancellationTiers} />
        </div>
        <PayForm kind="lesson" targetId={lb.id} amountLabel={formatWon(lb.amount)} expiresAt={lb.holdExpiresAt.toISOString()}>
          취소 규정을 확인했고 동의해요 (필수)
        </PayForm>
      </div>
    </main>
  );
}
