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
  const go = (path: string) => NextResponse.redirect(new URL(path, url));
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return go("/bookings");
  const user = await getCurrentUser();
  if (!user) return go("/login");

  try {
    const res = await approvePayment({ ...parsed.data, userId: user.id });
    if (res.kind === "booking") return go(`/bookings/${res.bookingId}/done`);
    if (res.kind === "open_play") return go(`/open-play/${res.sessionId}?joined=1`);
    return go(`/lessons/${res.lessonId}?paid=1`);
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
    const p = await db.payment.findUnique({
      where: { orderId: parsed.data.orderId },
      include: { booking: true, participant: true, lessonBooking: true },
    });
    if (!p || p.userId !== user.id) return go("/bookings");
    if (p.participant) return go(`/open-play/${p.participant.sessionId}?error=${e.code}`);
    if (p.lessonBooking) {
      if (e.code === "HOLD_EXPIRED") return go(`/coaches/${p.lessonBooking.coachId}?notice=expired`);
      return go(`/lessons/${p.lessonBooking.id}/pay?error=${e.code}`);
    }
    const b = p.booking!;
    if (e.code === "HOLD_EXPIRED") return go(`/facilities/${b.facilityId}?date=${kstDateStr(b.startAt)}&notice=expired`);
    return go(`/bookings/${b.id}/pay?error=${e.code}`);
  }
}
