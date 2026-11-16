import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { env } from "./env";
import { SESSION_TTL_MS, deriveSecret, issueToken, verifyToken } from "@/server/auth/token";

const SESSION_COOKIE = "pb_session";
const secret = () => deriveSecret(env.AUTH_SECRET, env.DATABASE_URL);

export async function getCurrentUser() {
  const store = await cookies();
  const userId = verifyToken(store.get(SESSION_COOKIE)?.value, secret());
  if (!userId) return null;
  return db.user.findUnique({ where: { id: userId } });
}

/** 로그인 필요 화면: 비로그인이면 로그인 후 next 로 돌아온다. */
export async function requireUser(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNext(next))}`);
  return user;
}

export async function startSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, issueToken(userId, secret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 오픈 리다이렉트 방지: 같은 사이트 경로만 허용 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
