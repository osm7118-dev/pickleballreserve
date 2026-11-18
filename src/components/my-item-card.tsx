import Link from "next/link";
import { formatWon } from "@/lib/money";
import { rangeLabel } from "@/lib/time";
import type { MyItem } from "@/server/club/my-items";
import { Badge } from "./ui";
import { IconChevron } from "./icons";

export function MyItemBadge({ item, now }: { item: MyItem; now: Date }) {
  if (item.status === "held") return <Badge tone="warn">결제 대기</Badge>;
  if (item.status === "cancelled") return <Badge tone="danger">취소</Badge>;
  if (item.status === "no_show") return <Badge tone="danger">노쇼</Badge>;
  if (item.status === "completed" || item.endAt <= now) return <Badge tone="muted">이용 완료</Badge>;
  return <Badge>{item.kind === "open_play" ? "참가 확정" : "예약 확정"}</Badge>;
}

export function MyItemCard({ item, now }: { item: MyItem; now: Date }) {
  return (
    <Link href={item.href} className="card flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1">
          <MyItemBadge item={item} now={now} />
        </div>
        <p className="truncate text-[16px] font-bold">{item.title}</p>
        <p className="truncate text-[13px] text-muted">{item.place}</p>
        <p className="tabular text-[14px] text-muted">{rangeLabel(item.startAt, item.endAt)}</p>
        <p className="tabular text-[14px] font-bold">{formatWon(item.amount)}</p>
      </div>
      <IconChevron className="h-5 w-5 text-muted-2" />
    </Link>
  );
}
