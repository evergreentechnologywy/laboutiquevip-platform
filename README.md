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
  - RBAC middleware stub
  - Immutable audit logging utility stub

## Scripts
- `npm run dev` / `npm run dev:frontend`: run current frontend (Vite)
- `npm run dev:backend:typecheck`: typecheck backend TypeScript
- `npm run build:backend`: compile backend to `backend/dist`
- `npm run start:backend`: start compiled backend server
- `npm run dev:hybrid`: alias to frontend in Phase 0
- `npm run db:generate`: prisma client generation
- `npm run db:migrate:dev`: apply prisma migrations in dev
- `npm run db:migrate:deploy`: apply prisma migrations in deploy

## Environment
Use `.env.example` as the template. Do not commit secrets.
