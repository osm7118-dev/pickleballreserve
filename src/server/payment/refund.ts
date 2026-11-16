import type { RefundReason } from "@prisma/client";
import { db } from "@/lib/db";
import { getPaymentGateway } from "./index";

/** 승인된 결제를 amount 만큼 (부분)취소하고 refunds 에 남긴다. amount 0 이면 아무것도 하지 않는다. */
export async function refundPayment(args: {
  paymentId: string;
  amount: number;
  refundPercent: number;
  reason: RefundReason;
  cancelReason: string;
}) {
  const paid = await db.payment.findUniqueOrThrow({ where: { id: args.paymentId } });
  if (args.amount <= 0 || paid.status !== "done" || !paid.tossPaymentKey) return;
  const res = await getPaymentGateway().cancel({ paymentKey: paid.tossPaymentKey, amount: args.amount, reason: args.cancelReason });
  await db.$transaction([
    db.refund.create({
      data: { paymentId: paid.id, amount: args.amount, refundPercent: args.refundPercent, reason: args.reason, tossCancelTx: res.transactionKey },
    }),
    db.payment.update({
      where: { id: paid.id },
      data: { status: args.amount >= paid.amount ? "cancelled" : "partial_cancelled" },
    }),
  ]);
}
