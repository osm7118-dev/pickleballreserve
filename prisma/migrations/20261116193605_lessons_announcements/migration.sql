-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "lesson_booking_id" TEXT;

-- CreateTable
CREATE TABLE "coaches" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "lesson_minutes" INTEGER NOT NULL DEFAULT 60,
    "lesson_price" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_availabilities" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "coach_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_bookings" (
    "id" TEXT NOT NULL,
    "booking_no" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "hold_expires_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lesson_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_urgent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coaches_facility_id_idx" ON "coaches"("facility_id");

-- CreateIndex
CREATE INDEX "coach_availabilities_coach_id_weekday_idx" ON "coach_availabilities"("coach_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_bookings_booking_no_key" ON "lesson_bookings"("booking_no");

-- CreateIndex
CREATE INDEX "lesson_bookings_coach_id_start_at_idx" ON "lesson_bookings"("coach_id", "start_at");

-- CreateIndex
CREATE INDEX "lesson_bookings_user_id_start_at_idx" ON "lesson_bookings"("user_id", "start_at");

-- CreateIndex
CREATE INDEX "announcements_facility_id_created_at_idx" ON "announcements"("facility_id", "created_at");

-- CreateIndex
CREATE INDEX "payments_lesson_booking_id_idx" ON "payments"("lesson_booking_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_lesson_booking_id_fkey" FOREIGN KEY ("lesson_booking_id") REFERENCES "lesson_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_availabilities" ADD CONSTRAINT "coach_availabilities_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coaches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_bookings" ADD CONSTRAINT "lesson_bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 제약 (Prisma 스키마로 표현할 수 없는 것)
ALTER TABLE "payments" DROP CONSTRAINT "payments_target_check";
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_target_check" CHECK (num_nonnulls("booking_id", "participant_id", "lesson_booking_id") = 1);

ALTER TABLE "coaches"
  ADD CONSTRAINT "coaches_lesson_minutes_check" CHECK ("lesson_minutes" > 0 AND "lesson_minutes" % 30 = 0),
  ADD CONSTRAINT "coaches_lesson_price_check" CHECK ("lesson_price" >= 0);

ALTER TABLE "coach_availabilities"
  ADD CONSTRAINT "coach_availabilities_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "coach_availabilities_30min_check" CHECK ("start_minute" % 30 = 0 AND "end_minute" % 30 = 0),
  ADD CONSTRAINT "coach_availabilities_range_check" CHECK ("start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440);

ALTER TABLE "lesson_bookings"
  ADD CONSTRAINT "lesson_bookings_range_check" CHECK ("start_at" < "end_at"),
  ADD CONSTRAINT "lesson_bookings_30min_check" CHECK (
    EXTRACT(EPOCH FROM "start_at")::bigint % 1800 = 0 AND EXTRACT(EPOCH FROM "end_at")::bigint % 1800 = 0
  ),
  ADD CONSTRAINT "lesson_bookings_amount_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "lesson_bookings_held_expiry_check" CHECK ("status" <> 'held' OR "hold_expires_at" IS NOT NULL),
  -- 같은 코치의 진행 중(held/confirmed) 레슨은 시간이 겹칠 수 없다. 만료된 held 는 INSERT 전에 정리한다.
  ADD CONSTRAINT "lesson_bookings_no_overlap" EXCLUDE USING gist (
    "coach_id" WITH =,
    tstzrange("start_at", "end_at") WITH &&
  ) WHERE ("status" IN ('held', 'confirmed'));
