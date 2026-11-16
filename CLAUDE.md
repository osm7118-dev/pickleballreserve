# CLAUDE.md

인도어 피클볼장 통합 예약 플랫폼 MVP. 이용자는 모바일 웹(PWA)에서 30분 단위로 코트를 검색·예약·결제하고, 시설 운영자와 플랫폼 관리자는 PC 웹에서 시설·예약·정산을 관리한다.

## 기준 문서: docs/PRD.md

- **`docs/PRD.md`가 이 프로젝트의 단일 기준(source of truth)이다.** 기능, 화면, 흐름, 테이블, 정책은 모두 PRD를 따른다.
- 작업 전에 관련 PRD 섹션을 먼저 읽는다. 화면은 PRD의 화면 ID(U01~U12, O01~O11, A01~A05)로 부른다.
- PRD에 없는 기능은 만들지 않는다. "나중에" 열에 있는 기능도 만들지 않는다.
- 코드와 PRD가 다르면 PRD가 맞다. 구현상 PRD를 바꿔야 한다면 임의로 바꾸지 말고, 같은 PR에서 `docs/PRD.md`를 함께 고치고 PR 설명에 이유를 적는다.
- PRD "5. 오픈 이슈"에 있는 항목(수수료율, 정산 구조, 공휴일 가격 등)은 스스로 결정하지 않는다. PRD에 적힌 가정값이나 설정값으로 두고 `TODO(open-issue):` 주석을 남긴다.

## 기술 스택

| 영역 | 선택 |
|---|---|
| 앱 | Next.js (App Router) + TypeScript (`strict`) — 이용자·운영자·관리자 화면을 한 앱에서 라우트로 나눈다 |
| DB | PostgreSQL 16 + Prisma ORM (`prisma migrate`) |
| 인증 | Auth.js (NextAuth) 카카오 프로바이더, DB 세션 |
| 결제 | 토스페이먼츠 결제위젯 + 승인/취소 API (처음에는 Mock) |
| 알림 | 카카오 알림톡 (발송 대행사 미정, 처음에는 콘솔 Mock) |
| UI | Tailwind CSS, 이용자 화면은 모바일 우선 |
| 검증 | Zod (API 입력, 환경변수) |
| 날짜 | date-fns + @date-fns/tz (저장은 UTC `timestamptz`, 표시는 `Asia/Seoul`) |
| 테스트 | Vitest (단위·DB 통합), Playwright (핵심 흐름 E2E) |
| 패키지 | pnpm, Node.js LTS |
| 로컬 DB | docker compose 로 PostgreSQL 실행 |

## 폴더 구조

```
docs/
  PRD.md                     # 기준 문서
prisma/
  schema.prisma              # PRD 4장 18개 테이블
  migrations/                # UNIQUE/CHECK 등 Prisma가 못 만드는 제약은 SQL 마이그레이션에 직접 작성
  seed.ts                    # 개발용 시설·코트·가격 샘플
src/
  app/
    (user)/                  # 이용자 모바일 웹 U01~U12
    operator/                # 운영자 웹 O01~O11
    admin/                   # 관리자 웹 A01~A05
    api/
      payments/              # 토스 성공/실패 리다이렉트, 승인
      cron/                  # held 만료 정리, 리마인드 알림톡
  server/                    # 도메인 로직 (UI·Next.js에 의존하지 않음)
    booking/                 # 슬롯 계산, 예약 규칙 검증, 선점/확정/취소
    pricing/                 # price_rules 기반 금액 계산
    payment/                 # PaymentGateway 인터페이스, toss.ts, mock.ts
    notification/            # Notifier 인터페이스, alimtalk.ts, console.ts
    refund/                  # cancellation_tiers 기반 환불액 계산
    settlement/
    auth/                    # 세션, 역할(user/admin), facility_staff 권한 확인
  components/                # 공용 UI 컴포넌트
  lib/
    db.ts                    # Prisma client 싱글턴
    time.ts                  # 30분 슬롯, KST 변환 유틸
    money.ts                 # 원 단위 정수 금액 유틸
    env.ts                   # Zod로 검증한 환경변수
tests/
  unit/  integration/  e2e/
```

- 라우트 파일(`page.tsx`, `route.ts`)은 얇게 두고, 비즈니스 로직은 `src/server/`에 둔다.
- 화면 파일 상단 주석에 PRD 화면 ID를 적는다. 예: `// U05 시설 상세`

## 코딩 규칙

**도메인 규칙 (PRD 4장)**

- 금액은 모두 원 단위 정수(`Int`)다. 소수, `float`, `Decimal`을 쓰지 않는다.
- 시각은 DB에 `timestamptz`로 저장하고, 화면 표시와 "같은 날" 판단은 `Asia/Seoul` 기준으로 한다.
- 예약 시작·종료는 항상 30분 경계다. 슬롯은 `booking_slots` 행 하나가 30분 하나다.
- 중복 예약은 `booking_slots`의 `UNIQUE(court_id, slot_start)`로 DB에서 막는다. 앱 코드의 "빈 슬롯 확인"만으로 막지 않는다.
- 예약 선점은 PRD 4장 "예약 규칙 검증 순서" 1~7단계를 한 트랜잭션에서, 그 순서대로 실행한다.
- 금액은 서버가 `price_rules`로 계산한다. 클라이언트가 보낸 금액은 믿지 않는다.
- 결제 승인 직전에 booking이 아직 `held`이고 `hold_expires_at` 전인지 다시 확인한다. 토스 금액과 서버 금액이 다르면 승인하지 않는다.
- 결제 승인·취소는 `order_id`로 멱등하게 처리한다. 같은 요청이 두 번 와도 결과가 한 번만 반영돼야 한다.
- 상태값(`held`/`confirmed`/... 등)은 PRD 테이블에 적힌 값만 쓰고, Prisma enum으로 정의한다.
- `bank_account` 같은 민감 정보는 암호화해 저장하고 로그에 남기지 않는다. 전화번호도 로그에 마스킹한다.

