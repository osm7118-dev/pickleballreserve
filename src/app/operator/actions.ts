"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { isDateStr, kstAt } from "@/lib/time";
import { BookingError } from "@/server/booking/errors";
import {
  cancelByFacility,
  createBlackout,
  createManualBooking,
  deleteBlackout,
  markNoShow,
} from "@/server/booking/manage";
import { findStaffFacility } from "@/server/auth/staff";

async function requireStaff() {
  const user = await getCurrentUser();
  if (!user) redirect("/operator");
  const facility = await findStaffFacility(user.id);
  if (!facility) redirect("/operator");
  return { user, facility };
}

const cal = (date: string, extra = "") => `/operator/calendar?date=${date}${extra}`;

async function run(date: string, fn: () => Promise<unknown>, ok: string, keep = "") {
  try {
    await fn();
  } catch (e) {
    if (e instanceof BookingError) redirect(cal(date, `${keep}&err=${e.code}`));
    throw e;
  }
  redirect(cal(date, `&msg=${ok}`));
}

const bookingSchema = z.object({ bookingId: z.string().min(1), date: z.string().refine(isDateStr) });

/** O09 예약 취소 (시설 사정, 전액 환불) */
export async function operatorCancelAction(formData: FormData) {
  const { user } = await requireStaff();
  const { bookingId, date } = bookingSchema.parse(Object.fromEntries(formData));
  await run(date, () => cancelByFacility({ bookingId, staffUserId: user.id }), "cancelled", `&b=${bookingId}`);
}

/** O09 노쇼 처리 */
export async function noShowAction(formData: FormData) {
  const { user } = await requireStaff();
  const { bookingId, date } = bookingSchema.parse(Object.fromEntries(formData));
  await run(date, () => markNoShow({ bookingId, staffUserId: user.id }), "noshow", `&b=${bookingId}`);
}

const manualSchema = z.object({
  courtId: z.string().min(1),
  date: z.string().refine(isDateStr),
  start: z.coerce.number().int(),
  minutes: z.coerce.number().int().min(30).max(24 * 60),
  guestName: z.string().trim().min(1).max(40),
  guestPhone: z.string().trim().max(20).optional(),
});

/** O09 수동 예약 등록 (전화·현장) */
export async function manualBookingAction(formData: FormData) {
  const { user, facility } = await requireStaff();
  const parsed = manualSchema.safeParse(Object.fromEntries(formData));
  const date = String(formData.get("date") ?? "");
  if (!parsed.success) redirect(cal(isDateStr(date) ? date : "", `&court=${formData.get("courtId")}&m=${formData.get("start")}&err=INPUT`));
  const d = parsed.data;
  const phone = d.guestPhone ? normalizePhone(d.guestPhone) : null;
  if (d.guestPhone && !phone) redirect(cal(d.date, `&court=${d.courtId}&m=${d.start}&err=PHONE`));
  await run(
    d.date,
    () =>
      createManualBooking({
        staffUserId: user.id,
        facilityId: facility.id,
        courtId: d.courtId,
        date: d.date,
        startMinute: d.start,
        endMinute: d.start + d.minutes,
        guestName: d.guestName,
        guestPhone: phone,
      }),
    "booked",
    `&court=${d.courtId}&m=${d.start}`,
  );
}

const blackoutSchema = z.object({
  courtId: z.string(),
  date: z.string().refine(isDateStr),
  start: z.coerce.number().int().multipleOf(60),
  minutes: z.coerce.number().int().min(60).max(24 * 60).multipleOf(60),
  scope: z.enum(["court", "all"]),
  reason: z.string().trim().max(100).optional(),
});

/** O09 임시 차단 */
export async function blackoutAction(formData: FormData) {
  const { user, facility } = await requireStaff();
  const d = blackoutSchema.parse(Object.fromEntries(formData));
  await run(
    d.date,
    () =>
      createBlackout({
        staffUserId: user.id,
        facilityId: facility.id,
        courtId: d.scope === "all" ? null : d.courtId,
        startAt: kstAt(d.date, d.start),
        endAt: kstAt(d.date, d.start + d.minutes),
        reason: d.reason || null,
      }),
    "blocked",
  );
}

export async function deleteBlackoutAction(formData: FormData) {
  const { user } = await requireStaff();
  const blackoutId = z.string().min(1).parse(formData.get("blackoutId"));
  const date = z.string().refine(isDateStr).parse(formData.get("date"));
  await run(date, () => deleteBlackout({ staffUserId: user.id, blackoutId }), "unblocked");
}
