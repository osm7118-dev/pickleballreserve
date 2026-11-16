import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// 로그인 쿠키: "<userId>.<발급시각>.<HMAC>". DB 세션(Auth.js)은 카카오 연동 단계에서 붙인다.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function deriveSecret(authSecret: string | undefined, databaseUrl: string): string {
  return authSecret ?? createHash("sha256").update(`session:${databaseUrl}`).digest("hex");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueToken(userId: string, secret: string, now: Date = new Date()): string {
  const payload = `${userId}.${now.getTime()}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string, now: Date = new Date()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAt, sig] = parts;
  const expected = Buffer.from(sign(`${userId}.${issuedAt}`, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || now.getTime() - issued > SESSION_TTL_MS) return null;
  return userId;
}
