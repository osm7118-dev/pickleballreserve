// 공지사항 전체 보기
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatKst } from "@/lib/time";
import { Badge, TopBar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NoticesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facility = await db.facility.findFirst({
    where: { id, status: "approved" },
    include: { announcements: { orderBy: [{ isUrgent: "desc" }, { createdAt: "desc" }] } },
  });
  if (!facility) notFound();
  return (
    <main className="pb-12">
      <TopBar title="공지사항" back="/" />
      <div className="space-y-3 px-5 pt-4">
        <p className="text-[14px] text-muted">{facility.name}</p>
        {facility.announcements.length === 0 && <div className="card p-6 text-center text-muted">공지가 없어요.</div>}
        {facility.announcements.map((n) => (
          <article key={n.id} id={n.id} className="card scroll-mt-20 p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[17px] font-bold">{n.title}</h2>
              {n.isUrgent && <Badge tone="danger">중요</Badge>}
            </div>
            <p className="mt-2 text-[15px] whitespace-pre-line">{n.body}</p>
            <p className="tabular mt-3 text-[13px] text-muted">{formatKst(n.createdAt, "yyyy.MM.dd HH:mm")}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
