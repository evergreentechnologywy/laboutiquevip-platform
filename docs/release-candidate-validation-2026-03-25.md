# LBV Release Candidate Validation - 2026-03-25

## Scope inspected

The uncommitted diff is materially complete in these areas:

- Public-provider visibility hardening in `backend/src/routes/base44Compat.ts`, `backend/src/routes/search.ts`, and `backend/src/routes/providerVisibility.ts`
- Provider/admin moderation state handling in `backend/src/routes/base44Compat.ts` plus the related frontend dashboard/signup/profile pages
- NOWPayments hard-cut migration in `backend/src/routes/orders.ts`, `backend/src/routes/webhookNowpayments.ts`, `backend/src/config/startup.ts`, and operator docs
- Reverse-proxy and origin connection settings in `deploy/nginx.conf` and `backend/src/server.ts`
- Frontend funnel cleanup for homepage, browse, view-profile, signup, and layout behavior

The main remaining work after inspection was validation, not feature completion.

## Automated checks run in this workspace

These checks were executed and passed on 2026-03-25:

- `npm run test:backend`
- `node --test src/lib/providerPayload.test.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Additional backend coverage added in this pass:

- Admin provider approval semantics stay intact
- Upload endpoint rejects unauthenticated requests
- `/api/health` remains static and `Cache-Control: no-store`
- NOWPayments startup/env gating, order session creation wiring, and webhook processing naming stay internally consistent

## Practical QA coverage achieved here

Validated automatically or handler-level in this environment:

- End-user/public:
  - Public provider reads stay scoped to approved active listings and exclude blocked test names
  - Public provider search keeps short cache headers and applies the same visibility guardrails
  - Homepage/browse/profile funnel code builds successfully with the new public-search integration
- Advertiser/provider:
  - Provider signup payload normalization is covered by `src/lib/providerPayload.test.mjs`
  - Provider owners can self-preview non-public listings by id
  - Provider owners can pause approved listings but cannot pause unapproved listings
  - Unauthenticated uploads are rejected
- Administrator:
  - Admin approval updates can set moderation fields (`status`, `is_verified`, `is_profile_approved`, `admin_notes`) without stripping retained provider data

## Environment limits during QA

Two live checks could not be completed inside this sandbox:

- Local live browser QA was blocked because opening a listening socket failed with `listen EPERM` when starting the backend on `0.0.0.0:8787`
- Local DB-backed live QA was blocked because Prisma could not reach `localhost:5432`

Because of those limits, no claim is made here that full browser flows or live DB interactions were exercised in this workspace.

## NOWPayments contract assumptions used in this repo

- Hosted invoice creation is assumed to be `POST ${NOWPAYMENTS_API_BASE_URL}/invoice` using `x-api-key: ${NOWPAYMENTS_API_KEY}`.
- Hosted payment URLs are assumed to be returned in `invoice_url`, `payment_url`, or `url`.
- Webhook verification is assumed to be raw-body HMAC-SHA256 hex in `x-nowpayments-signature` unless `NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER` overrides it.

## Concurrency / live-connection characterization

What is implemented and verified by inspection:

- Node origin now sets `keepAliveTimeout=65000`, `headersTimeout=66000`, `requestTimeout=30000`, and `maxRequestsPerSocket=1000`
- Nginx now sets `keepalive_timeout 65`, `keepalive_requests 1000`, enables buffered proxying for `/api/`, and adds a cached path for `/api/v1/search/providers`
- Public provider search returns `Cache-Control: public, max-age=30, s-maxage=30, stale-while-revalidate=120`
- `/api/health` returns `Cache-Control: no-store`

What is still not characterized by measurement in this workspace:

- Sustained concurrent search throughput against a real Postgres-backed dataset
- End-to-end socket reuse behavior through the final production proxy chain
- DB pool saturation and tail latency under read bursts

For reproducible characterization on a deploy-capable host, use:

- `scripts/lbv-characterize-concurrency.sh <base-url> [connections] [duration-seconds]`

Recommended first run:

- `scripts/lbv-characterize-concurrency.sh http://127.0.0.1:8787 25 30`

This should be run only where the backend can listen and the configured database is reachable.
