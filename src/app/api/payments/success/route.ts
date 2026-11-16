// 결제 성공 리다이렉트 (토스 successUrl 과 같은 모양). 서버가 금액 대조 후 승인한다.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { kstDateStr } from "@/lib/time";
import { BookingError } from "@/server/booking/errors";
import { approvePayment } from "@/server/payment/service";

const schema = z.object({
  orderId: z.string().min(1),
  paymentKey: z.string().min(1),
  amount: z.coerce.number().int().nonnegative(),
});

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.redirect(new URL("/bookings", url));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));

  try {
    const res = await approvePayment({ ...parsed.data, userId: user.id });
    return NextResponse.redirect(new URL(`/bookings/${res.bookingId}/done`, url));
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    const payment = await db.payment.findUnique({ where: { orderId: parsed.data.orderId }, include: { booking: true } });
    const b = payment?.booking;
    if (!b || b.userId !== user.id) return NextResponse.redirect(new URL("/bookings", url));
    if (e.code === "HOLD_EXPIRED") {
      return NextResponse.redirect(new URL(`/facilities/${b.facilityId}?date=${kstDateStr(b.startAt)}&notice=expired`, url));
    }
    return NextResponse.redirect(new URL(`/bookings/${b.id}/pay?error=${e.code}`, url));
  }
}
