// U11 오픈플레이 상세
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { formatKst, rangeLabel } from "@/lib/time";
import { BOOKING_ERRORS, isBookingErrorCode } from "@/server/booking/errors";
import { getOpenPlaySession, openPlayRefundQuote } from "@/server/open-play";
import { CancellationList } from "@/components/cancellation-list";
import { CancelButton } from "@/components/cancel-button";
import { BottomBar, Badge, Notice, Row, TopBar, btnPrimary } from "@/components/ui";
import { cancelOpenPlayAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function OpenPlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ joined?: string; cancelled?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  const info = await getOpenPlaySession(id, user?.id ?? null);
  if (!info) notFound();
  const { session, courts, joined, mine } = info;
  const now = new Date();
  const left = Math.max(0, session.capacity - joined);
  const open = session.status === "open" && session.startAt > now;
  const quote = mine ? await openPlayRefundQuote(session.id, user!.id, now) : null;
  const refunded = info.cancelledMine?.payment?.refunds.reduce((s, r) => s + r.amount, 0);

  return (
    <main className="pb-32">
      <TopBar title="오픈플레이" back={`/facilities/${session.facilityId}/programs`} />
      <div className="space-y-3 px-5 pt-4">
        {sp.joined && mine && <Notice tone="primary">참가가 확정됐어요. 시작 10분 전까지 와 주세요.</Notice>}
        {sp.cancelled && <Notice tone="primary">참가를 취소했어요. 환불 {formatWon(refunded ?? 0)}은 결제수단으로 돌아가요.</Notice>}
        {sp.error && <Notice tone="danger">{isBookingErrorCode(sp.error) ? BOOKING_ERRORS[sp.error] : "처리하지 못했어요."}</Notice>}
        <div className="card p-5">
          <div className="flex gap-1.5">
            <Badge tone="accent">오픈플레이</Badge>
            {mine && <Badge>참가 확정</Badge>}
          </div>
          <h1 className="mt-2 text-[21px] font-extrabold">{session.title}</h1>
          <p className="text-[14px] text-muted">{session.facility.name}</p>
          <div className="mt-3 divide-y divide-line">
            <Row label="일시">
              <span className="tabular">{rangeLabel(session.startAt, session.endAt)}</span>
            </Row>
            <Row label="코트">{courts.map((c) => c.name).join(", ")}</Row>
            <Row label="정원">
              <span className="tabular">
                {joined}/{session.capacity}명 · {left > 0 ? `${left}자리 남음` : "마감"}
              </span>
            </Row>
            <Row label="참가비">
              <span className="tabular font-extrabold">{formatWon(session.fee)}</span>
            </Row>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slot-booked" aria-hidden>
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (joined / session.capacity) * 100)}%` }} />
          </div>
        </div>

        {mine?.payment && (
          <div className="card p-5">
            <h2 className="mb-1 text-[17px] font-bold">결제 내역</h2>
            <div className="divide-y divide-line text-[14px]">
              <Row label="결제수단">{mine.payment.method ?? "-"} (테스트)</Row>
              <Row label="결제 일시">
                <span className="tabular">{mine.payment.approvedAt ? formatKst(mine.payment.approvedAt, "yyyy.MM.dd HH:mm") : "-"}</span>
              </Row>
            </div>
          </div>
        )}

        {mine && quote && (
          <div className="card space-y-3 p-5">
            <h2 className="text-[17px] font-bold">참가 취소</h2>
            {quote.cancellable ? (
              <>
                <p className="tabular text-[15px]">
                  지금 취소하면 <b className={quote.refundAmount === 0 ? "text-danger" : ""}>{formatWon(quote.refundAmount)}</b> 환불 (
                  {quote.refundPercent}%)
                </p>
                <CancelButton action={cancelOpenPlayAction} idName="sessionId" id={session.id} label="참가 취소하기" confirmLabel={`${formatWon(quote.refundAmount)} 환불`} />
              </>
            ) : (
              <p className="text-[14px] text-muted">시작 시간이 지나 취소할 수 없어요.</p>
            )}
          </div>
        )}

        <div className="card p-5">
          <h2 className="mb-2 text-[17px] font-bold">취소 규정</h2>
          <CancellationList tiers={session.facility.cancellationTiers} />
        </div>
      </div>

      {!mine && (
        <BottomBar>
          {open && left > 0 ? (
            <Link href={user ? `/open-play/${session.id}/pay` : `/login?next=/open-play/${session.id}/pay`} className={btnPrimary}>
              {formatWon(session.fee)} 내고 참가 신청
            </Link>
          ) : (
            <button className={btnPrimary} disabled>
              {open ? "정원이 다 찼어요" : "신청이 끝났어요"}
            </button>
          )}
        </BottomBar>
      )}
    </main>
  );
}
