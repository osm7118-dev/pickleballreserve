import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { maskPhone } from "@/lib/phone";

// 알림톡 템플릿 (PRD 5장: 이용자 3종 + 운영자 3종). 리마인드·입점 승인은 이후 단계.
export type TemplateCode =
  | "user_booking_confirmed"
  | "user_booking_cancelled"
  | "operator_new_booking"
  | "operator_booking_cancelled";

export type NotifyInput = {
  template: TemplateCode;
  userId?: string | null;
  phone?: string | null;
  bookingId?: string | null;
  text: string;
};

export interface Notifier {
  send(input: NotifyInput): Promise<{ ok: boolean; vendorMsgId?: string }>;
}

/** 발송 대행사가 정해지기 전까지 콘솔에만 찍는다. 전화번호는 마스킹. */
export class ConsoleNotifier implements Notifier {
  async send(input: NotifyInput) {
    console.info(`[alimtalk:${input.template}] to=${maskPhone(input.phone)} ${input.text}`);
    return { ok: true, vendorMsgId: `console-${Date.now()}` };
  }
}

// TODO(open-issue): 알림톡 발송 대행사 선정 후 AlimtalkNotifier 추가 (NOTIFIER=alimtalk)
function getNotifier(): Notifier {
  switch (env.NOTIFIER) {
    case "console":
      return new ConsoleNotifier();
  }
}

/** 발송하고 notifications에 이력을 남긴다. 실패해도 예약 흐름은 막지 않는다. */
export async function notify(input: NotifyInput): Promise<void> {
  if (!input.userId && !input.phone) return;
  try {
    const res = await getNotifier().send(input);
    await db.notification.create({
      data: {
        userId: input.userId ?? null,
        phone: input.phone ?? null,
        templateCode: input.template,
        bookingId: input.bookingId ?? null,
        status: res.ok ? "sent" : "failed",
        sentAt: res.ok ? new Date() : null,
        vendorMsgId: res.vendorMsgId ?? null,
      },
    });
  } catch (e) {
    console.error(`[alimtalk:${input.template}] failed`, e instanceof Error ? e.message : e);
  }
}
