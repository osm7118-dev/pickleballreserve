import { env } from "@/lib/env";
import type { PaymentGateway } from "./gateway";
import { MockPaymentGateway } from "./mock";

// TODO: 빌드 4단계 후반에 토스 테스트 키로 TossPaymentGateway 추가 (PAYMENT_PROVIDER=toss)
export function getPaymentGateway(): PaymentGateway {
  switch (env.PAYMENT_PROVIDER) {
    case "mock":
      return new MockPaymentGateway();
  }
}
