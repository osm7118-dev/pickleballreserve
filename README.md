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
