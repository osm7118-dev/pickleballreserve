import { db } from "@/lib/db";

/** 운영자가 관리하는 시설 (MVP는 owner 1명·시설 1곳). 없으면 null. */
export async function findStaffFacility(userId: string) {
  const staff = await db.facilityStaff.findFirst({
    where: { userId },
    include: { facility: true },
    orderBy: { createdAt: "asc" },
  });
  return staff?.facility ?? null;
}

export async function isFacilityStaff(userId: string, facilityId: string): Promise<boolean> {
  const row = await db.facilityStaff.findUnique({ where: { facilityId_userId: { facilityId, userId } } });
  return row !== null;
}
