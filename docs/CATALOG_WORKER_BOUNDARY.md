# Catalog worker boundary (LBV)

## Policy (owner 2026-08-15)

- **UltraGFE scrape is retired.** Do not import from ultragfe.
- **Allowed scrape sources:** `eros`, `tryst` only.
- **Separation:** Eros/Tryst scrapers are a **separate program** from laboutiquevip.net core.
- **Posting path:** scrapers publish through the LBV **catalog API**, not by writing the LBV DB from app code.
- **Owner session split:** LBV production session = APIs + product. Scan/scrape/match/import = Aura session.

## LBV core responsibilities

- Public directory, search, SEO, accounts, billing
- `POST /api/v1/catalog/ingest` — service/admin JWT upsert of catalog rows
- `GET /api/v1/catalog/sources` — allowed source list + boundary
- `GET|POST /api/v1/catalog/worker-status` — external worker heartbeats
- `POST /api/v1/integrations/aura/evergreen-sync` — Aura evergreen publish
- `GET /api/v1/integrations/aura/evergreen-status`
- Public visibility filter: `eros`, `tryst`, `evergreen` only (no ultragfe)
- Dev dashboard local triggers for `eros` / `tryst` / `orchestrator` return **410** (moved external)
- Local trigger still allowed: `evergreen` only

## Worker program responsibilities (Aura)

Home: `/root/calendar-coordinator/scripts/lbv-catalog/`

| Cron (America/Denver) | Script | Action |
|----------------------|--------|--------|
| 20:00 | `run-scan.sh` | Cache-only Eros+Tryst scan (no DB write) |
| 00:05 | `run-merge.sh` | Flush cache via `POST /api/v1/catalog/ingest` |
| 00:15 | `run-evergreen-daily.sh` | Evergreen sync API |

Thin kit also at `/srv/apps/lbv-catalog-workers`.

## Auth

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

Mint helper (LBV repo): `node scripts/mint-catalog-service-jwt.mjs`  
Aura client: `src/lbv-client.js` (`mintServiceJwt`, `ingestCatalogBatch`, `reportCatalogWorkerStatus`)

## Helpers in LBV repo

- `scripts/catalog-api-client.mjs` — post a JSON batch
- `scripts/flush-catalog-cache-via-api.mjs` — flush staged NDJSON via API (replaces direct-DB merge for production path)

## Install Aura crons

```bash
bash /root/calendar-coordinator/scripts/lbv-catalog/install-crons.sh
```

This removes legacy LBV host crons for `run-us-verified-catalog-scan` / `run-us-verified-catalog-merge` / `run-aura-calendar-lbv-daily`.