**외부 연동**

- 토스페이먼츠, 알림톡은 인터페이스(`PaymentGateway`, `Notifier`) 뒤에 둔다. 환경변수 `PAYMENT_PROVIDER=mock|toss`, `NOTIFIER=console|alimtalk`로 바꾼다.
- 키·시크릿은 커밋하지 않는다. 새 환경변수는 `.env.example`과 `src/lib/env.ts`에 함께 추가한다.

**코드 스타일**

- TypeScript `strict`, `any` 금지. 외부 입력은 Zod로 파싱한 뒤 사용한다.
- 서버 데이터 변경은 Server Action 또는 `app/api` 라우트에서만 하고, 권한 확인(이용자 본인 / 해당 시설 staff / admin)을 먼저 한다.
- 화면 문구는 한국어로 쓴다. 코드 식별자와 커밋 메시지는 영어로 쓴다.
- 예약 규칙, 금액 계산, 환불 계산에는 반드시 테스트를 붙인다. 동시 예약은 DB 통합 테스트로 확인한다.
- 커밋은 Conventional Commits(`feat:`, `fix:`, `chore:` …), PR은 아래 빌드 단계 하나 이하 크기로 나눈다.
- PR 전에 `pnpm lint`, `pnpm typecheck`, `pnpm test`가 통과해야 한다.

## 권장 빌드 순서

한 단계씩 끝내고 다음으로 넘어간다. 각 단계는 별도 PR로 낸다.

1. **DB 스키마** — PRD 4장 18개 테이블을 `schema.prisma`로 옮기고, `booking_slots` 유니크 제약·운영시간 CHECK 제약 마이그레이션, 시드 데이터, docker compose PostgreSQL.
2. **카카오 로그인** — Auth.js 카카오 로그인, U01·U02(휴대폰 번호·약관 동의), 역할/시설 권한 미들웨어, O01 운영자 시작.
3. **코트 예약** — 슬롯·가격 계산, 예약 규칙 검증 1~7단계, U03~U06 검색→시간표→선점, held 10분 만료 크론, U09·U10 내 예약.
4. **토스 결제 (Mock 먼저)** — `PaymentGateway` Mock으로 U07·U08 흐름과 확정·취소·부분환불을 먼저 완성하고 테스트한 뒤, 토스 테스트 키로 실제 위젯·승인·취소 API를 붙인다.
5. **운영자 화면** — O02~O11 (입점 신청, 시설·코트·운영시간·가격·규칙 설정, 예약 캘린더, 수동 예약·노쇼, 회원·매출). 이후 관리자 A01~A05, 알림톡, 오픈플레이 순.

## 자주 쓰는 명령

```bash
pnpm install
cp .env.example .env           # 처음 한 번
docker compose up -d db        # 로컬 PostgreSQL 16 (pickleball, pickleball_test DB 생성)
pnpm db:migrate                # = prisma migrate dev, 마이그레이션 적용·새 마이그레이션 생성
pnpm db:seed                   # 샘플 시설(성수 인도어 피클볼)·코트·가격·규칙
pnpm dev                       # 개발 서버
pnpm lint && pnpm typecheck && pnpm test
```

- 카카오 연동 전 로그인은 `DEMO_LOGIN=on`일 때 나오는 테스트 계정(시드의 `seed-user-customer`, `seed-user-owner`)으로 한다. 서명 쿠키 세션(`src/server/auth/token.ts`)이고, 빌드 2단계에서 Auth.js 카카오로 바꾼다.
- Vercel 배포는 `pnpm vercel-build`(`scripts/vercel-build.sh`: migrate deploy → seed → next build)를 쓴다. README "Vercel 배포" 참고.
- `pnpm test`는 `DATABASE_URL_TEST`(이름에 `test`가 들어간 DB만 허용)를 매번 비우고 마이그레이션한 뒤 Vitest를 돌린다. 개발 DB는 건드리지 않는다.
- CHECK/EXCLUDE 같은 제약은 Prisma 스키마로 표현할 수 없으므로 `prisma migrate dev --create-only`로 빈 마이그레이션을 만든 뒤 SQL을 직접 쓴다. 기존 예: `prisma/migrations/*_constraints/migration.sql`.
- 하루 중 시각(운영시간·가격 시간대)은 자정부터의 분(`open_minute` 등, 0~1440)으로 저장한다. 날짜가 있는 시각만 `timestamptz`다.
- 모든 id는 문자열 cuid다(Auth.js Prisma 어댑터와 맞추기 위해).
