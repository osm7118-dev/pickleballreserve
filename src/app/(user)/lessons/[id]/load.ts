import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export async function loadOwnLesson(id: string, userId: string) {
  const lb = await db.lessonBooking.findUnique({
    where: { id },
    include: {
      coach: true,
      facility: { include: { cancellationTiers: true } },
      payments: { include: { refunds: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lb || lb.userId !== userId) notFound();
  return lb;
}
