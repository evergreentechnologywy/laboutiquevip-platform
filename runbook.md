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
- Prisma schema validates:
  - `npx prisma validate --schema backend/prisma/schema.prisma`
- No secrets added to git-tracked files.

## Rollback (Phase 0)
- Frontend rollback: deploy prior frontend artifact.
- Backend rollback: disable backend service routing and deploy previous image/release.
- Database rollback: restore from backup/snapshot if destructive issue occurs.
