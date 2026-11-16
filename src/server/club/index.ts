import { db } from "@/lib/db";

/**
 * 이용자 홈에 보여 줄 "내 매장".
 * 1) 이용자가 고른 매장(쿠키) → 2) 가장 최근 예약한 매장 → 3) 가장 먼저 승인된 매장.
 */
export async function resolveHomeFacility(selectedId: string | undefined, userId: string | undefined) {
  if (selectedId) {
    const f = await db.facility.findFirst({ where: { id: selectedId, status: "approved" } });
    if (f) return f;
  }
  if (userId) {
    const last = await db.booking.findFirst({
      where: { userId, facility: { status: "approved" } },
      orderBy: { createdAt: "desc" },
      include: { facility: true },
    });
    if (last) return last.facility;
  }
  return db.facility.findFirst({ where: { status: "approved" }, orderBy: [{ approvedAt: "asc" }, { createdAt: "asc" }] });
}

export async function listClubs() {
  return db.facility.findMany({
    where: { status: "approved" },
    include: { _count: { select: { courts: { where: { isActive: true } } } } },
    orderBy: [{ regionSido: "asc" }, { regionSigungu: "asc" }, { name: "asc" }],
  });
}
