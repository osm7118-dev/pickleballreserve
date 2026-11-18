// O09 예약 캘린더 (일 보기)
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { formatWon } from "@/lib/money";
import { maskPhone } from "@/lib/phone";
import { addDays, dateLabel, durationLabel, isDateStr, kstAt, minuteLabel, todayKst } from "@/lib/time";
import { findStaffFacility } from "@/server/auth/staff";
import { BOOKING_ERRORS, isBookingErrorCode } from "@/server/booking/errors";
import { getFacilityDay, type CourtDay, type SlotBooking } from "@/server/booking/schedule";
import { Badge, Notice, Row } from "@/components/ui";
import { blackoutAction, deleteBlackoutAction, manualBookingAction, noShowAction, operatorCancelAction } from "../../actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  cancelled: "예약을 취소했어요. 결제한 금액은 전액 환불돼요.",
  noshow: "노쇼로 처리했어요.",
  booked: "수동 예약을 등록했어요.",
  blocked: "시간을 차단했어요.",
  unblocked: "차단을 풀었어요.",
};
const ERRORS: Record<string, string> = { INPUT: "입력을 확인해 주세요.", PHONE: "전화번호를 확인해 주세요." };

type Block =
  | { kind: "booking"; booking: SlotBooking; start: number; end: number }
  | { kind: "blackout"; id: string; reason: string | null; allCourts: boolean; start: number; end: number };

