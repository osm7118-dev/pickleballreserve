// 결제 대행사 인터페이스. PAYMENT_PROVIDER=mock|toss 로 바꾼다.
export type ApproveInput = { paymentKey: string; orderId: string; amount: number };
export type ApproveResult = { method: string; approvedAt: Date; raw: Record<string, unknown> };
export type CancelInput = { paymentKey: string; amount: number; reason: string };
export type CancelResult = { transactionKey: string };

export interface PaymentGateway {
  approve(input: ApproveInput): Promise<ApproveResult>;
  cancel(input: CancelInput): Promise<CancelResult>;
}
