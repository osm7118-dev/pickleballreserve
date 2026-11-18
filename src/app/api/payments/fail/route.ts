// 결제 실패·이탈 리다이렉트 (토스 failUrl). booking 은 held 로 두고 타이머 안에서 다시 시도하게 한다.
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const orderId = url.searchParams.get("orderId");
  const user = await getCurrentUser();
  if (!user || !orderId) return NextResponse.redirect(new URL("/bookings", url));
  const payment = await db.payment.findUnique({ where: { orderId } });
  if (!payment || payment.userId !== user.id) return NextResponse.redirect(new URL("/bookings", url));
  await db.payment.updateMany({ where: { id: payment.id, status: "ready", tossPaymentKey: null }, data: { status: "failed" } });
  const target = payment.bookingId
    ? `/bookings/${payment.bookingId}/pay?error=PAYMENT_FAILED`
    : payment.lessonBookingId
      ? `/lessons/${payment.lessonBookingId}/pay?error=PAYMENT_FAILED`
      : "/bookings";
  return NextResponse.redirect(new URL(target, url));
}
