// U10 예약 상세·취소
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { formatKst, rangeLabel } from "@/lib/time";
import { refundQuoteFor } from "@/server/booking/manage";
import { CancellationList } from "@/components/cancellation-list";
import { StatusBadge } from "@/components/status-badge";
import { Notice, Row, TopBar } from "@/components/ui";
import { loadOwnBooking } from "../load";
import { CancelForm } from "./cancel-form";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { id } = await params;
  const { cancelled } = await searchParams;
  const user = await requireUser(`/bookings/${id}`);
  const b = await loadOwnBooking(id, user.id);
  const now = new Date();
  const quote = await refundQuoteFor(b.id, now);
  const payment = b.payments.find((p) => p.status !== "ready" && p.status !== "failed");
  const refunded = payment?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <main className="pb-16">
      <TopBar title="예약 상세" back="/bookings" />
      <div className="space-y-3 px-5 pt-4">
        {cancelled && <Notice tone="primary">예약을 취소했어요. 환불 금액은 결제수단으로 돌아가요.</Notice>}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <StatusBadge b={b} now={now} />
            <span className="tabular text-[13px] text-muted">{b.bookingNo}</span>
          </div>
          <h2 className="mt-2 text-[20px] font-extrabold">{b.facility.name}</h2>
          <p className="text-[14px] text-muted">{b.facility.address}</p>
          <div className="mt-3 divide-y divide-line">
            <Row label="코트">{b.court.name}</Row>
            <Row label="일시">
              <span className="tabular">{rangeLabel(b.startAt, b.endAt)}</span>
            </Row>
            <Row label="결제 금액">
              <span className="tabular font-extrabold">{formatWon(b.totalAmount)}</span>
            </Row>
            {b.status === "cancelled" && (
              <Row label="환불 금액">
                <span className="tabular font-extrabold">{formatWon(refunded)}</span>
              </Row>
            )}
          </div>
        </div>

        {payment && (
          <div className="card p-5">
            <h3 className="mb-1 text-[17px] font-bold">영수증</h3>
            <div className="divide-y divide-line text-[14px]">
              <Row label="결제수단">{payment.method ?? "-"} (테스트)</Row>
              <Row label="결제 일시">
                <span className="tabular">{payment.approvedAt ? formatKst(payment.approvedAt, "yyyy.MM.dd HH:mm") : "-"}</span>
              </Row>
              <Row label="주문번호">
                <span className="tabular text-[13px]">{payment.orderId}</span>
              </Row>
              {payment.refunds.map((r) => (
                <Row key={r.id} label={`환불 (${r.refundPercent}%)`}>
                  <span className="tabular">
                    -{formatWon(r.amount)} · {formatKst(r.createdAt, "MM.dd HH:mm")}
                  </span>
                </Row>
              ))}
            </div>
          </div>
        )}

        {b.status === "confirmed" && quote && (
          <div className="card space-y-3 p-5">
            <h3 className="text-[17px] font-bold">취소</h3>
            {quote.cancellable ? (
              <>
                <div className="rounded-[12px] bg-bg px-4 py-3">
                  <p className="text-[13px] font-semibold text-muted">지금 취소하면 ({quote.refundPercent}% 환불)</p>
                  <p className={`tabular text-[22px] font-extrabold ${quote.refundAmount === 0 ? "text-danger" : ""}`}>
                    {formatWon(quote.refundAmount)} 돌려받아요
                  </p>
                </div>
                {quote.reason === "grace" && (
                  <p className="text-[13px] text-muted">결제 후 10분 안이라 전액 환불돼요.</p>
                )}
                <CancelForm bookingId={b.id} refundLabel={formatWon(quote.refundAmount)} />
              </>
            ) : (
              <p className="text-[14px] text-muted">이용 시작 시간이 지나 취소할 수 없어요.</p>
            )}
            <div className="border-t border-line pt-3">
              <CancellationList tiers={b.facility.cancellationTiers} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
