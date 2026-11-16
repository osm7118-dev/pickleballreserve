// Development sample data: one approved facility in 서울 성동구 with 4 courts,
// operating hours, price table, booking policy and the PRD default cancellation tiers.
// Safe to run repeatedly (fixed ids + upsert).
import { PrismaClient, type DayType } from "@prisma/client";

const db = new PrismaClient();

const FACILITY_ID = "seed-facility-seongsu";
const OWNER_ID = "seed-user-owner";
const ADMIN_ID = "seed-user-admin";
const CUSTOMER_ID = "seed-user-customer";

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

  // 테스트 고객: 휴대폰 번호가 비어 있어 첫 로그인 때 U02(추가 정보·약관)를 거친다.
  await db.user.upsert({
    where: { id: CUSTOMER_ID },
    update: {},
    create: { id: CUSTOMER_ID, kakaoId: "seed-kakao-customer", name: "테스트 고객" },
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

  await seedSampleBookings();
  console.log("Seeded facility:", FACILITY_ID);
}

// 운영자 캘린더가 비어 보이지 않도록 오늘·내일 수동 예약 몇 건. 예약이 하나도 없을 때만 넣는다.
async function seedSampleBookings() {
  if ((await db.booking.count({ where: { facilityId: FACILITY_ID } })) > 0) return;
  const courts = await db.court.findMany({ where: { facilityId: FACILITY_ID }, orderBy: { sortOrder: "asc" } });
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const at = (dayOffset: number, minute: number) =>
    new Date(new Date(`${todayKst}T00:00:00+09:00`).getTime() + dayOffset * 86400_000 + minute * 60_000);
  const samples = [
    { day: 0, court: 0, start: h(19), end: h(20, 30), name: "김민수", phone: "01012345678" },
    { day: 0, court: 2, start: h(20), end: h(22), name: "동호회 화요팀", phone: "01098765432" },
    { day: 1, court: 1, start: h(18), end: h(19), name: "이서연", phone: "01055556666" },
    { day: 1, court: 3, start: h(20, 30), end: h(21, 30), name: "박지훈", phone: null },
  ];
  for (const [i, s] of samples.entries()) {
    const startAt = at(s.day, s.start);
    const endAt = at(s.day, s.end);
    if (startAt.getTime() <= Date.now()) continue;
    const slots: Date[] = [];
    for (let t = startAt.getTime(); t < endAt.getTime(); t += 30 * 60_000) slots.push(new Date(t));
    await db.booking.create({
      data: {
        bookingNo: `PB-SEED-${i + 1}`,
        facilityId: FACILITY_ID,
        courtId: courts[s.court].id,
        startAt,
        endAt,
        totalAmount: slots.length * 15000,
        status: "confirmed",
        source: "manual",
        guestName: s.name,
        guestPhone: s.phone,
        slots: { create: slots.map((slotStart) => ({ courtId: courts[s.court].id, slotStart })) },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
