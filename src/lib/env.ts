import { z } from "zod";

// Server-side environment variables, validated once at startup.
// When adding a variable, also add it to .env.example.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  /** 로그인 쿠키 서명 키. 없으면 DATABASE_URL에서 파생한다(데모 배포를 단순하게). */
  AUTH_SECRET: z.string().min(16).optional(),
  /** 카카오 로그인 연동 전까지 테스트 계정 로그인을 연다. TODO: 카카오 연동(빌드 2단계) 후 off */
  DEMO_LOGIN: z.enum(["on", "off"]).default("on"),
  PAYMENT_PROVIDER: z.enum(["mock"]).default("mock"),
  NOTIFIER: z.enum(["console"]).default("console"),
  /** /api/cron/* 호출 인증. 없으면 크론 라우트를 막는다. */
  CRON_SECRET: z.string().min(16).optional(),
});

export const env = envSchema.parse(process.env);