function blocksOf(court: CourtDay): Block[] {
  const blocks: Block[] = court.bookings.map((b) => ({ kind: "booking", booking: b, start: b.startMinute, end: b.endMinute }));
  for (const bo of court.blackouts) blocks.push({ kind: "blackout", id: bo.id, reason: bo.reason, allCourts: bo.allCourts, start: bo.startMinute, end: bo.endMinute });
  return blocks;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = (await getCurrentUser())!;
  const facility = (await findStaffFacility(user.id))!;
  const today = todayKst();
  const date = sp.date && isDateStr(sp.date) ? sp.date : today;
  const now = new Date();
  const day = await getFacilityDay(facility.id, date, now);

  const open = day.openMinute ?? 9 * 60;
  const close = day.closeMinute ?? 22 * 60;
  const rows: number[] = [];
  for (let m = open; m < close; m += 30) rows.push(m);
  const rowOf = (m: number) => Math.max(0, Math.min(rows.length, (m - open) / 30));

  const selectedBooking = sp.b
    ? await db.booking.findFirst({
        where: { id: sp.b, facilityId: facility.id },
        include: { user: true, court: true, payments: { include: { refunds: true } } },
      })
    : null;
  const selCourt = sp.court ? day.courts.find((c) => c.id === sp.court) : undefined;
  const selMinute = sp.m !== undefined ? Number(sp.m) : NaN;
  const selBlackout = sp.bo ? day.courts.flatMap((c) => c.blackouts).find((bo) => bo.id === sp.bo) : undefined;

  // 빈 칸에서 이어지는 최대 길이 (수동 예약·차단 시간 선택지)
  let maxFree = 0;
  if (selCourt && Number.isInteger(selMinute)) {
    for (let m = selMinute; m < close; m += 30) {
      const taken = blocksOf(selCourt).some((b) => b.start <= m && m < b.end);
      if (taken) break;
      maxFree += 30;
    }
  }
  const durations = Array.from({ length: Math.floor(Math.min(maxFree, 240) / 60) }, (_, i) => (i + 1) * 60);
  const err = sp.err ? (isBookingErrorCode(sp.err) ? BOOKING_ERRORS[sp.err] : ERRORS[sp.err] ?? "처리하지 못했어요.") : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold">예약 캘린더</h1>
          <p className="text-[14px] text-muted">빈 칸을 누르면 수동 예약·차단, 예약을 누르면 취소·노쇼 처리를 할 수 있어요.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/operator/calendar?date=${addDays(date, -1)}`} className="flex h-11 w-11 items-center justify-center border border-line-strong bg-surface" aria-label="이전 날">
            ‹
          </Link>
          <span className="tabular min-w-36 text-center text-[17px] font-bold">{dateLabel(date)}</span>
          <Link href={`/operator/calendar?date=${addDays(date, 1)}`} className="flex h-11 w-11 items-center justify-center border border-line-strong bg-surface" aria-label="다음 날">
            ›
          </Link>
          <Link href="/operator/calendar" className="flex h-11 items-center border border-line-strong bg-surface px-4 text-[14px] font-semibold">
            오늘
          </Link>
        </div>
      </header>

      {sp.msg && MESSAGES[sp.msg] && <Notice tone="primary">{MESSAGES[sp.msg]}</Notice>}
      {err && <Notice tone="danger">{err}</Notice>}

      <div className="flex flex-wrap gap-4 text-[13px] text-muted">
        <Legend cls="bg-primary" text="앱 예약" />
        <Legend cls="bg-accent border border-accent-line" text="수동 예약" />
        <Legend cls="bg-ink" text="오픈플레이" />
        <Legend cls="bg-primary-soft border border-primary/30" text="결제 대기" />
        <Legend cls="bg-danger-bg border border-danger/40" text="노쇼" />
        <Legend cls="hatch border border-line-strong" text="차단" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="card overflow-x-auto p-4">
          {day.openMinute === null ? (
            <p className="py-10 text-center text-muted">이 날은 운영하지 않아요.</p>
          ) : (
            <div
              className="grid min-w-[560px] gap-x-1.5"
              style={{
                gridTemplateColumns: `52px repeat(${day.courts.length}, minmax(110px, 1fr))`,
                gridTemplateRows: `32px repeat(${rows.length}, 26px)`,
              }}
            >
              {day.courts.map((c, ci) => (
                <div key={c.id} style={{ gridColumn: ci + 2, gridRow: 1 }} className="text-center text-[14px] font-bold">
                  {c.name}
                </div>
              ))}
              {rows.map((m, ri) => (
                <div key={m} style={{ gridColumn: 1, gridRow: ri + 2 }} className="tabular -mt-2 pr-2 text-right text-[12px] text-muted">
                  {m % 60 === 0 ? minuteLabel(m) : ""}
                </div>
              ))}
              {day.courts.map((c, ci) =>
                rows.map((m, ri) => {
                  // 빈 칸은 1시간 단위 (그리드 행은 30분 2칸)
                  if (m % 60 !== 0 || m + 60 > close) return null;
                  if (blocksOf(c).some((b) => b.start < m + 60 && m < b.end)) return null;
                  const past = kstAt(date, m + 60).getTime() <= now.getTime();
                  const active = selCourt?.id === c.id && selMinute === m;
                  return past ? (
                    <div key={`${c.id}-${m}`} style={{ gridColumn: ci + 2, gridRow: `${ri + 2} / span 2` }} className="border-t border-line bg-bg/60" />
                  ) : (
                    <Link
                      key={`${c.id}-${m}`}
                      href={`/operator/calendar?date=${date}&court=${c.id}&m=${m}`}
                      scroll={false}
                      style={{ gridColumn: ci + 2, gridRow: `${ri + 2} / span 2` }}
                      className={`border-t border-line hover:bg-primary-soft ${active ? "bg-primary-soft ring-2 ring-primary ring-inset" : ""}`}
                      aria-label={`${c.name} ${minuteLabel(m)} 빈 칸`}
                    />
                  );
                }),
              )}
              {day.courts.map((c, ci) =>
                blocksOf(c)
                  .filter((b) => b.end > open && b.start < close)
                  .map((b) => {
                    const r0 = rowOf(b.start);
                    const span = Math.max(1, rowOf(b.end) - r0);
                    const style = { gridColumn: ci + 2, gridRow: `${r0 + 2} / span ${span}` };
                    if (b.kind === "blackout") {
                      return (
                        <Link
                          key={`${c.id}-bo-${b.id}`}
                          href={`/operator/calendar?date=${date}&bo=${b.id}`}
                          scroll={false}
                          style={style}
                          className="hatch my-0.5 border border-line-strong px-2 py-1 text-[12px] font-semibold text-muted"
                        >
                          차단{b.reason ? ` · ${b.reason}` : ""}
                        </Link>
                      );
                    }
                    const bk = b.booking;
                    const tone =
                      bk.status === "no_show"
                        ? "bg-danger-bg text-danger-ink border border-danger/40"
                        : bk.status === "held"
                          ? "bg-primary-soft text-primary-hover border border-primary/30"
                          : bk.source === "manual"
                            ? "bg-accent text-ink border border-accent-line"
                            : bk.source === "open_play"
                              ? "bg-ink text-white"
                              : "bg-primary text-white";
                    const active = sp.b === bk.id;
                    return (
                      <Link
                        key={bk.id}
                        href={`/operator/calendar?date=${date}&b=${bk.id}`}
                        scroll={false}
                        style={style}
                        className={`my-0.5 overflow-hidden px-2 py-1 text-[12px] leading-tight ${tone} ${active ? "ring-2 ring-ink" : ""}`}
                      >
                        <span className="block truncate font-bold">{bk.name}</span>
                        <span className="tabular block truncate opacity-85">
                          {minuteLabel(bk.startMinute)}~{minuteLabel(bk.endMinute)}
                          {bk.status === "held" ? " · 결제 대기" : bk.status === "no_show" ? " · 노쇼" : ""}
                        </span>
                      </Link>
                    );
                  }),
              )}
            </div>
          )}
        </section>

        <aside className="card h-fit p-5 xl:sticky xl:top-6">
          {selectedBooking ? (
            <BookingPanel booking={selectedBooking} date={date} today={today} now={now} />
          ) : selBlackout ? (
            <div className="space-y-3">
              <h2 className="text-[18px] font-bold">차단된 시간</h2>
              <div className="divide-y divide-line">
                <Row label="시간">
                  <span className="tabular">
                    {minuteLabel(selBlackout.startMinute)}~{minuteLabel(selBlackout.endMinute)}
                  </span>
                </Row>
                <Row label="범위">{selBlackout.allCourts ? "시설 전체" : "이 코트만"}</Row>
                <Row label="사유">{selBlackout.reason ?? "-"}</Row>
              </div>
              <form action={deleteBlackoutAction}>
                <input type="hidden" name="blackoutId" value={selBlackout.id} />
                <input type="hidden" name="date" value={date} />
                <button className="h-11 w-full border border-line-strong font-semibold hover:bg-bg">차단 풀기</button>
              </form>
            </div>
          ) : selCourt && durations.length > 0 ? (
            <div className="space-y-5">
              <div>
                <p className="text-[13px] font-bold text-muted">{selCourt.name}</p>
                <h2 className="tabular text-[20px] font-extrabold">
                  {dateLabel(date)} {minuteLabel(selMinute)}
                </h2>
              </div>
              <form action={manualBookingAction} className="space-y-3">
                <h3 className="text-[16px] font-bold">수동 예약 (전화·현장)</h3>
                <input type="hidden" name="courtId" value={selCourt.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="start" value={selMinute} />
                <Field label="예약자 이름">
                  <input name="guestName" required maxLength={40} className="h-11 w-full border border-line-strong px-3" placeholder="홍길동" />
                </Field>
                <Field label="전화번호 (선택)">
                  <input name="guestPhone" inputMode="tel" className="h-11 w-full border border-line-strong px-3" placeholder="010-1234-5678" />
                </Field>
                <Field label="이용 시간">
                  <select name="minutes" defaultValue={Math.min(60, maxFree)} className="h-11 w-full border border-line-strong px-3">
                    {durations.map((d) => (
                      <option key={d} value={d}>
                        {durationLabel(d)} ({minuteLabel(selMinute)}~{minuteLabel(selMinute + d)})
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="h-12 w-full bg-primary font-bold text-white hover:bg-primary-hover">예약 등록</button>
              </form>
              <form action={blackoutAction} className="space-y-3 border-t border-line pt-5">
                <h3 className="text-[16px] font-bold">시간 차단</h3>
                <input type="hidden" name="courtId" value={selCourt.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="start" value={selMinute} />
                <div className="grid grid-cols-2 gap-2">
                  <select name="minutes" defaultValue={Math.min(60, maxFree)} className="h-11 border border-line-strong px-2">
                    {durations.map((d) => (
                      <option key={d} value={d}>
                        {durationLabel(d)}
                      </option>
                    ))}
                  </select>
                  <select name="scope" className="h-11 border border-line-strong px-2">
                    <option value="court">이 코트만</option>
                    <option value="all">시설 전체</option>
                  </select>
                </div>
                <input name="reason" maxLength={100} className="h-11 w-full border border-line-strong px-3" placeholder="사유 (예: 대관, 보수)" />
                <button className="h-11 w-full border border-line-strong font-semibold hover:bg-bg">차단하기</button>
              </form>
            </div>
          ) : (
            <div className="py-6 text-center text-[14px] text-muted">
              시간표에서 예약이나 빈 칸을 눌러 주세요.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

type PanelBooking = Prisma.BookingGetPayload<{
  include: { user: true; court: true; payments: { include: { refunds: true } } };
}>;

function BookingPanel({ booking: b, date, today, now }: { booking: PanelBooking; date: string; today: string; now: Date }) {
  const paid = b.payments.find((p) => p.status !== "ready" && p.status !== "failed");
  const refunded = paid?.refunds.reduce((s, r) => s + r.amount, 0) ?? 0;
  const canNoShow = b.status === "confirmed" && date <= today;
  const startLabel = `${minuteLabel(Math.round((b.startAt.getTime() - kstAt(date, 0).getTime()) / 60000))}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {b.status === "no_show" ? (
          <Badge tone="danger">노쇼</Badge>
        ) : b.status === "cancelled" ? (
          <Badge tone="danger">취소</Badge>
        ) : b.status === "held" ? (
          <Badge tone="warn">결제 대기</Badge>
        ) : b.endAt <= now ? (
          <Badge tone="muted">이용 완료</Badge>
        ) : (
          <Badge>확정</Badge>
        )}
        <span className="tabular text-[12px] text-muted">{b.bookingNo}</span>
      </div>
      <div>
        <h2 className="text-[20px] font-extrabold">{b.user?.name ?? b.guestName}</h2>
        <p className="tabular text-[14px] text-muted">{maskPhone(b.user?.phone ?? b.guestPhone)}</p>
      </div>
      <div className="divide-y divide-line">
        <Row label="코트">{b.court.name}</Row>
        <Row label="시간">
          <span className="tabular">
            {startLabel}~{minuteLabel(Math.round((b.endAt.getTime() - kstAt(date, 0).getTime()) / 60000))}
          </span>
        </Row>
        <Row label="경로">{b.source === "app" ? "앱 예약" : b.source === "manual" ? "전화·현장 (수동)" : "오픈플레이"}</Row>
        <Row label="금액">
          <span className="tabular">{formatWon(b.totalAmount)}</span>
        </Row>
        <Row label="결제">{paid ? `${paid.method ?? ""} 결제 완료 (테스트)` : b.source === "manual" ? "현장 결제" : "미결제"}</Row>
        {refunded > 0 && (
          <Row label="환불">
            <span className="tabular">{formatWon(refunded)}</span>
          </Row>
        )}
      </div>
      {b.status === "confirmed" && (
        <div className="space-y-2 border-t border-line pt-4">
          <form action={operatorCancelAction}>
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="date" value={date} />
            <button className="h-12 w-full border border-danger font-bold text-danger hover:bg-danger-bg">
              예약 취소 {paid ? `(${formatWon(paid.amount)} 전액 환불)` : ""}
            </button>
          </form>
          <form action={noShowAction}>
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="date" value={date} />
            <button
              disabled={!canNoShow}
              className="h-12 w-full bg-danger font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-slot-booked disabled:text-muted-2"
            >
              노쇼 처리
            </button>
          </form>
          {!canNoShow && <p className="text-center text-[12px] text-muted">노쇼는 이용 당일부터 처리할 수 있어요.</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3.5 w-3.5 ${cls}`} /> {text}
    </span>
  );
}
