# pickleballreserve

인도어 피클볼장 통합 예약 플랫폼 MVP.

- 기획 문서: [docs/PRD.md](docs/PRD.md)
- 개발 규칙: [CLAUDE.md](CLAUDE.md)

## 로컬 실행

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

자세한 명령과 규칙은 [CLAUDE.md](CLAUDE.md)의 "자주 쓰는 명령"을 보세요.

## 체험해 보기 (테스트 계정)

카카오 로그인 연동 전까지는 `DEMO_LOGIN=on`일 때 로그인 화면에 테스트 계정 버튼이 나온다.

- **고객으로 체험하기**: `테스트 고객`. 처음 로그인하면 휴대폰 번호·약관 동의(U02)를 거친다.
- **시설 운영자로 체험하기**: `성수 인도어 피클볼` 운영자. `/operator`에서도 들어갈 수 있다.
- 결제는 Mock이라 실제로 돈이 나가지 않는다. 알림톡은 서버 로그에만 찍힌다.

| 화면 | 주소 |
|---|---|
| 이용자 홈(U03) | `/` |
| 내 예약(U09) | `/bookings` |
| 운영자 시작(O01) | `/operator` |
| 운영자 예약 캘린더(O09) | `/operator/calendar` |

## Vercel 배포

1. Vercel에서 이 저장소를 Import 한다(프레임워크 Next.js, 설정은 기본값).
2. 프로젝트 **Storage → Create Database → Neon(Postgres)** 로 무료 DB를 만들고 이 프로젝트에 연결한다. `DATABASE_URL`, `DATABASE_URL_UNPOOLED`가 자동으로 들어간다.
3. **Deployments → Redeploy**. 빌드(`pnpm vercel-build` = `scripts/vercel-build.sh`)가 마이그레이션과 샘플 데이터를 넣고 Next.js를 빌드한다.

held 만료는 예약·조회 때 바로 정리되므로 크론 없이도 동작한다. 1분 간격 정리 크론(`/api/cron/expire-holds`, `Authorization: Bearer $CRON_SECRET`)은 Vercel 유료 플랜이나 외부 크론에서 호출한다.
