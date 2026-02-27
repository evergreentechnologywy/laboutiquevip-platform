# Phase 0 Runbook

## Purpose
Operational baseline for running the hybrid frontend + backend foundation during migration.

## Prerequisites
- Node.js 22+
- npm 10+
- PostgreSQL 15+ (or compatible)

## Environment
1. Copy `.env.example` to `.env`.
2. Populate required values without committing secrets.
3. Keep `ALLOW_HEADER_AUTH_TRUST=false` in production.
4. Set `CORS_ALLOWLIST` to explicit trusted origins only.
5. Set webhook secrets and Didit/Confirmo credentials before enabling provider integrations.

## Local Development
1. Install deps:
   - `npm ci`
2. Run frontend (existing behavior):
   - `npm run dev`
3. Validate backend TypeScript:
   - `npm run dev:backend:typecheck`
4. Build backend:
   - `npm run build:backend`
5. Start backend build output:
   - `npm run start:backend`
6. Optional webhook simulation:
   - `curl -i -X POST http://localhost:8787/api/v1/webhooks/confirmo -H "content-type: application/json" -H "x-confirmo-signature: <hex>" -d '{"id":"evt_1","type":"paid","data":{"invoice_id":"inv_1"}}'`

## Database Workflow
1. Generate Prisma client:
   - `npm run db:generate`
2. Apply migrations in development:
   - `npm run db:migrate:dev`
3. Apply migrations in deployment:
   - `npm run db:migrate:deploy`

## Verification Checklist
- Frontend routes load and render as before.
- `GET /api/health` returns `200`.
- `GET /api/v1/seo/sitemap.xml` returns XML.
- Admin endpoints under `/api/admin/*` reject non-admin roles.
- Duplicate webhook delivery returns `deduplicated: true`.
- Prisma schema validates:
  - `npx prisma validate --schema backend/prisma/schema.prisma`
- No secrets added to git-tracked files.

## Deploy script order
1. `npm ci`
2. `npm run build:backend`
3. `npm run test:backend`
4. `npm run build`
5. `npm run db:migrate:deploy`
6. Smoke check: boot backend and verify `/api/health`

## Rollback (Phase 0)
- Frontend rollback: deploy prior frontend artifact.
- Backend rollback: disable backend service routing and deploy previous image/release.
- Database rollback: restore from backup/snapshot if destructive issue occurs.
