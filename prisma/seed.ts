// Development sample data: 피클존 (PickleZone, 서울 영등포구) with 1 court,
// operating hours, price table, booking policy and the PRD default cancellation tiers.
// Safe to run repeatedly (fixed ids + upsert). The facility id stays "seed-facility-seongsu"
// so existing sessions and cookies keep working after the rename.
import { PrismaClient, type DayType } from "@prisma/client";

const db = new PrismaClient();

const FACILITY_ID = "seed-facility-seongsu";
const OWNER_ID = "seed-user-owner";
const ADMIN_ID = "seed-user-admin";
const CUSTOMER_ID = "seed-user-customer";

const COURT_NAME = "A코트";
// 매일 06:00~23:00 운영 (U18 캘린더 시간표 범위와 같다)
const OPEN = 6 * 60;
const CLOSE = 23 * 60;
const PRICE_RULES = [
  { dayType: "weekday" as DayType, startMinute: OPEN, endMinute: 18 * 60, pricePer30min: 10000 },
  { dayType: "weekday" as DayType, startMinute: 18 * 60, endMinute: CLOSE, pricePer30min: 15000 },
  { dayType: "weekend" as DayType, startMinute: OPEN, endMinute: CLOSE, pricePer30min: 15000 },
];

const h = (hour: number, minute = 0) => hour * 60 + minute;

async function main() {
  await db.user.upsert({
    where: { id: ADMIN_ID },
    update: {},
    create: { id: ADMIN_ID, kakaoId: "seed-kakao-admin", name: "플랫폼 관리자", role: "admin" },
  });
  await db.user.upsert({
    where: { id: OWNER_ID },
    update: { name: "피클존 사장님" },
    create: { id: OWNER_ID, kakaoId: "seed-kakao-owner", name: "피클존 사장님", phone: "01000000000" },
  });

  // 테스트 고객: 휴대폰 번호가 비어 있어 첫 로그인 때 U02(추가 정보·약관)를 거친다.
  await db.user.upsert({
    where: { id: CUSTOMER_ID },
    update: {},
    create: { id: CUSTOMER_ID, kakaoId: "seed-kakao-customer", name: "테스트 고객" },
  });

  // 실제 매장 피클존(PickleZone) 이름·주소로 표시한다. 전화·가격·운영시간은 샘플 값이다.
  const info = {
    name: "피클존 PickleZone",
    address: "서울 영등포구 도신로 73 지하1층",
    regionSido: "서울",
    regionSigungu: "영등포구",
    lat: 37.5138,
    lng: 126.9089,
    description: "피클볼 전용 실내 코트 (샘플 데이터)",
  };
  await db.facility.upsert({
    where: { id: FACILITY_ID },
    update: info,
    create: {
      id: FACILITY_ID,
      ...info,
      phone: "0200000000",
      amenities: ["주차", "샤워실", "라켓 대여"],
      status: "approved",
      approvedAt: new Date(),
      approvedById: ADMIN_ID,
      staff: { create: { userId: OWNER_ID, role: "owner" } },
      courts: {
        create: [COURT_NAME].map((name, i) => ({
          name,
          surface: "우레탄",
          sortOrder: i,
        })),
      },
      // 평일 07:00~23:00, 주말 08:00~22:00
      operatingHours: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: OPEN, closeMinute: CLOSE })),
      },
      priceRules: {
        create: [
          ...PRICE_RULES,
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

  // 코트 1면: 예전 시드의 B~D코트는 지우지 않고(예약 이력 보존) 비활성으로 돌린다.
  await db.court.upsert({
    where: { facilityId_name: { facilityId: FACILITY_ID, name: COURT_NAME } },
    update: { isActive: true },
    create: { facilityId: FACILITY_ID, name: COURT_NAME, surface: "우레탄", sortOrder: 0 },
  });
  await db.court.updateMany({ where: { facilityId: FACILITY_ID, name: { not: COURT_NAME } }, data: { isActive: false } });

  // 이미 만들어진 DB도 운영시간·가격을 06:00~23:00 기준으로 맞춘다.
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    await db.operatingHour.upsert({
      where: { facilityId_weekday: { facilityId: FACILITY_ID, weekday } },
      update: { openMinute: OPEN, closeMinute: CLOSE },
      create: { facilityId: FACILITY_ID, weekday, openMinute: OPEN, closeMinute: CLOSE },
    });
  }
  await db.$transaction([
    db.priceRule.deleteMany({ where: { facilityId: FACILITY_ID } }),
    db.priceRule.createMany({ data: PRICE_RULES.map((r) => ({ ...r, facilityId: FACILITY_ID })) }),
  ]);

  await seedSecondFacility();
  await seedPlayers();
  await seedCoaches();
  await seedAnnouncements();
  await seedOpenPlay();
  await seedSampleBookings();
  console.log("Seeded facility:", FACILITY_ID);
}

