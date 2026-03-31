# Trystlike Hybrid App (Phase 0)

This repo keeps the current Vite/Base44 frontend running while introducing a backend foundation for production migration.

## Current Runtime
- Frontend remains the active runtime.
- Existing UI functionality is preserved.

## Added in Phase 0
- Architecture and migration docs:
  - `architecture.md`
  - `runbook.md`
  - `docs/audit.md`
  - `docs/phase-plan.md`
- Backend scaffold in `backend/`:
  - TypeScript API skeleton
  - Prisma schema + initial migration files
  - Model onboarding APIs (`/api/v1/models/*`)
  - Calendar + tours APIs (`/api/v1/models/me/calendar`, `/api/v1/models/me/tours`)
  - Public search APIs (`/api/v1/search/cities`, `/api/v1/search/models`)
  - NOWPayments order + webhook ingestion path (`/api/v1/orders`, `/api/v1/webhooks/nowpayments`)
  - RBAC enforcement (provider self-service, admin override via `?user_id=`)
  - Audit logging for provider profile and tour mutations

## Scripts
- `npm run dev` / `npm run dev:frontend`: run current frontend (Vite)
- `npm run dev:backend:typecheck`: typecheck backend TypeScript
- `npm run build:backend`: compile backend to `backend/dist`
- `npm run test:backend`: compile + run backend tests
- `npm run start:backend`: start compiled backend server
- `npm run dev:hybrid`: alias to frontend in Phase 0
- `npm run db:generate`: prisma client generation
- `npm run db:migrate:dev`: apply prisma migrations in dev
- `npm run db:migrate:deploy`: apply prisma migrations in deploy

## Environment
Use `.env.example` as the template. Do not commit secrets.

### Upload storage
- Default behavior stays the same: uploads are written to `backend/uploads` and served by the backend from `PUBLIC_UPLOAD_BASE` (default `/uploads`).
- To switch to S3-compatible storage, set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
- Recommended for production/CDN use: also set `S3_ENDPOINT` (for R2/MinIO/etc.) and `S3_PUBLIC_BASE_URL` so returned image URLs point at the public bucket/CDN host.
- Optional knobs: `S3_REGION` (defaults to `auto`), `S3_KEY_PREFIX` (defaults to `uploads`), and `S3_FORCE_PATH_STYLE` (defaults to `true`, which is usually safer for S3-compatible providers).

## Deployment docs
- Current production runbook: `runbook.md`
- Hetzner + Cloudflare migration guide: `docs/hetzner-cloudflare-migration-2026-03-20.md`
