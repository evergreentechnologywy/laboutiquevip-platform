# Deployment Report - laboutiquevip.net

Date (UTC): 2026-03-04

## Completed
- Installed PostgreSQL 16 and Redis 7 via apt.
- Created PostgreSQL app role/database:
  - DB: `trystlike`
  - User: `trystlike_app`
  - Password: generated securely and written to `/srv/apps/trystlike/repo/.env`.
- Created/updated production env file at `/srv/apps/trystlike/repo/.env` with required keys:
  - `NODE_ENV`, `DATABASE_URL`, `PUBLIC_BASE_URL`, `CORS_ALLOWLIST`
  - `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`
  - `CONFIRMO_WEBHOOK_SECRET` (mirrors `NOWPAYMENTS_IPN_SECRET` for compatibility)
  - `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`
- Updated deploy script to:
  - accept `NOWPAYMENTS_IPN_SECRET` as fallback for `CONFIRMO_WEBHOOK_SECRET`
  - install dev deps reliably in production deploy
  - pin Prisma CLI to `6.16.0` for schema compatibility
  - run `prisma generate` before smoke check
- Fixed backend Prisma runtime import path for compiled output (`backend/src/db/prisma.ts`).
- Successfully ran deploy script:
  - `source /srv/apps/trystlike/repo/.env && bash /srv/apps/trystlike/deploy/deploy.sh`
  - result: success, smoke check passed.
- Created backend systemd unit:
  - repo file: `deploy/laboutiquevip-backend.service`
  - installed: `/etc/systemd/system/laboutiquevip-backend.service`
  - enabled/started: `active (running)`
- Created nginx target config in repo:
  - `deploy/nginx.conf` (includes HTTPS + redirect + `/api/` proxy)
- Installed/enabled nginx site with currently-valid HTTP config:
  - `/etc/nginx/sites-available/laboutiquevip.net`
  - symlinked in `sites-enabled`, default site removed
  - nginx config test OK and reloaded
- Local verification on this VPS:
  - `http://127.0.0.1/` with Host header `www.laboutiquevip.net` serves new frontend
  - `http://127.0.0.1/api/health` with Host header returns 200

## Blocking Issue (External DNS / TLS)
- Let's Encrypt issuance failed for both domains with CA `unauthorized`.
- ACME challenge responses resolved to old Base44-hosted content (not this VPS), indicating DNS/traffic for `laboutiquevip.net` and `www.laboutiquevip.net` is not pointing to this server (or still proxied elsewhere).
- Because of this, HTTPS cutover on this VPS cannot be finalized yet.

## Required Final Step After DNS Cutover
1. Point `A/AAAA` records for both domains to this VPS IP.
2. Re-run:
   - `certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email -d www.laboutiquevip.net -d laboutiquevip.net`
3. Replace installed nginx site with `/srv/apps/trystlike/repo/deploy/nginx.conf` (HTTPS config) and reload nginx.
4. Verify externally:
   - `https://www.laboutiquevip.net/`
   - `https://www.laboutiquevip.net/api/health`
