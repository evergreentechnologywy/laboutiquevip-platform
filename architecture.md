# Platform Architecture

## Objective
Build and operate a production-grade escort/directory platform for **www.laboutiquevip.net** on **Hostinger** with secure backend authority for billing, verification, moderation, and SEO.

## Public directory vs authenticated app

The product splits into two surfaces that share one database and API but differ in routing, auth, and rendering.

### Public directory (cacheable, no Clerk on first paint)

| Route | Job |
| ----- | --- |
| `/` | Marketing homepage; stats from published catalog API |
| `/city/{city-slug}` | Geographic city hub only (SSR HTML + SPA browse) |
| `/profile/{profile-slug}` | Single published listing (SSR HTML + SPA detail) |
| `/browse`, `/states`, `/states/{state}` | Directory navigation (SPA) |
| `/sitemap.xml`, `/robots.txt` | SEO artifacts from published catalog |

**Rendering:** Nginx proxies `/city/*` and `/profile/*` to the Node backend, which returns server-rendered HTML with real titles, meta, and listing summaries. Crawlers and first paint never receive the empty Vite shell. The SPA still handles interactive browse after load.

### Authenticated app (Clerk)

Login/register, provider dashboard, admin, AI concierge, booking, payments, and ops tooling (`/devdashboard`). Clerk session is required for these flows. Dev/admin routes are disallowed in `robots.txt` and lazy-loaded in the frontend bundle.

## URL scheme and redirects

- **City pages** use canonical US city slugs derived from `location_city` via `canonicalizePublicCity` (junk bio fragments and listing titles are rejected).
- **Profile pages** use `legacyProviderSlug` / model `slug` under `/profile/`.
- **Permanent redirects:** `GET /city/{listing-slug}` → `301 /profile/{slug}` when the slug matches a published profile but not a real city hub.

Optional later: `/us/{state}/{city}` if state browse IA expands; listings never live under `/city/`.

## Published catalog

Single source of truth in `backend/src/lib/publishedCatalog.ts`:

- Loads **Provider** rows passing `publicProviderVisibilityWhere` + public photo filter, plus published `ProviderProfile` rows.
- Builds **City** records (canonical geography only) and **Profile** records (listing slugs).
- Exposes stats: `providers`, `cities`, `states`, `photos`.

Consumers (must stay aligned):

| Consumer | Endpoint / artifact |
| -------- | ------------------- |
| Homepage stats | `GET /api/v1/stats` |
| Sitemap | `GET /sitemap.xml` |
| SEO APIs | `GET /api/v1/seo/city-hubs`, `/api/v1/seo/profiles` |
| SSR pages | `GET /city/:slug`, `GET /profile/:slug` |

No hardcoded marketing counts; UI reads `/api/v1/stats` which mirrors sitemap cardinality.

## Runtime topology (target)

1. **Public SPA** — Vite build in `dist/` (interactive directory + app)
2. **API + public SSR** — TypeScript service + Prisma + PostgreSQL (`backend/`, port 8787)
3. **Cache/limits** — Redis (planned)
4. **Async jobs** — worker queue (planned)
5. **Media** — S3-compatible object storage
6. **Edge** — Nginx + TLS (`deploy/laboutiquevip.nginx.conf`)
7. **Deploy orchestration** — `/srv/apps/trystlike/deploy/deploy.sh`

Nginx routing highlights:

- `/api/*`, `/sitemap.xml`, `/robots.txt`, `/city/*`, `/profile/*` → backend
- `/assets/*` and hashed static files → `dist/` with long cache
- Other paths → SPA `index.html` shell

## Current backend capabilities

- Header-auth trust guard (`ALLOW_HEADER_AUTH_TRUST`)
- Security headers + CORS allowlist + endpoint/IP rate limiting
- Webhook idempotency receipts + immutable invoice/verification event append
- NOWPayments webhook ingestion with entitlement policy enforcement
- Didit verification session + webhook-driven status updates
- Admin moderation/reconciliation APIs with audit events
- Public directory SSR, published catalog, sitemap, and legacy `/city` redirects

## Core bounded contexts

- Identity & Auth (Clerk + legacy session)
- Provider Profiles / Tours / Availability
- Discovery & SEO (published catalog)
- Payments (NOWPayments)
- Verification (Didit)
- Moderation (reports, blocks, verification review)
- Audit & Compliance

## Security principles

- Never trust client-side payment or verification state.
- Webhooks are source-of-truth for external providers.
- Strict schema validation for inbound webhook payloads.
- Enforce idempotency for all webhook events.
- Persist raw webhook events immutably for forensics.
- Deny-by-default RBAC and full admin action auditing.
- Rate-limit auth, contact relay, webhook, and admin endpoints.
- Optional IP allowlist enforcement for admin routes.

## Immediate priorities

1. Move rate limiting/idempotency state to Redis for multi-instance production.
2. Wire Didit session creation to live provider API request/response contracts.
3. Promote webhook workers/outbox to async queue processing.
4. Optional: separate Vite entry for authenticated app to keep admin chunks off public landing traffic.

## Verification (local)

```bash
npm run build:backend
npm run test:backend
npm run start:backend
curl -sS http://127.0.0.1:8787/city/akron | head
curl -sS http://127.0.0.1:8787/sitemap.xml | head
curl -sS http://127.0.0.1:8787/api/v1/stats
```

After deploy, confirm nginx proxies `/city/` and `/profile/` to the backend (see `deploy/laboutiquevip.nginx.conf`).
