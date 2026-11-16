#!/bin/sh
# Vercel 빌드: 마이그레이션 적용 → 샘플 데이터(멱등) → Next.js 빌드.
# Neon 연동은 DATABASE_URL(풀링)과 DATABASE_URL_UNPOOLED(직접 연결)를 넣어 준다. 마이그레이션은 직접 연결로 한다.
set -e
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL 이 없습니다. Vercel 프로젝트 > Storage 에서 Neon(Postgres) 데이터베이스를 연결한 뒤 다시 배포하세요." >&2
  exit 1
fi
DIRECT_URL="${DATABASE_URL_UNPOOLED:-$DATABASE_URL}"
pnpm prisma generate
DATABASE_URL="$DIRECT_URL" pnpm prisma migrate deploy
DATABASE_URL="$DIRECT_URL" pnpm tsx prisma/seed.ts
pnpm next build
