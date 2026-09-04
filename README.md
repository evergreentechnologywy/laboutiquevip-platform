# La Boutique VIP Platform

Production web app for [laboutiquevip.net](https://www.laboutiquevip.net): public directory, search, SEO, accounts, billing, and catalog ingest APIs.

## Runtime

- **Frontend:** Vite + React (`npm run dev`, `npm run build`)
- **Backend:** TypeScript API in `backend/` (`npm run build:backend`, `npm run start:backend`)

## Scripts

- `npm run dev` — frontend dev server
- `npm run build:backend` — compile backend
- `npm run test:backend` — compile + run backend tests
- `npm run start:backend` — run compiled API server
- `npm run db:generate` / `db:migrate:dev` / `db:migrate:deploy` — Prisma

## Catalog workers (external)

Scan, vet, scrape, and import **do not run in this repo**. Operators use **Aura** (calendar-coordinator); workers post via:

- `POST /api/v1/catalog/ingest`
- `POST /api/v1/integrations/aura/evergreen-sync`

See `docs/CATALOG_WORKER_BOUNDARY.md`.

## Environment

Use `.env.example` as the template. Do not commit secrets.

## Deployment

- `runbook.md` — production deploy and smoke checks
- `docs/hetzner-cloudflare-migration-2026-03-20.md` — migration reference


<!-- Security scan triggered at 2026-09-04 13:03:03 -->