import { randomBytes } from "node:crypto";
import type { ApproveInput, CancelInput, PaymentGateway } from "./gateway";

export const MOCK_METHODS = ["카드", "간편결제", "계좌이체"] as const;
export type MockMethod = (typeof MOCK_METHODS)[number];

/** 토스 결제위젯이 성공 리다이렉트에 붙여 주는 paymentKey 를 흉내 낸다. 수단은 키에 담는다. */
export function mockPaymentKey(method: MockMethod): string {
  return `mock_${MOCK_METHODS.indexOf(method)}_${randomBytes(9).toString("hex")}`;
}

/** 실제 돈이 오가지 않는 결제. 키 형식만 확인한다. */
export class MockPaymentGateway implements PaymentGateway {
  async approve(input: ApproveInput) {
    const m = /^mock_(\d)_[0-9a-f]+$/.exec(input.paymentKey);
    if (!m) throw new Error("invalid mock paymentKey");
    const method = MOCK_METHODS[Number(m[1])] ?? "카드";
    const approvedAt = new Date();
    return {
      method,
      approvedAt,
      raw: { provider: "mock", orderId: input.orderId, totalAmount: input.amount, method, approvedAt: approvedAt.toISOString() },
    };
  }

  async cancel(input: CancelInput) {
    void input;
    return { transactionKey: `mock_cancel_${randomBytes(9).toString("hex")}` };
  }
}
