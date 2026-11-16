// Development sample data: one approved facility in 서울 성동구 with 4 courts,
// operating hours, price table, booking policy and the PRD default cancellation tiers.
// Safe to run repeatedly (fixed ids + upsert).
import { PrismaClient, type DayType } from "@prisma/client";

const db = new PrismaClient();

const FACILITY_ID = "seed-facility-seongsu";
const OWNER_ID = "seed-user-owner";
const ADMIN_ID = "seed-user-admin";

const h = (hour: number, minute = 0) => hour * 60 + minute;

async function main() {
  await db.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: { id: ADMIN_ID, kakaoId: "seed-kakao-admin", name: "플랫폼 관리자", role: "admin" },
  });
  await db.user.upsert({
    where: { id: OWNER_ID },
    update: {},
    create: { id: OWNER_ID, kakaoId: "seed-kakao-owner", name: "성수 피클볼 사장님", phone: "01000000000" },
  });

  await db.facility.upsert({
    where: { id: FACILITY_ID },
    update: {},
    create: {
      id: FACILITY_ID,
      name: "성수 인도어 피클볼",
      address: "서울 성동구 성수이로 00",
      regionSido: "서울",
      regionSigungu: "성동구",
      lat: 37.5446,
      lng: 127.0559,
      phone: "0200000000",
      description: "개발용 샘플 시설입니다.",
      amenities: ["주차", "샤워실", "라켓 대여"],
      status: "approved",
      approvedAt: new Date(),
      approvedById: ADMIN_ID,
      staff: { create: { userId: OWNER_ID, role: "owner" } },
      courts: {
        create: ["A코트", "B코트", "C코트", "D코트"].map((name, i) => ({
          name,
          surface: "우레탄",
          sortOrder: i,
        })),
      },
      // 평일 07:00~23:00, 주말 08:00~22:00
      operatingHours: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
          weekday === 0 || weekday === 6
            ? { weekday, openMinute: h(8), closeMinute: h(22) }
            : { weekday, openMinute: h(7), closeMinute: h(23) },
        ),
      },
      priceRules: {
        create: [
          { dayType: "weekday" as DayType, startMinute: h(7), endMinute: h(18), pricePer30min: 10000 },
          { dayType: "weekday" as DayType, startMinute: h(18), endMinute: h(23), pricePer30min: 15000 },
          { dayType: "weekend" as DayType, startMinute: h(8), endMinute: h(22), pricePer30min: 15000 },
        ],
      },
      // PRD 흐름 B-7 기본값: 사전예약 14일, 1일 최대 120분, 1회 60~120분, 선점 10분
      bookingPolicy: {
        create: {
          advanceDays: 14,
          maxMinutesPerDay: 120,
          minMinutesPerBooking: 60,
          maxMinutesPerBooking: 120,
          holdMinutes: 10,
        },
      },
      // PRD 1장 노쇼 방지 기본 정책
      cancellationTiers: {
        create: [
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 24, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      },
    },
  });

  console.log("Seeded facility:", FACILITY_ID);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
