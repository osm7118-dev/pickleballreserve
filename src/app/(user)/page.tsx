// U03 홈: "내 매장" 중심 — 매장 정보, 회원 카드, 프로그램·오픈플레이 / 코트 예약 / 개인 레슨, 공지, 내 예약, 다른 매장 보기
import Link from "next/link";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatKst } from "@/lib/time";
import { resolveHomeFacility } from "@/server/club";
import { listMyItems } from "@/server/club/my-items";
import { BottomTabs } from "@/components/bottom-tabs";
import { MyItemCard } from "@/components/my-item-card";
import { Badge, btnPrimary } from "@/components/ui";
import { IconChevron, IconPin } from "@/components/icons";

export const dynamic = "force-dynamic";

const bigBtn =
  "flex h-16 w-full items-center justify-center bg-primary text-[17px] font-bold text-white transition hover:bg-primary-hover";

export default async function HomePage() {
  const store = await cookies();
  const user = await getCurrentUser();
  const facility = await resolveHomeFacility(store.get("pb_club")?.value, user?.id);
  if (!facility) {
    return (
      <main className="px-5 pt-16 text-center text-muted">
        아직 열린 매장이 없어요.
        <BottomTabs />
      </main>
    );
  }
  const now = new Date();
  const [notices, items, member, clubCount] = await Promise.all([
    db.announcement.findMany({ where: { facilityId: facility.id }, orderBy: [{ isUrgent: "desc" }, { createdAt: "desc" }], take: 5 }),
    user ? listMyItems(user.id, "upcoming", now, 3) : Promise.resolve([]),
    user ? db.facilityCustomer.findUnique({ where: { facilityId_userId: { facilityId: facility.id, userId: user.id } } }) : null,
    db.facility.count({ where: { status: "approved" } }),
  ]);
  const initials = (user?.name ?? "회원").trim().slice(0, 1);

  return (
    <main className="pb-28">
      <header className="flex items-center gap-3 px-5 pt-7 pb-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary">
          <span className="block h-5 w-5 rounded-full bg-accent" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-[21px] leading-tight font-extrabold">{facility.name}</h1>
          <p className="flex items-center gap-1 text-[14px] text-muted">
            <IconPin className="h-3.5 w-3.5" /> {facility.regionSido} {facility.regionSigungu}
          </p>
        </div>
      </header>

      <div className="space-y-6 px-5">
        {user ? (
          <Link href="/me" className="card flex items-center gap-4 p-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-[17px] font-bold text-white">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-bold">{user.name ?? "회원"}</p>
              <p className="text-[14px] text-muted">
                {member && member.visitCount > 0 ? `이용 ${member.visitCount}회 · 일반 회원` : "일일 이용 회원"}
              </p>
            </div>
            <IconChevron className="h-5 w-5 text-muted-2" />
          </Link>
        ) : (
          <div className="card flex items-center gap-4 p-4">
            <p className="flex-1 text-[15px] text-muted">로그인하면 예약과 레슨을 한 곳에서 관리할 수 있어요.</p>
            <Link href="/login" className="inline-flex h-11 shrink-0 items-center bg-ink px-4 text-[14px] font-bold text-white">
              로그인
            </Link>
          </div>
        )}

        <nav className="space-y-3" aria-label="예약 메뉴">
          <Link href={`/facilities/${facility.id}/programs`} className={bigBtn}>
            프로그램 · 오픈플레이
          </Link>
          <Link href={`/facilities/${facility.id}`} className={bigBtn}>
            코트 예약
          </Link>
          <Link href={`/facilities/${facility.id}/lessons`} className={bigBtn}>
            개인 레슨
          </Link>
        </nav>

        <section>
          <SectionHead title="공지사항" href={`/facilities/${facility.id}/notices`} />
          {notices.length === 0 ? (
            <p className="card p-5 text-[14px] text-muted">새 공지가 없어요.</p>
          ) : (
            <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
              {notices.map((n) => (
                <Link
                  key={n.id}
                  href={`/facilities/${facility.id}/notices#${n.id}`}
                  className="card flex w-[85%] shrink-0 snap-start flex-col p-5"
                >
                  <p className="flex items-center gap-2 text-[17px] font-bold">
                    {n.isUrgent && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger" aria-hidden />}
                    <span className="truncate">{n.title}</span>
                  </p>
                  <p className="mt-2 line-clamp-3 text-[14px] text-muted">{n.body}</p>
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <span className="tabular text-[13px] text-muted">{formatKst(n.createdAt, "M월 d일 (EEE) HH:mm")}</span>
                    {n.isUrgent && <Badge tone="danger">중요</Badge>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHead title="내 예약" href="/bookings" />
          {!user ? (
            <p className="card p-5 text-[14px] text-muted">로그인하면 예약이 여기에 보여요.</p>
          ) : items.length === 0 ? (
            <div className="card p-5 text-center">
              <p className="text-[14px] text-muted">예정된 예약이 없어요.</p>
              <Link href={`/facilities/${facility.id}`} className={`${btnPrimary} mt-3 !h-12`}>
                코트 예약하기
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <MyItemCard key={`${it.kind}-${it.id}`} item={it} now={now} />
              ))}
            </div>
          )}
        </section>

        <Link href="/clubs" className="card flex items-center justify-between p-5">
          <div>
            <p className="text-[17px] font-bold">다른 매장 보기</p>
            <p className="text-[14px] text-muted">예약 가능한 매장 {clubCount}곳 · 시간으로 빈 코트 찾기</p>
          </div>
          <IconChevron className="h-5 w-5 text-muted-2" />
        </Link>
      </div>
      <BottomTabs />
    </main>
  );
}

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[20px] font-extrabold">{title}</h2>
      <Link href={href} className="flex items-center text-[14px] font-semibold text-muted">
        전체 보기 <IconChevron className="h-4 w-4" />
      </Link>
    </div>
  );
}
