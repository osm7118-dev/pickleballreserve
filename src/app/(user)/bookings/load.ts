import { notFound } from "next/navigation";
import { db } from "@/lib/db";

/** 이용자 본인 예약만 불러온다. */
export async function loadOwnBooking(id: string, userId: string) {
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      facility: { include: { cancellationTiers: true } },
      court: true,
      payments: { include: { refunds: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!b || b.userId !== userId) notFound();
  return b;
}