const GANGNAM_ID = "seed-facility-gangnam";

// "다른 매장 보기"용 두 번째 시설 (운영자 계정 없음)
async function seedSecondFacility() {
  await db.facility.upsert({
    where: { id: GANGNAM_ID },
    update: {},
    create: {
      id: GANGNAM_ID,
      name: "강남 피클볼 라운지",
      address: "서울 강남구 테헤란로 00",
      regionSido: "서울",
      regionSigungu: "강남구",
      phone: "0200000001",
      description: "개발용 샘플 시설입니다.",
      amenities: ["주차", "라켓 대여"],
      status: "approved",
      approvedAt: new Date(),
      approvedById: ADMIN_ID,
      courts: { create: ["1코트", "2코트", "3코트"].map((name, i) => ({ name, surface: "하드", sortOrder: i })) },
      operatingHours: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, openMinute: h(6), closeMinute: h(24) })),
      },
      priceRules: {
        create: [
          { dayType: "weekday" as DayType, startMinute: h(6), endMinute: h(18), pricePer30min: 12000 },
          { dayType: "weekday" as DayType, startMinute: h(18), endMinute: h(24), pricePer30min: 18000 },
          { dayType: "weekend" as DayType, startMinute: h(6), endMinute: h(24), pricePer30min: 18000 },
        ],
      },
      bookingPolicy: { create: {} },
      cancellationTiers: {
        create: [
          { hoursBefore: 48, refundPercent: 100 },
          { hoursBefore: 24, refundPercent: 50 },
          { hoursBefore: 0, refundPercent: 0 },
        ],
      },
    },
  });
}

// 개인 레슨 코치와 요일별 가능 시간
async function seedCoaches() {
  const coaches = [
    {
      id: "seed-coach-kim",
      facilityId: FACILITY_ID,
      name: "김하늘 코치",
      bio: "입문·초급 전문. 그립과 서브부터 차근차근 알려 드려요.",
      lessonMinutes: 60,
      lessonPrice: 60000,
      days: [1, 2, 3, 4, 5],
      start: h(10),
      end: h(18),
    },
    {
      id: "seed-coach-lee",
      facilityId: FACILITY_ID,
      name: "이준호 코치",
      bio: "중급 이상. 드롭샷·리셋과 복식 전술 위주로 진행해요.",
      lessonMinutes: 60,
      lessonPrice: 80000,
      days: [2, 4, 6, 0],
      start: h(18),
      end: h(22),
    },
    {
      id: "seed-coach-park",
      facilityId: GANGNAM_ID,
      name: "박소연 코치",
      bio: "주말 입문 레슨을 진행해요.",
      lessonMinutes: 60,
      lessonPrice: 70000,
      days: [0, 6],
      start: h(9),
      end: h(13),
    },
  ];
  for (const [i, c] of coaches.entries()) {
    await db.coach.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        facilityId: c.facilityId,
        name: c.name,
        bio: c.bio,
        lessonMinutes: c.lessonMinutes,
        lessonPrice: c.lessonPrice,
        sortOrder: i,
        availabilities: { create: c.days.map((weekday) => ({ weekday, startMinute: c.start, endMinute: c.end })) },
      },
    });
  }
}

async function seedAnnouncements() {
  const items = [
    {
      id: "seed-notice-1",
      facilityId: FACILITY_ID,
      title: "12월 첫 주말 친선 대회 참가 신청",
      body: "12월 6일(토) 오후 2시부터 복식 친선 대회를 엽니다. 레벨 무관, 선착순 16팀이에요. 프론트에서 신청해 주세요.",
      isUrgent: true,
    },
    {
      id: "seed-notice-2",
      facilityId: FACILITY_ID,
      title: "코트 바닥 보수 안내",
      body: "11월 25일(화) 오전 7~10시 코트 바닥 보수가 있어요. 해당 시간은 예약을 받지 않습니다.",
      isUrgent: false,
    },
    {
      id: "seed-notice-3",
      facilityId: GANGNAM_ID,
      title: "평일 아침 할인 오픈",
      body: "평일 오전 6~9시 이용 시 음료 1잔을 드려요.",
      isUrgent: false,
    },
  ];
  for (const n of items) {
    await db.announcement.upsert({ where: { id: n.id }, update: { title: n.title, body: n.body }, create: n });
  }
}

