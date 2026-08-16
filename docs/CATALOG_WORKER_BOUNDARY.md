# Catalog worker boundary (LBV)

## Policy

- **This repo is production-only.** It does not run scan, vet, scrape, crawl, cache-scan, catalog-merge, or import workers.
- **Operators use Aura** (calendar-coordinator dashboard). Hermes and Aura workers call LBV APIs.
- **UltraGFE scrape is retired.** Do not import from ultragfe.
- **Allowed catalog sources:** `eros`, `tryst` only (plus `evergreen` via the evergreen-sync API).
- **Posting path:** workers publish through LBV **catalog APIs**, not by writing the LBV database from scripts in this tree.

## LBV core responsibilities (keep in this repo)

- Public directory, search, SEO, accounts, billing, photos proxy
- `POST /api/v1/catalog/ingest` — service/admin JWT upsert of catalog rows
- `GET /api/v1/catalog/sources` — allowed source list + boundary
- `GET|POST /api/v1/catalog/worker-status` — external worker heartbeats
- `POST /api/v1/integrations/aura/evergreen-sync` — queue evergreen sync (202 Accepted)
- `GET /api/v1/integrations/aura/evergreen-status` — sync queue + catalog counts
- Public visibility filter: `eros`, `tryst`, `evergreen` only (no ultragfe)
- Dev dashboard manual import triggers return **410 Gone** for all sources

## Worker program (external — Aura / calendar-coordinator)

Home: `/root/calendar-coordinator/scripts/lbv-catalog/`  
Thin kit also at `/srv/apps/lbv-catalog-workers`.

| Cron (America/Denver) | Script | Action |
|----------------------|--------|--------|
| 20:00 | `run-scan.sh` | Cache-only Eros+Tryst scan (no LBV DB write) |
| 00:05 | `run-merge.sh` | Flush cache via `POST /api/v1/catalog/ingest` |
| 00:15 | `run-evergreen-daily.sh` | Evergreen sync via `POST /api/v1/integrations/aura/evergreen-sync` |

Install Aura crons:

```bash
bash /root/calendar-coordinator/scripts/lbv-catalog/install-crons.sh
```

**Do not** cron Eros/Tryst/Evergreen imports from this LBV repo. There are no `scripts/import-*`, `scripts/run-*`, or cron installers here.

## Auth — catalog ingest

```http
POST /api/v1/catalog/ingest
Authorization: Bearer <JWT sub=... role=service>
Content-Type: application/json

{
  "source": "eros",
  "dry_run": false,
  "providers": [
    {
      "display_name": "Example",
      "verification_url": "https://www.eros.com/...",
      "location_city": "Chicago",
      "location_state": "IL",
      "photos": ["https://..."]
    }
  ]
}
```

## Auth — evergreen sync

```http
POST /api/v1/integrations/aura/evergreen-sync
Authorization: Bearer <JWT role=service>
Content-Type: application/json

{ "syncAll": true }
```

Single model:

```json
{
  "model": "Sofia",
  "locationCity": "Denver",
  "locationState": "CO"
}
```

Returns **202 Accepted** with a `requestId`. Aura workers read `evergreen-sync-queue.json` on the LBV host (or poll status) and publish roster rows via `POST /api/v1/catalog/ingest`.

SiteConsole `sites.json` and calendar `model-profiles.json` are read **on Aura**, not on LBV production.

## Dev helpers (optional, not workers)

- `scripts/mint-catalog-service-jwt.mjs` — mint service JWT for API testing
- `scripts/catalog-api-client.mjs` — post a JSON batch to ingest

Aura client: `src/lbv-client.js` in calendar-coordinator (`mintServiceJwt`, `ingestCatalogBatch`, `reportCatalogWorkerStatus`).
