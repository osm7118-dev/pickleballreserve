-- Constraints Prisma schema cannot express (CHECK / EXCLUDE).
-- PRD 4장: 금액은 원 단위 정수(>= 0), 시각은 30분 경계, 중복 예약은 DB가 막는다.
-- Note: 30분 경계 판단은 epoch 초 % 1800 = 0. KST(UTC+9)는 정시 오프셋이라 UTC 경계와 같다.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── operating_hours: 30분 배수, 0 <= open < close <= 1440, weekday 0~6
ALTER TABLE "operating_hours"
  ADD CONSTRAINT "operating_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "operating_hours_30min_check" CHECK ("open_minute" % 30 = 0 AND "close_minute" % 30 = 0),
  ADD CONSTRAINT "operating_hours_range_check" CHECK ("open_minute" >= 0 AND "open_minute" < "close_minute" AND "close_minute" <= 1440);

-- ── price_rules: 30분 배수, 범위, 가격 >= 0, 같은 시설·day_type 안에서 시간대 겹침 금지
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_30min_check" CHECK ("start_minute" % 30 = 0 AND "end_minute" % 30 = 0),
  ADD CONSTRAINT "price_rules_range_check" CHECK ("start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440),
  ADD CONSTRAINT "price_rules_price_check" CHECK ("price_per_30min" >= 0),
  ADD CONSTRAINT "price_rules_no_overlap" EXCLUDE USING gist (
    "facility_id" WITH =,
    "day_type" WITH =,
    int4range("start_minute", "end_minute") WITH &&
  );

-- ── blackouts
ALTER TABLE "blackouts"
  ADD CONSTRAINT "blackouts_range_check" CHECK ("start_at" < "end_at");

-- ── booking_policies: 이용시간은 30분 배수, min <= max
ALTER TABLE "booking_policies"
  ADD CONSTRAINT "booking_policies_advance_days_check" CHECK ("advance_days" >= 0),
  ADD CONSTRAINT "booking_policies_minutes_30min_check" CHECK (
    "min_minutes_per_booking" % 30 = 0 AND "max_minutes_per_booking" % 30 = 0 AND "max_minutes_per_day" % 30 = 0
  ),
  ADD CONSTRAINT "booking_policies_minutes_range_check" CHECK (
    "min_minutes_per_booking" >= 30
    AND "min_minutes_per_booking" <= "max_minutes_per_booking"
    AND "max_minutes_per_booking" <= "max_minutes_per_day"
  ),
  ADD CONSTRAINT "booking_policies_hold_minutes_check" CHECK ("hold_minutes" > 0);

-- ── cancellation_tiers
ALTER TABLE "cancellation_tiers"
  ADD CONSTRAINT "cancellation_tiers_hours_check" CHECK ("hours_before" >= 0),
  ADD CONSTRAINT "cancellation_tiers_percent_check" CHECK ("refund_percent" BETWEEN 0 AND 100);

-- ── bookings
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_range_check" CHECK ("start_at" < "end_at"),
  ADD CONSTRAINT "bookings_30min_check" CHECK (
    EXTRACT(EPOCH FROM "start_at")::bigint % 1800 = 0 AND EXTRACT(EPOCH FROM "end_at")::bigint % 1800 = 0
  ),
  ADD CONSTRAINT "bookings_amount_check" CHECK ("total_amount" >= 0),
  ADD CONSTRAINT "bookings_held_expiry_check" CHECK ("status" <> 'held' OR "hold_expires_at" IS NOT NULL),
  ADD CONSTRAINT "bookings_app_user_check" CHECK ("source" <> 'app' OR "user_id" IS NOT NULL),
  ADD CONSTRAINT "bookings_manual_guest_check" CHECK ("source" <> 'manual' OR "user_id" IS NOT NULL OR "guest_name" IS NOT NULL),
  ADD CONSTRAINT "bookings_open_play_session_check" CHECK (("source" = 'open_play') = ("open_play_session_id" IS NOT NULL));

-- ── booking_slots: 슬롯 시작은 30분 경계 (UNIQUE(court_id, slot_start)는 init 마이그레이션에 있음)
ALTER TABLE "booking_slots"
  ADD CONSTRAINT "booking_slots_30min_check" CHECK (EXTRACT(EPOCH FROM "slot_start")::bigint % 1800 = 0);

-- ── open_play_sessions
ALTER TABLE "open_play_sessions"
  ADD CONSTRAINT "open_play_sessions_range_check" CHECK ("start_at" < "end_at"),
  ADD CONSTRAINT "open_play_sessions_30min_check" CHECK (
    EXTRACT(EPOCH FROM "start_at")::bigint % 1800 = 0 AND EXTRACT(EPOCH FROM "end_at")::bigint % 1800 = 0
  ),
  ADD CONSTRAINT "open_play_sessions_capacity_check" CHECK ("capacity" > 0),
  ADD CONSTRAINT "open_play_sessions_fee_check" CHECK ("fee" >= 0),
  ADD CONSTRAINT "open_play_sessions_courts_check" CHECK (cardinality("court_ids") > 0);

-- ── payments: booking_id 와 participant_id 중 정확히 하나
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_target_check" CHECK (num_nonnulls("booking_id", "participant_id") = 1),
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0);

-- ── refunds
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_check" CHECK ("amount" >= 0),
  ADD CONSTRAINT "refunds_percent_check" CHECK ("refund_percent" BETWEEN 0 AND 100);

-- ── settlements
ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_period_check" CHECK ("period_start" < "period_end"),
  ADD CONSTRAINT "settlements_amounts_check" CHECK (
    "gross_amount" >= 0 AND "refund_amount" >= 0 AND "fee_amount" >= 0
  );

-- ── facility_customers
ALTER TABLE "facility_customers"
  ADD CONSTRAINT "facility_customers_counts_check" CHECK ("visit_count" >= 0 AND "no_show_count" >= 0);

-- ── notifications: 받는 사람(user_id 또는 phone) 필수
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_check" CHECK (num_nonnulls("user_id", "phone") >= 1);
