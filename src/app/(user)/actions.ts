"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { endSession, getCurrentUser, safeNext, startSession } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { isDateStr } from "@/lib/time";
import { BookingError } from "@/server/booking/errors";
import { holdBooking } from "@/server/booking/hold";
import { cancelByUser } from "@/server/booking/manage";
import { startPayment } from "@/server/payment/service";
import { MOCK_METHODS, mockPaymentKey } from "@/server/payment/mock";

// 카카오 연동 전 테스트 계정 (prisma/seed.ts)
const DEMO_ACCOUNTS = {
  customer: "seed-user-customer",
  operator: "seed-user-owner",
} as const;

const demoSchema = z.object({ who: z.enum(["customer", "operator"]), next: z.string().optional() });

/** U01 / O01: 테스트 계정 로그인 (DEMO_LOGIN=on 일 때만) */
export async function demoLoginAction(formData: FormData) {
  if (env.DEMO_LOGIN !== "on") redirect("/login");
  const input = demoSchema.parse({ who: formData.get("who"), next: formData.get("next") ?? undefined });
  const user = await db.user.findUnique({ where: { id: DEMO_ACCOUNTS[input.who] } });
  if (!user) throw new Error("demo account missing: run pnpm db:seed");
  await startSession(user.id);
  if (input.who === "operator") redirect("/operator/dashboard");
  const next = safeNext(input.next);
  if (!user.phone) redirect(`/signup?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export type FormState = { error?: string; next?: string } | undefined;

const signupSchema = z.object({
  phone: z.string(),
  terms: z.literal("on", { message: "필수 약관에 동의해 주세요." }),
  privacy: z.literal("on", { message: "필수 약관에 동의해 주세요." }),
  alimtalk: z.literal("on", { message: "필수 약관에 동의해 주세요." }),
  marketing: z.literal("on").optional(),
  next: z.string().optional(),
});

/** U02 추가 정보·약관 동의 */
export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return { error: "휴대폰 번호를 확인해 주세요. 예: 010-1234-5678" };
  // TODO: 카카오 연동 단계에서 휴대폰 본인 확인(인증번호)을 붙인다.
  await db.user.update({ where: { id: user.id }, data: { phone, marketingAgreed: parsed.data.marketing === "on" } });
  redirect(safeNext(parsed.data.next));
}

const holdSchema = z.object({
  facilityId: z.string().min(1),
  courtId: z.string().min(1),
  date: z.string().refine(isDateStr),
  start: z.coerce.number().int(),
  end: z.coerce.number().int(),
});

/** U05 → U06: 슬롯 선점 */
export async function holdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = holdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "선택한 시간을 다시 확인해 주세요." };
  const { facilityId, courtId, date, start, end } = parsed.data;
  const back = `/facilities/${facilityId}?date=${date}&court=${courtId}&start=${start}&end=${end}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);
  if (!user.phone) redirect(`/signup?next=${encodeURIComponent(back)}`);
  let bookingId: string;
  try {
    const booking = await holdBooking({ userId: user.id, facilityId, courtId, date, startMinute: start, endMinute: end });
    bookingId = booking.id;
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  redirect(`/bookings/${bookingId}/confirm`);
}

const paySchema = z.object({ bookingId: z.string().min(1), method: z.enum(MOCK_METHODS) });

/**
 * U07 결제하기. Mock 결제위젯 역할: 결제 건(order_id)을 만들고
 * 토스와 같은 모양의 성공 리다이렉트(/api/payments/success)로 보낸다. 승인은 그 라우트에서 서버가 한다.
 */
export async function payAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = paySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "결제수단을 골라 주세요." };
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const payment = await startPayment({ bookingId: parsed.data.bookingId, userId: user.id });
    const qs = new URLSearchParams({
      orderId: payment.orderId,
      paymentKey: mockPaymentKey(parsed.data.method),
      amount: String(payment.amount),
    });
    // 토스 위젯처럼 브라우저 전체 이동으로 성공 URL 에 간다 (라우트 핸들러는 클라이언트 라우터로 열 수 없다).
    return { next: `/api/payments/success?${qs}` };
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
}

/** U10 예약 취소 */
export async function cancelAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const bookingId = z.string().min(1).parse(formData.get("bookingId"));
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await cancelByUser({ bookingId, userId: user.id });
  } catch (e) {
    if (e instanceof BookingError) return { error: e.message };
    throw e;
  }
  redirect(`/bookings/${bookingId}?cancelled=1`);
}
