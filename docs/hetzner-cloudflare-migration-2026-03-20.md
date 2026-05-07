# Hetzner + Cloudflare Migration Guide

Date (UTC): 2026-03-20
Target domain: `laboutiquevip.net` / `www.laboutiquevip.net`

## Purpose

This document prepares the repo for moving production from the current Hostinger setup to a Hetzner VPS with Cloudflare in front. It is additive only: existing deployment paths remain in place until cutover is complete.

## Audit summary

### Current repo deployment assumptions

- Frontend is built with Vite and served as static files from `dist/`.
- Nginx serves the frontend and proxies `/api/` to the backend on `127.0.0.1:8787` (`deploy/nginx.conf`).
- The backend is a Node service started by systemd (`deploy/laboutiquevip-backend.service`).
- Production startup requires `DATABASE_URL`, `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, `DIDIT_*`, `CORS_ALLOWLIST`, and `PUBLIC_BASE_URL` (`backend/src/config/startup.ts`).
- The deploy script builds the frontend/backend, runs backend tests, applies Prisma migrations, and performs a local `/api/health` smoke check (`deploy/deploy.sh`).
- Admin IP allowlisting and app rate limiting depend on the resolved client IP (`backend/src/server.ts`, `backend/src/config/security.ts`, `backend/src/middleware/rateLimit.ts`).

### Important app caveat for Cloudflare

The backend currently resolves the client IP from `X-Forwarded-For` before falling back to the socket remote address. That is acceptable only when the origin is reachable solely through a trusted reverse proxy. If the Hetzner origin remains directly reachable from the Internet, spoofed forwarded headers could weaken:

- admin IP allowlisting
- per-IP rate limiting
- audit log accuracy for source IPs

For this migration, origin lock-down and nginx real-IP handling are not optional.

## Recommended target topology

### DNS and edge

- Cloudflare becomes the public DNS and reverse proxy for both `laboutiquevip.net` and `www.laboutiquevip.net`.
- Keep `www.laboutiquevip.net` as the canonical public origin because the repo already uses it in `PUBLIC_BASE_URL`, `.env.example`, and nginx redirects.
- Proxy both apex and `www` through Cloudflare (orange-cloud), then redirect apex to `https://www.laboutiquevip.net`.

### Origin

- Single Hetzner VPS runs:
  - nginx on `80/443`
  - frontend static files from `/srv/apps/trystlike/repo/dist`
  - backend Node service on `127.0.0.1:8787`
  - PostgreSQL on the same host or private network only
- Do not expose the backend port publicly.

### TLS

- Recommended Cloudflare SSL mode: `Full (strict)`.
- Recommended origin certificate approach for the VPS behind Cloudflare:
  - easiest: Cloudflare Origin CA certificate installed on nginx
  - acceptable: publicly trusted certificate on the origin if you want direct-origin HTTPS validation outside Cloudflare
- Avoid `Flexible` mode. It weakens transport guarantees and creates redirect/origin ambiguity.

## Cloudflare recommendations

### Proxying

- Proxy the public web hostnames through Cloudflare.
- Keep any non-HTTP infrastructure records unproxied if they exist later, but do not place the app/API on DNS-only records during normal operation.

### SSL/TLS

- Use `Full (strict)`.
- Enable `Always Use HTTPS`.
- Enable automatic HTTPS rewrites only if needed; it is optional for this app.
- If you use Cloudflare Origin CA, document the certificate path in the server build notes and renewal process because it differs from the current Let's Encrypt assumption in `deploy/nginx.conf`.

### Caching

- Cache static frontend assets aggressively at Cloudflare.
- Do not cache dynamic routes:
  - `/api/*`
  - `/uploads/*`
  - `/sitemap.xml`
  - `/api/v1/seo/*`
  - any admin UI path if one is later exposed separately
- Keep API responses controlled by origin headers and add explicit Cloudflare cache bypass rules for `/api/*`.
- Be careful with any route that sets cookies or personalized content; default to bypass.

### WAF and rate limiting

- Enable Cloudflare WAF managed rules.
- Add Cloudflare rate limits for high-risk public paths:
  - `/api/auth/login`
  - `/api/auth/register`
  - `/api/upload`
  - `/api/admin/*`
- Do not apply browser challenges to webhook endpoints because provider callbacks are non-browser traffic:
  - `/api/v1/webhooks/nowpayments`
  - `/api/v1/webhooks/didit`
- For webhooks, prefer WAF allow/skip rules scoped narrowly to the exact paths if Cloudflare managed rules create false positives. The application already validates signatures and schema.

### API and admin caveats

