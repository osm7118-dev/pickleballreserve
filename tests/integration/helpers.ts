import { PrismaClient, Prisma } from "@prisma/client";

export const db = new PrismaClient();

const TABLES = [
  "announcements",
  "coach_availabilities",
  "coaches",
  "lesson_bookings",
  "notifications",
  "facility_customers",
  "settlements",
  "refunds",
  "payments",
  "open_play_participants",
  "booking_slots",
  "bookings",
  "open_play_sessions",
  "cancellation_tiers",
  "booking_policies",
  "price_rules",
  "blackouts",
  "operating_hours",
  "courts",
  "facility_staff",
  "facilities",
  "users",
];

export async function resetDb() {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

let seq = 0;
const uniq = () => `${Date.now()}-${++seq}`;

export async function createUser() {
  return db.user.create({ data: { kakaoId: `kakao-${uniq()}`, name: "테스트 이용자" } });
}

export async function createFacilityWithCourts(courtCount = 2) {
  return db.facility.create({
    data: {
      name: `테스트 시설 ${uniq()}`,
      address: "서울 성동구",
      regionSido: "서울",
      regionSigungu: "성동구",
      status: "approved",
      courts: {
        create: Array.from({ length: courtCount }, (_, i) => ({ name: `${"ABCD"[i]}코트`, sortOrder: i })),
      },
    },
    include: { courts: { orderBy: { sortOrder: "asc" } } },
  });
}

/** KST wall-clock time → Date. e.g. kst("2026-12-01T19:00") */
export const kst = (local: string) => new Date(`${local}:00+09:00`);

const SLOT_MS = 30 * 60 * 1000;

/**
 * Hold a booking and its 30-min slots in one transaction, the way step 6 of the
 * PRD booking validation does. Throws P2002 if any slot is already taken.
 */
export async function holdBooking(args: {
  userId: string;
  facilityId: string;
  courtId: string;
  startAt: Date;
  endAt: Date;
}) {
  const slotStarts: Date[] = [];
  for (let t = args.startAt.getTime(); t < args.endAt.getTime(); t += SLOT_MS) slotStarts.push(new Date(t));

  return db.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        bookingNo: `B-${uniq()}`,
        userId: args.userId,
        facilityId: args.facilityId,
        courtId: args.courtId,
        startAt: args.startAt,
        endAt: args.endAt,
        totalAmount: slotStarts.length * 10000,
        status: "held",
        source: "app",
        holdExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await tx.bookingSlot.createMany({
      data: slotStarts.map((slotStart) => ({ bookingId: booking.id, courtId: args.courtId, slotStart })),
    });
    return booking;
  });
}

export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
