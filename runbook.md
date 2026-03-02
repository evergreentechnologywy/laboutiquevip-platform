# Production Runbook (laboutiquevip)

Canonical production host: **Hostinger**  
Canonical domain: **https://www.laboutiquevip.net**

## Prerequisites
- Node.js 22+
- npm 10+
- PostgreSQL 15+
- Production env file with all required secrets

## Required environment variables (production)
- `NODE_ENV=production`
- `DATABASE_URL`
- `PUBLIC_BASE_URL=https://www.laboutiquevip.net`
- `CORS_ALLOWLIST` (explicit list, include canonical domain)
- `CONFIRMO_WEBHOOK_SECRET`
- `CONFIRMO_WEBHOOK_SIGNATURE_HEADER` (optional override)
- `DIDIT_API_KEY`
- `DIDIT_WORKFLOW_ID`
- `DIDIT_WEBHOOK_SECRET`
- `DIDIT_WEBHOOK_SIGNATURE_HEADER` (optional override)
- `DIDIT_WEBHOOK_TIMESTAMP_HEADER` (optional override)
- `ADMIN_IP_ALLOWLIST` (optional, comma-separated IPs)

## Deploy steps
1. Ensure env vars/secrets are exported in shell/service context.
2. Run:
   - `/srv/apps/trystlike/deploy/deploy.sh`
3. Script order (enforced):
   - `npm ci`
   - `npm run build:backend`
   - `npm run test:backend`
   - `npm run build`
   - `npm run db:migrate:deploy`
   - backend smoke check (`GET /api/health`)

## Live test checklist
1. **Health**
   - `GET /api/health` returns `200`.
2. **Webhook security**
   - Invalid signatures for Confirmo/Didit return `401`.
   - Invalid payload schema returns `400 validation_error`.
   - Duplicate delivery returns `{ deduplicated: true }`.
3. **NOWPayments policy behavior (Confirmo ingestion path)**
   - `confirmed` or `finished` webhook => invoice paid + entitlement granted.
   - `partially_paid` => invoice `pending_manual`, no entitlement granted.
   - `paid` event after invoice expiry => entitlement still granted.
4. **Verification flow**
   - Didit session creation fails in production if Didit credentials are missing.
   - Didit webhook updates verification status (`approved` / `rejected` / `under_review` / `pending`).
5. **Admin protection**
   - Non-admin role denied on `/api/admin/*`.
   - Admin requests are rate-limited.
   - If `ADMIN_IP_ALLOWLIST` is set, non-allowlisted IPs get `403`.
6. **Data integrity & audit**
   - Webhook receipts are idempotent per event key.
   - Audit events created for webhook processed/rejected and admin denials.

## Rollback
- Revert application release to prior known-good build.
- Restore DB from backup/snapshot if required.
- Re-run smoke + live test checklist before reopening traffic.
