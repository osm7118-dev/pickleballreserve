// 개인 레슨 상세·취소
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { formatKst, rangeLabel } from "@/lib/time";
import { lessonRefundQuote } from "@/server/lesson";
import { CancellationList } from "@/components/cancellation-list";
import { CancelButton } from "@/components/cancel-button";
import { Badge, Notice, Row, TopBar } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { cancelLessonAction } from "../../actions";
import { loadOwnLesson } from "./load";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string; cancelled?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/lessons/${id}`);
  const lb = await loadOwnLesson(id, user.id);
  const now = new Date();
  const quote = await lessonRefundQuote(lb.id, now);
  const payment = lb.payments.find((p) => p.status !== "ready" && p.status !== "failed");
  const refunded = payment?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <main className="pb-16">
      <TopBar title="레슨 예약" back="/bookings" />
      <div className="space-y-3 px-5 pt-4">
        {sp.paid && lb.status === "confirmed" && (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink">
              <IconCheck className="h-7 w-7" />
            </span>
            <p className="mt-3 text-[22px] font-extrabold">레슨 예약이 확정됐어요</p>
            <p className="text-[14px] text-muted">카카오 알림톡으로도 보내 드렸어요.</p>
          </div>
        )}
        {sp.cancelled && <Notice tone="primary">레슨을 취소했어요. 환불 금액은 결제수단으로 돌아가요.</Notice>}
        <div className="card p-5">
          <div className="flex items-center justify-between">
            {lb.status === "cancelled" ? (
              <Badge tone="danger">취소</Badge>
            ) : lb.status === "held" ? (
              <Badge tone="warn">결제 대기</Badge>
            ) : lb.endAt <= now ? (
              <Badge tone="muted">이용 완료</Badge>
            ) : (
              <Badge>예약 확정</Badge>
            )}
            <span className="tabular text-[13px] text-muted">{lb.bookingNo}</span>
          </div>
          <h1 className="mt-2 text-[20px] font-extrabold">개인 레슨 · {lb.coach.name}</h1>
          <p className="text-[14px] text-muted">{lb.facility.name}</p>
          <div className="mt-3 divide-y divide-line">
            <Row label="일시">
              <span className="tabular">{rangeLabel(lb.startAt, lb.endAt)}</span>
            </Row>
            <Row label="결제 금액">
              <span className="tabular font-extrabold">{formatWon(lb.amount)}</span>
            </Row>
            {lb.status === "cancelled" && (
              <Row label="환불 금액">
                <span className="tabular font-extrabold">{formatWon(refunded)}</span>
              </Row>
            )}
          </div>
        </div>
        {payment && (
          <div className="card p-5">
            <h2 className="mb-1 text-[17px] font-bold">영수증</h2>
            <div className="divide-y divide-line text-[14px]">
              <Row label="결제수단">{payment.method ?? "-"} (테스트)</Row>
              <Row label="결제 일시">
                <span className="tabular">{payment.approvedAt ? formatKst(payment.approvedAt, "yyyy.MM.dd HH:mm") : "-"}</span>
              </Row>
              <Row label="주문번호">
                <span className="tabular text-[13px]">{payment.orderId}</span>
              </Row>
            </div>
          </div>
        )}
        {lb.status === "held" && (
          <Link href={`/lessons/${lb.id}/pay`} className="block text-center font-bold text-primary">
            결제 이어서 하기
          </Link>
        )}
        {lb.status === "confirmed" && quote && (
          <div className="card space-y-3 p-5">
            <h2 className="text-[17px] font-bold">취소</h2>
            {quote.cancellable ? (
              <>
                <p className="tabular text-[15px]">
                  지금 취소하면 <b className={quote.refundAmount === 0 ? "text-danger" : ""}>{formatWon(quote.refundAmount)}</b> 환불 (
                  {quote.refundPercent}%)
                </p>
                <CancelButton action={cancelLessonAction} idName="bookingId" id={lb.id} label="레슨 취소하기" confirmLabel={`${formatWon(quote.refundAmount)} 환불`} />
              </>
            ) : (
              <p className="text-[14px] text-muted">레슨 시작 시간이 지나 취소할 수 없어요.</p>
            )}
            <div className="border-t border-line pt-3">
              <CancellationList tiers={lb.facility.cancellationTiers} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