- `/api/admin/*` already has RBAC, app rate limiting, and optional IP allowlisting. Keep those controls at the app layer even if Cloudflare adds WAF/rate limits.
- If staff administration is limited to a small team, consider putting the admin frontend path behind Cloudflare Access later. That is additive hardening, not required for the initial migration.
- Preserve webhook reachability during cutover. If you lock the origin to Cloudflare IPs, webhook providers must continue targeting the public proxied hostname, not a raw server IP.

### Origin lock-down

- Restrict the Hetzner firewall and/or host firewall so `80/443` accept traffic only from Cloudflare IP ranges, unless you intentionally need direct origin access during cutover.
- Restrict `22` to explicit admin IPs.
- Never expose `8787`.
- If you need temporary direct-origin validation, keep it short-lived and remove it after cutover.

### Real IP handling

- Configure nginx to trust Cloudflare proxy IP ranges and rewrite the client IP from `CF-Connecting-IP`.
- Continue forwarding `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` to the backend after nginx restores the real client IP.
- Without this step, app controls that depend on client IP will be unreliable behind Cloudflare.

## Required nginx changes for the move

These should be applied on the Hetzner origin configuration during migration, not by changing the repo blindly before cutover:

1. Replace the current direct-public-certificate assumption with either:
   - Cloudflare Origin CA certificate paths, or
   - the final Let's Encrypt certificate paths if you keep public certs on origin.
2. Add Cloudflare real-IP settings, for example:

```nginx
real_ip_header CF-Connecting-IP;
real_ip_recursive on;

# Add all published Cloudflare IPv4/IPv6 proxy ranges here.
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
```

3. Keep the backend upstream private:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

4. Consider adding explicit cache-control headers for immutable built assets if they are not already emitted by the current static setup.

## Required environment and app changes

### Environment

- Keep `PUBLIC_BASE_URL=https://www.laboutiquevip.net`.
- Keep `VITE_APP_API_URL=https://www.laboutiquevip.net/api`.
- Keep `CORS_ALLOWLIST` aligned to the real public origins. During migration, include both `https://www.laboutiquevip.net` and `https://laboutiquevip.net` only if both origins will actually be used by browsers.
- Keep webhook secrets unchanged unless the providers are rotated.

### App/runtime

- No repo code change is strictly required for the migration if nginx is configured to restore the real visitor IP and the origin is locked to Cloudflare.
- If direct origin access must remain available for any reason, the backend should be hardened later so it trusts forwarded IP headers only from known proxies. That is not implemented in the current codebase.

### Service/runtime hardening worth tracking

- The systemd unit currently runs the backend as `root`. That is not required for the Hetzner move, but it should be reduced to a dedicated app user in a follow-up hardening pass.

## Suggested migration checklist

1. Provision Hetzner VPS and install nginx, Node.js 22+, PostgreSQL, and required system packages.
2. Copy production env vars and verify `PUBLIC_BASE_URL`, `VITE_APP_API_URL`, and `CORS_ALLOWLIST`.
3. Deploy the repo and run the existing deploy flow.
4. Install nginx with the final origin certificate strategy.
5. Add Cloudflare real-IP directives and firewall restrictions for Cloudflare proxy ranges.
6. In Cloudflare:
   - proxy apex and `www`
   - set SSL mode to `Full (strict)`
   - enable WAF managed rules
   - add cache bypass for `/api/*`
   - add rate limits for login/register/upload/admin
7. Cut DNS to the Hetzner origin.
8. Verify:
   - `https://www.laboutiquevip.net/`
   - `https://www.laboutiquevip.net/api/health`
   - login/signup flows
   - admin access from allowed IPs
   - webhook delivery for NOWPayments and Didit
   - frontend asset cache behavior
9. Remove any temporary direct-origin access that was used during migration.

## Remaining risks after this repo-only preparation

- The repo still contains Hostinger-specific wording in some historical docs/scripts; that does not block migration but operators should treat this document as the current migration reference.
- `deploy/nginx.conf` is still written for direct-public TLS on origin and does not yet include Cloudflare real-IP directives.
- The backend's trust model for forwarded IP headers still assumes a trusted proxy path to origin.

## Cloudflare reference links

- SSL modes: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/
- Cloudflare HTTP headers including `CF-Connecting-IP`: https://developers.cloudflare.com/fundamentals/reference/http-headers/
- Restoring original visitor IPs: https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/
- Authenticated Origin Pulls: https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/
- Cache behavior and bypass concepts: https://developers.cloudflare.com/cache/concepts/cache-responses/
- WAF managed rules: https://developers.cloudflare.com/waf/managed-rules/
- Rate limiting rules: https://developers.cloudflare.com/waf/rate-limiting-rules/
