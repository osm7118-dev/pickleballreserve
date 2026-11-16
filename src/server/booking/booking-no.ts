import { randomInt } from "node:crypto";
import { formatKst } from "@/lib/time";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 예약번호: PB-yyMMdd-XXXXX (KST 생성일 + 혼동 없는 문자 5자) */
export function newBookingNo(now: Date = new Date()): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `PB-${formatKst(now, "yyMMdd")}-${s}`;
}
