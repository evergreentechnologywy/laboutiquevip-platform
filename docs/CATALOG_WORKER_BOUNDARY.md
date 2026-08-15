# Catalog worker boundary (LBV)

## Policy (owner 2026-08-15)

- **UltraGFE scrape is retired.** Do not import from ultragfe.
- **Allowed scrape sources:** `eros`, `tryst` only.
- **Separation:** Eros/Tryst scrapers are a **separate program** from laboutiquevip.net core.
- **Posting path:** scrapers must publish through the LBV **catalog API**, not by editing LBV app code or writing the DB from inside the SPA/backend tree long-term.

## LBV core responsibilities

- Public directory, search, SEO, accounts, billing
- `POST /api/v1/catalog/ingest` — service/admin JWT upsert of catalog rows
- `GET /api/v1/catalog/sources` — allowed source list
- Public visibility filter: `eros`, `tryst`, `evergreen` only (no ultragfe)

## Worker program responsibilities

- Scrape Eros and/or Tryst only
- Normalize payload (name, city, state, photos, source URL)
- Authenticate with a **service-role JWT**
- `POST` batches to `/api/v1/catalog/ingest`
- Optional helper in this repo: `scripts/catalog-api-client.mjs` (API client only)

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
      "verification_url": "https://www.erosads.com/...",
      "location_city": "Chicago",
      "location_state": "IL",
      "photos": ["https://..."]
    }
  ]
}
```

Mint a service JWT with the same `JWT_SECRET` as LBV backend (`role: "service"`).

## Transitional note

In-repo `scripts/import-eros.mjs` / `import-tryst.mjs` may still exist for ops continuity.
New work must treat them as **workers that should call the catalog API**, not as part of the LBV product surface.
`import-ultragfe.mjs` exits non-zero permanently.
