// held 10분 만료 정리 (크론 1분 간격). Authorization: Bearer $CRON_SECRET
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { expireHolds } from "@/server/booking/hold";

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const expired = await expireHolds();
  return NextResponse.json({ expired });
}
