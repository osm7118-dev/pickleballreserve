// 금액은 모두 원 단위 정수.
export function formatWon(amount: number): string {
  if (!Number.isInteger(amount)) throw new Error(`amount must be an integer (got ${amount})`);
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 원 단위 정수에 퍼센트를 곱하고 원 미만은 버린다. */
export function percentOf(amount: number, percent: number): number {
  return Math.floor((amount * percent) / 100);
}
