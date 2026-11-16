// O03 대시보드(오늘)
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatWon } from "@/lib/money";
import { maskPhone } from "@/lib/phone";
import { dateLabel, formatKst, kstAt, rangeLabel, todayKst } from "@/lib/time";
import { findStaffFacility } from "@/server/auth/staff";
import { Badge } from "@/components/ui";
import { IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = (await getCurrentUser())!;
  const facility = (await findStaffFacility(user.id))!;
  const now = new Date();
  const today = todayKst(now);
  const dayStart = kstAt(today, 0);
  const dayEnd = kstAt(today, 24 * 60);

  const [todayBookings, recentCancels, courts, hours, prices, policy, tiers] = await Promise.all([
    db.booking.findMany({
      where: { facilityId: facility.id, startAt: { gte: dayStart, lt: dayEnd }, status: { in: ["confirmed", "completed", "no_show"] } },
      include: { court: true, user: true },
      orderBy: { startAt: "asc" },
    }),
    db.booking.findMany({
      where: { facilityId: facility.id, status: "cancelled", cancelReason: { not: "선점 시간 만료" } },
      include: { court: true, user: true },
      orderBy: { cancelledAt: "desc" },
      take: 5,
    }),
    db.court.count({ where: { facilityId: facility.id, isActive: true } }),
    db.operatingHour.count({ where: { facilityId: facility.id } }),
    db.priceRule.count({ where: { facilityId: facility.id } }),
    db.bookingPolicy.findUnique({ where: { facilityId: facility.id } }),
    db.cancellationTier.count({ where: { facilityId: facility.id } }),
  ]);

  const next = todayBookings.find((b) => b.status === "confirmed" && b.endAt > now);
  const appCount = todayBookings.filter((b) => b.source === "app").length;
  const sales = todayBookings.filter((b) => b.source === "app").reduce((s, b) => s + b.totalAmount, 0);
  const checklist = [
    { label: "코트 등록", done: courts > 0 },
    { label: "운영시간", done: hours > 0 },
    { label: "가격 설정", done: prices > 0 },
    { label: "예약 규칙", done: policy !== null },
    { label: "취소 규정", done: tiers > 0 },
    { label: "입점 승인", done: facility.status === "approved" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-muted">{dateLabel(today)}</p>
          <h1 className="text-[26px] font-extrabold">오늘</h1>
        </div>
        <Link href="/operator/calendar" className="inline-flex h-11 items-center rounded-[12px] bg-primary px-5 font-bold text-white hover:bg-primary-hover">
          예약 캘린더 열기
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="오늘 예약" value={`${todayBookings.length}건`} sub={`앱 ${appCount} · 수동 ${todayBookings.length - appCount}`} />
        <Stat label="오늘 앱 결제 금액" value={formatWon(sales)} sub="수수료 차감 전" />
        <Stat
          label="다음 예약"
          value={next ? formatKst(next.startAt, "HH:mm") : "없음"}
          sub={next ? `${next.court.name} · ${next.user?.name ?? next.guestName ?? ""}` : "오늘 남은 예약이 없어요"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section className="card p-5">
          <h2 className="mb-3 text-[18px] font-bold">오늘 예약</h2>
          {todayBookings.length === 0 ? (
            <p className="py-6 text-center text-muted">오늘 예약이 없어요.</p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted">
                  <th className="py-2 font-semibold">시간</th>
                  <th className="font-semibold">코트</th>
                  <th className="font-semibold">예약자</th>
                  <th className="font-semibold">경로</th>
                  <th className="font-semibold">상태</th>
                </tr>
              </thead>
              <tbody>
                {todayBookings.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="tabular py-2.5 font-semibold">
                      <Link href={`/operator/calendar?date=${today}&b=${b.id}`} className="hover:text-primary">
                        {formatKst(b.startAt, "HH:mm")}~{formatKst(b.endAt, "HH:mm")}
                      </Link>
                    </td>
                    <td>{b.court.name}</td>
                    <td>
                      {b.user?.name ?? b.guestName}{" "}
                      <span className="tabular text-muted">{maskPhone(b.user?.phone ?? b.guestPhone)}</span>
                    </td>
                    <td>{b.source === "app" ? "앱" : "전화·현장"}</td>
                    <td>
                      {b.status === "no_show" ? (
                        <Badge tone="danger">노쇼</Badge>
                      ) : b.endAt <= now ? (
                        <Badge tone="muted">이용 완료</Badge>
                      ) : (
                        <Badge>확정</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-[18px] font-bold">설정 체크리스트</h2>
            <ul className="space-y-2">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-[15px]">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${c.done ? "bg-primary text-white" : "border border-line-strong"}`}
                  >
                    {c.done && <IconCheck className="h-4 w-4" />}
                  </span>
                  <span className={c.done ? "text-muted" : "font-semibold"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-5">
            <h2 className="mb-3 text-[18px] font-bold">최근 취소</h2>
            {recentCancels.length === 0 ? (
              <p className="text-[14px] text-muted">최근 취소가 없어요.</p>
            ) : (
              <ul className="space-y-2 text-[14px]">
                {recentCancels.map((b) => (
                  <li key={b.id}>
                    <p className="font-semibold">
                      {b.court.name} · {b.user?.name ?? b.guestName}
                    </p>
                    <p className="tabular text-muted">
                      {rangeLabel(b.startAt, b.endAt)} · {b.cancelReason}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-[13px] font-bold text-muted">{label}</p>
      <p className="tabular mt-1 text-[26px] leading-tight font-extrabold">{value}</p>
      <p className="mt-1 truncate text-[13px] text-muted">{sub}</p>
    </div>
  );
}
