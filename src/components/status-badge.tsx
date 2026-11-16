import type { Booking } from "@prisma/client";
import { Badge } from "./ui";

export function StatusBadge({ b, now }: { b: Pick<Booking, "status" | "endAt">; now: Date }) {
  if (b.status === "held") return <Badge tone="warn">결제 대기</Badge>;
  if (b.status === "cancelled") return <Badge tone="danger">취소</Badge>;
  if (b.status === "no_show") return <Badge tone="danger">노쇼</Badge>;
  if (b.status === "completed" || b.endAt <= now) return <Badge tone="muted">이용 완료</Badge>;
  return <Badge>예약 확정</Badge>;
}

