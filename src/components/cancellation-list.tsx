/** 취소 규정 (U05, U06, U10 공통) */
export function CancellationList({ tiers }: { tiers: { hoursBefore: number; refundPercent: number }[] }) {
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  return (
    <ul className="space-y-1 text-[14px]">
      {sorted.map((t, i) => (
        <li key={t.hoursBefore} className="flex justify-between">
          <span className="text-muted">
            {t.hoursBefore === 0
              ? `이용 ${sorted[i - 1]?.hoursBefore ?? 0}시간 이내`
              : i === 0
                ? `이용 ${t.hoursBefore}시간 전까지`
                : `${sorted[i - 1].hoursBefore}~${t.hoursBefore}시간 전`}
          </span>
          <b className={t.refundPercent === 0 ? "text-danger" : ""}>{t.refundPercent}% 환불</b>
        </li>
      ))}
      <li className="pt-1 text-[13px] text-muted">결제 후 10분 안에 취소하면 이용 시작 전이라면 전액 환불돼요.</li>
    </ul>
  );
}