// 오픈플레이 참가자로 쓰는 샘플 회원
const PLAYERS = ["김도윤", "이서준", "박하은", "최지우", "정민재", "강예린", "조현우", "윤소희", "장태민", "임수아", "한지성", "오유진"];
const playerId = (i: number) => `seed-player-${i + 1}`;

async function seedPlayers() {
  for (const [i, name] of PLAYERS.entries()) {
    await db.user.upsert({
      where: { id: playerId(i) },
      update: {},
      create: { id: playerId(i), kakaoId: `seed-kakao-player-${i + 1}`, name, phone: `0101111${String(1000 + i)}` },
    });
  }
}

// 오픈플레이 세션: 코트 1면을 booking(source=open_play) 1건으로 잡고, 샘플 회원이 결제·참가한 상태로 만든다.
// 앞으로 열릴 세션이 하나도 없을 때만 새로 만든다(배포마다 시드가 돌아 지난 세션이 채워진다).
async function seedOpenPlay() {
  const now = new Date();
  const active = await db.court.findMany({ where: { facilityId: FACILITY_ID, isActive: true }, orderBy: { sortOrder: "asc" } });
  const activeIds = new Set(active.map((c) => c.id));

  // 예전 시드가 비활성 코트에 만든 세션은 취소한다(코트 1면으로 바뀜).
  const stale = await db.openPlaySession.findMany({ where: { facilityId: FACILITY_ID, status: "open", startAt: { gt: now } } });
  for (const st of stale.filter((x) => x.courtIds.some((id) => !activeIds.has(id)))) {
    await db.$transaction(async (tx) => {
      const bookings = await tx.booking.findMany({ where: { openPlaySessionId: st.id }, select: { id: true } });
      await tx.bookingSlot.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
      await tx.booking.updateMany({ where: { openPlaySessionId: st.id }, data: { status: "cancelled", cancelledAt: now, cancelReason: "코트 변경" } });
      // 데모용 테스트 결제(Mock)만 있으므로 참가·결제도 함께 취소 처리한다.
      const joined = await tx.openPlayParticipant.findMany({ where: { sessionId: st.id, status: "joined" } });
      await tx.openPlayParticipant.updateMany({ where: { sessionId: st.id }, data: { status: "cancelled" } });
      await tx.payment.updateMany({
        where: { id: { in: joined.map((p) => p.paymentId).filter((x): x is string => !!x) }, status: "done" },
        data: { status: "cancelled" },
      });
      await tx.openPlaySession.update({ where: { id: st.id }, data: { status: "cancelled" } });
    });
  }

  if (active.length === 0) return;
  const courtId = active[0].id;
  // 오늘부터 14일 동안 하루 1개(2시간) 오픈플레이. 그날 열린 세션이 이미 있으면 건너뛴다.
  for (let day = 0; day < SAMPLE_DAYS; day++) {
    const date = kstDate(day);
    const wd = weekdayOf(date);
    const s = OPEN_PLAY_BY_WEEKDAY[wd];
    const startAt = at(date, s.start);
    const endAt = at(date, s.start + 120);
    if (startAt.getTime() <= now.getTime()) continue;
    const exists = await db.openPlaySession.count({
      where: { facilityId: FACILITY_ID, status: "open", startAt: { gte: at(date, 0), lt: at(date, 24 * 60) } },
    });
    if (exists > 0) continue;
    const joined = Math.min(s.capacity, s.capacity - 4 + ((day * 3) % 5)); // 정원 -4 ~ 정원(마감)
    const slots: Date[] = [];
    for (let t = startAt.getTime(); t < endAt.getTime(); t += 30 * 60_000) slots.push(new Date(t));
    try {
      await db.$transaction(async (tx) => {
        const session = await tx.openPlaySession.create({
          data: { facilityId: FACILITY_ID, courtIds: [courtId], title: s.title, startAt, endAt, capacity: s.capacity, fee: s.fee },
        });
        await tx.booking.create({
          data: {
            bookingNo: `PB-OP-${session.id.slice(-6)}-${courtId.slice(-4)}`,
            facilityId: FACILITY_ID,
            courtId,
            startAt,
            endAt,
            totalAmount: 0,
            status: "confirmed",
            source: "open_play",
            openPlaySessionId: session.id,
            slots: { create: slots.map((slotStart) => ({ courtId, slotStart })) },
          },
        });
        for (let i = 0; i < joined; i++) {
          const participant = await tx.openPlayParticipant.create({ data: { sessionId: session.id, userId: playerId(i) } });
          const payment = await tx.payment.create({
            data: {
              orderId: `seed-op-${session.id}-${i + 1}`,
              participantId: participant.id,
              userId: playerId(i),
              amount: s.fee,
              method: "카드",
              status: "done",
              approvedAt: new Date(),
            },
          });
          await tx.openPlayParticipant.update({ where: { id: participant.id }, data: { paymentId: payment.id } });
        }
      });
    } catch (e) {
      console.warn("skip open play sample (slot taken):", date, e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
}

const SAMPLE_DAYS = 14;
const kstDate = (dayOffset: number) =>
  new Date(Date.now() + 9 * 3600_000 + dayOffset * 86400_000).toISOString().slice(0, 10);
const at = (date: string, minute: number) => new Date(new Date(`${date}T00:00:00+09:00`).getTime() + minute * 60_000);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

// 요일별 오픈플레이 (2시간). 0=일 … 6=토
const OPEN_PLAY_BY_WEEKDAY: Record<number, { start: number; title: string; capacity: number; fee: number }> = {
  0: { start: h(14), title: "주말 오픈플레이 (전 레벨)", capacity: 12, fee: 15000 },
  1: { start: h(19), title: "퇴근 후 오픈플레이 (초·중급)", capacity: 10, fee: 12000 },
  2: { start: h(10), title: "오전 오픈플레이 (초급)", capacity: 8, fee: 10000 },
  3: { start: h(20), title: "나이트 오픈플레이 (중급)", capacity: 8, fee: 15000 },
  4: { start: h(9), title: "모닝 오픈플레이 (전 레벨)", capacity: 12, fee: 12000 },
  5: { start: h(19), title: "불금 오픈플레이 (전 레벨)", capacity: 12, fee: 15000 },
  6: { start: h(10), title: "주말 오픈플레이 (전 레벨)", capacity: 12, fee: 15000 },
};

// 날마다 몇 시간은 "마감"으로 보이도록 전화·현장 예약 샘플. 날짜별 번호(PB-SEED-yyyyMMdd-n)로 한 번만 넣는다.
const CLOSED_PATTERNS: number[][][] = [
  [[7, 8], [12, 13], [18, 19], [21, 23]],
  [[6, 7], [8, 9], [15, 16], [17, 18]],
  [[7, 9], [13, 14], [16, 17], [22, 23]],
];
const GUESTS = ["김민수", "동호회 화요팀", "이서연", "박지훈", "레슨 (김하늘 코치)", "정기 대관", "최유나"];

async function seedSampleBookings() {
  const courts = await db.court.findMany({ where: { facilityId: FACILITY_ID, isActive: true }, orderBy: { sortOrder: "asc" } });
  if (courts.length === 0) return;
  const courtId = courts[0].id;
  for (let day = 0; day < SAMPLE_DAYS; day++) {
    const date = kstDate(day);
    const prefix = `PB-SEED-${date.replaceAll("-", "")}-`;
    if ((await db.booking.count({ where: { bookingNo: { startsWith: prefix } } })) > 0) continue;
    for (const [i, [sh, eh]] of CLOSED_PATTERNS[day % CLOSED_PATTERNS.length].entries()) {
      const startAt = at(date, h(sh));
      const endAt = at(date, h(eh));
      if (startAt.getTime() <= Date.now()) continue;
      const slots: Date[] = [];
      for (let t = startAt.getTime(); t < endAt.getTime(); t += 30 * 60_000) slots.push(new Date(t));
      try {
        await db.booking.create({
          data: {
            bookingNo: `${prefix}${i + 1}`,
            facilityId: FACILITY_ID,
            courtId,
            startAt,
            endAt,
            totalAmount: slots.length * 15000,
            status: "confirmed",
            source: "manual",
            guestName: GUESTS[(day + i) % GUESTS.length],
            guestPhone: null,
            slots: { create: slots.map((slotStart) => ({ courtId, slotStart })) },
          },
        });
      } catch {
        // 이미 예약된 시간(오픈플레이·이용자 예약)이면 건너뛴다.
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
