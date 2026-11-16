// U08 예약 완료
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { maskPhone } from "@/lib/phone";
import { rangeLabel } from "@/lib/time";
import { IconCheck } from "@/components/icons";
import { BottomBar, Row, btnPrimary, btnSecondary } from "@/components/ui";
import { loadOwnBooking } from "../../load";

export const dynamic = "force-dynamic";

export default async function DonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/bookings/${id}/done`);
  const b = await loadOwnBooking(id, user.id);
  if (b.status !== "confirmed") redirect(`/bookings/${b.id}`);
  const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(b.facility.address)}`;
  return (
    <main className="px-5 pt-14 pb-36">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-ink">
          <IconCheck className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-[24px] font-extrabold">예약이 확정됐어요</h1>
        <p className="mt-1 text-[15px] text-muted">
          {maskPhone(user.phone)}으로 카카오 알림톡을 보냈어요.
          <br />
          이용 전날 저녁 8시에 한 번 더 알려 드려요.
        </p>
      </div>
      <div className="card mt-6 p-5">
        <div className="divide-y divide-line">
          <Row label="예약번호">
            <span className="tabular">{b.bookingNo}</span>
          </Row>
          <Row label="시설">{b.facility.name}</Row>
          <Row label="코트">{b.court.name}</Row>
          <Row label="일시">
            <span className="tabular">{rangeLabel(b.startAt, b.endAt)}</span>
          </Row>
          <Row label="결제 금액">
            <span className="tabular font-extrabold">{formatWon(b.totalAmount)}</span>
          </Row>
        </div>
      </div>
      <a href={mapUrl} target="_blank" rel="noreferrer" className={`${btnSecondary} mt-3`}>
        길찾기 (카카오맵)
      </a>
      <BottomBar>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/bookings/${b.id}`} className={btnSecondary + " !h-[54px]"}>
            예약 상세
          </Link>
          <Link href="/" className={btnPrimary}>
            홈으로
          </Link>
        </div>
      </BottomBar>
    </main>
  );
}
