// U06 예약 확인
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { durationLabel, kstDateStr, rangeLabel } from "@/lib/time";
import { HoldTimer } from "@/components/hold-timer";
import { CancellationList } from "@/components/cancellation-list";
import { Row, TopBar } from "@/components/ui";
import { loadOwnBooking } from "../../load";
import { AgreeAndPay } from "./agree";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/bookings/${id}/confirm`);
  const b = await loadOwnBooking(id, user.id);
  if (b.status === "confirmed") redirect(`/bookings/${b.id}`);
  if (b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt <= new Date()) {
    redirect(`/facilities/${b.facilityId}?date=${kstDateStr(b.startAt)}&notice=expired`);
  }
  const minutes = (b.endAt.getTime() - b.startAt.getTime()) / 60000;
  return (
    <main className="pb-32">
      <TopBar title="예약 확인" back={`/facilities/${b.facilityId}?date=${kstDateStr(b.startAt)}`} />
      <div className="space-y-3 px-5 pt-4">
        <HoldTimer expiresAt={b.holdExpiresAt.toISOString()} />
        <div className="card p-5">
          <p className="text-[13px] font-bold text-muted">{b.facility.address}</p>
          <h2 className="text-[20px] font-extrabold">{b.facility.name}</h2>
          <div className="mt-3 divide-y divide-line">
            <Row label="코트">{b.court.name}</Row>
            <Row label="일시">
              <span className="tabular">{rangeLabel(b.startAt, b.endAt)}</span>
            </Row>
            <Row label="이용 시간">{durationLabel(minutes)}</Row>
            <div className="flex items-center justify-between pt-3">
              <span className="font-bold">결제 금액</span>
              <span className="tabular text-[22px] font-extrabold">{formatWon(b.totalAmount)}</span>
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h3 className="mb-2 text-[17px] font-bold">취소 규정</h3>
          <CancellationList tiers={b.facility.cancellationTiers} />
        </div>
        <AgreeAndPay bookingId={b.id} amountLabel={formatWon(b.totalAmount)} expiresAt={b.holdExpiresAt.toISOString()} />
      </div>
    </main>
  );
}
