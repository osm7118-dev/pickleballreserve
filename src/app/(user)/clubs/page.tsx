// 다른 매장 보기: 매장 목록(홈 매장 바꾸기) + 시간으로 빈 코트 찾기(U03 검색 → U04)
import Link from "next/link";
import { cookies } from "next/headers";
import { listClubs } from "@/server/club";
import { SearchForm } from "@/components/search-form";
import { Badge, TopBar } from "@/components/ui";
import { IconPin } from "@/components/icons";
import { selectClubAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ClubsPage() {
  const store = await cookies();
  const current = store.get("pb_club")?.value;
  const clubs = await listClubs();
  return (
    <main className="pb-12">
      <TopBar title="다른 매장 보기" back="/" />
      <div className="space-y-3 px-5 pt-4">
        {clubs.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/facilities/${c.id}`} className="text-[17px] font-bold hover:text-primary">
                  {c.name}
                </Link>
                <p className="flex items-center gap-1 truncate text-[13px] text-muted">
                  <IconPin className="h-3.5 w-3.5 shrink-0" /> {c.address}
                </p>
                <p className="text-[13px] text-muted">코트 {c._count.courts}면</p>
              </div>
              {current === c.id && <Badge>내 매장</Badge>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href={`/facilities/${c.id}`}
                className="flex h-11 items-center justify-center border border-line-strong text-[14px] font-semibold"
              >
                코트 시간표
              </Link>
              <form action={selectClubAction}>
                <input type="hidden" name="facilityId" value={c.id} />
                <button className="h-11 w-full bg-primary text-[14px] font-bold text-white hover:bg-primary-hover">
                  내 매장으로 보기
                </button>
              </form>
            </div>
          </div>
        ))}

        <h2 className="pt-5 text-[18px] font-extrabold">시간으로 빈 코트 찾기</h2>
        <SearchForm />
      </div>
    </main>
  );
}
