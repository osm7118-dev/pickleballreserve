import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { quoteRefund } from "@/server/refund";
import { BookingError } from "@/server/booking/errors";
import { refundPayment } from "@/server/payment/refund";

/** 참가 확정 = status joined + 결제 완료(payment_id 있음). 결제 전 신청은 자리를 차지하지 않는다. */
export const PAID_JOINED = { status: "joined", paymentId: { not: null } } satisfies Prisma.OpenPlayParticipantWhereInput;

export async function listOpenPlaySessions(facilityId: string, now: Date = new Date()) {
  const sessions = await db.openPlaySession.findMany({
    where: { facilityId, status: "open", startAt: { gt: now } },
    include: { _count: { select: { participants: { where: PAID_JOINED } } } },
    orderBy: { startAt: "asc" },
    take: 30,
  });
  return sessions.map((s) => ({ ...s, joined: s._count.participants }));
}

export async function getOpenPlaySession(sessionId: string, userId: string | null) {
  const session = await db.openPlaySession.findUnique({
    where: { id: sessionId },
    include: {
      facility: { include: { cancellationTiers: true } },
      _count: { select: { participants: { where: PAID_JOINED } } },
    },
  });
  if (!session) return null;
  const courts = await db.court.findMany({ where: { id: { in: session.courtIds } }, orderBy: { sortOrder: "asc" } });
  const mine = userId
    ? await db.openPlayParticipant.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
        include: { payment: { include: { refunds: true } } },
      })
    : null;
  const paid = mine && mine.status === "joined" && mine.paymentId ? mine : null;
  return { session, courts, joined: session._count.participants, mine: paid, cancelledMine: mine?.status === "cancelled" ? mine : null };
}

async function assertJoinable(tx: Prisma.TransactionClient, sessionId: string, userId: string, now: Date) {
  const session = await tx.openPlaySession.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "open" || session.startAt <= now) throw new BookingError("SESSION_CLOSED");
  const blocked = await tx.facilityCustomer.findUnique({
    where: { facilityId_userId: { facilityId: session.facilityId, userId } },
    select: { isBlocked: true },
  });
  if (blocked?.isBlocked) throw new BookingError("BLOCKED");
  const mine = await tx.openPlayParticipant.findUnique({ where: { sessionId_userId: { sessionId, userId } } });
  if (mine && mine.status === "joined" && mine.paymentId) throw new BookingError("ALREADY_JOINED");
  const joined = await tx.openPlayParticipant.count({ where: { sessionId, ...PAID_JOINED } });
  if (joined >= session.capacity) throw new BookingError("FULL");
  return { session, mine };
}

/** U11 참가 신청 → 결제 건 생성. 정원은 결제 승인 때 한 번 더 잠금 후 확인한다. */
export async function startOpenPlayPayment(args: { sessionId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  return db.$transaction(async (tx) => {
    const { session, mine } = await assertJoinable(tx, args.sessionId, args.userId, now);
    const participant =
      mine ??
      (await tx.openPlayParticipant.create({
        data: { sessionId: session.id, userId: args.userId, status: "joined" },
      }));
    const existing = await tx.payment.findFirst({
      where: { participantId: participant.id, status: "ready", amount: session.fee, tossPaymentKey: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
    return tx.payment.create({
      data: {
        orderId: `ORD-OP-${session.id.slice(-6)}-${Date.now().toString(36)}`,
        participantId: participant.id,
        userId: args.userId,
        amount: session.fee,
        status: "ready",
      },
    });
  });
}

/** 결제 승인 후: 세션 행을 잠그고 정원을 다시 센 뒤 참가 확정. 정원이 찼으면 false. */
export async function confirmOpenPlayJoin(
  tx: Prisma.TransactionClient,
  args: { participantId: string; paymentId: string },
): Promise<boolean> {
  const participant = await tx.openPlayParticipant.findUniqueOrThrow({ where: { id: args.participantId } });
  await tx.$queryRaw`SELECT id FROM open_play_sessions WHERE id = ${participant.sessionId} FOR UPDATE`;
  const session = await tx.openPlaySession.findUniqueOrThrow({ where: { id: participant.sessionId } });
  const others = await tx.openPlayParticipant.count({
    where: { sessionId: session.id, ...PAID_JOINED, id: { not: participant.id } },
  });
  if (session.status !== "open" || others >= session.capacity) return false;
  await tx.openPlayParticipant.update({
    where: { id: participant.id },
    data: { status: "joined", paymentId: args.paymentId },
  });
  return true;
}

/**
 * 참가 취소 환불액.
 * TODO(open-issue): 오픈플레이 참가 취소 환불 규정 미정 — 코트 예약 취소 규정(cancellation_tiers)을 그대로 쓴다고 가정.
 */
export async function openPlayRefundQuote(sessionId: string, userId: string, now: Date = new Date()) {
  const info = await getOpenPlaySession(sessionId, userId);
  if (!info?.mine?.payment) return null;
  return quoteRefund({
    paidAmount: info.mine.payment.amount,
    startAt: info.session.startAt,
    approvedAt: info.mine.payment.approvedAt,
    tiers: info.session.facility.cancellationTiers,
    now,
  });
}

/** U11 참가 취소. 참가 상태를 먼저 조건부로 바꿔 동시 요청은 한 번만 환불한다. */
export async function cancelOpenPlayByUser(args: { sessionId: string; userId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const quote = await openPlayRefundQuote(args.sessionId, args.userId, now);
  if (!quote || !quote.cancellable) throw new BookingError("NOT_CANCELLABLE");
  const p = await db.openPlayParticipant.findUniqueOrThrow({
    where: { sessionId_userId: { sessionId: args.sessionId, userId: args.userId } },
  });
  const updated = await db.openPlayParticipant.updateMany({
    where: { id: p.id, status: "joined" },
    data: { status: "cancelled" },
  });
  if (updated.count === 0 || !p.paymentId) throw new BookingError("NOT_CANCELLABLE");
  await refundPayment({
    paymentId: p.paymentId,
    amount: quote.refundAmount,
    refundPercent: quote.refundPercent,
    reason: "user_cancel",
    cancelReason: "오픈플레이 참가 취소",
  });
  return { refundAmount: quote.refundAmount };
}
