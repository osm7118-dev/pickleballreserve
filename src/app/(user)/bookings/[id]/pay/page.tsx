// U07 결제 (토스 위젯 자리 — 지금은 Mock)
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { kstDateStr, rangeLabel } from "@/lib/time";
import { isBookingErrorCode, BOOKING_ERRORS } from "@/server/booking/errors";
import { HoldTimer } from "@/components/hold-timer";
import { Notice, TopBar } from "@/components/ui";
import { loadOwnBooking } from "../../load";
import { PayForm } from "@/components/pay-form";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser(`/bookings/${id}/pay`);
  const b = await loadOwnBooking(id, user.id);
  if (b.status === "confirmed") redirect(`/bookings/${b.id}/done`);
  if (b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt <= new Date()) {
    redirect(`/facilities/${b.facilityId}?date=${kstDateStr(b.startAt)}&notice=expired`);
  }
  return (
    <main className="pb-32">
      <TopBar title="결제" back={`/bookings/${b.id}/confirm`} />
      <div className="space-y-3 px-5 pt-4">
        <HoldTimer expiresAt={b.holdExpiresAt.toISOString()} />
        {error && <Notice tone="danger">{isBookingErrorCode(error) ? BOOKING_ERRORS[error] : "결제가 완료되지 않았어요. 다시 시도해 주세요."}</Notice>}
        <div className="card p-5">
          <p className="text-[15px] font-bold">
            {b.facility.name} · {b.court.name}
          </p>
          <p className="tabular text-[14px] text-muted">{rangeLabel(b.startAt, b.endAt)}</p>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="font-bold">총 결제 금액</span>
            <span className="tabular text-[22px] font-extrabold">{formatWon(b.totalAmount)}</span>
          </div>
        </div>
        <PayForm targetId={b.id} amountLabel={formatWon(b.totalAmount)} expiresAt={b.holdExpiresAt.toISOString()} />
      </div>
    </main>
  );
}
