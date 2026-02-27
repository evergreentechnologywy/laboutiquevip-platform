# Platform Architecture (Migration in Progress)

## Objective
Build a production-grade escort/directory platform (Tryst-inspired) while incrementally replacing Base44-era coupling.

## Runtime topology (target)
1. **Frontend**: Next.js (SSR/SEO pages)
2. **API**: TypeScript service with Prisma + PostgreSQL
3. **Cache/limits**: Redis
4. **Async jobs**: Worker container (BullMQ-equivalent)
5. **Media**: S3-compatible object storage (signed URLs)
6. **Edge**: Nginx + TLS (Let’s Encrypt)
7. **Deploy**: Docker Compose, invoked only via `/srv/apps/trystlike/deploy/deploy.sh`

## Current reality
- Frontend is still Vite/Base44 export.
- Backend scaffold now includes:
  - production-safe auth header trust guard (`ALLOW_HEADER_AUTH_TRUST`)
  - security headers + CORS allowlist + in-memory endpoint/IP rate limiting
  - webhook idempotency receipts and immutable invoice/verification event append helpers
  - Confirmo webhook scaffold with entitlement grant flow
  - Didit verification session + webhook status mapping scaffold
  - admin moderation/reconciliation read APIs with audit events
  - SEO route generation and sitemap XML backend stub endpoints
- Deployment script in repo is hardened with build/test/migrate/smoke ordering.

## Core bounded contexts
- Identity & Auth
- Provider Profiles / Tours / Availability
- Discovery & SEO (city hubs, profile pages, sitemap)
- Payments (Confirmo)
- Verification (Didit)
- Moderation (reports, blocks, verification review)
- Audit & Compliance

## Security principles
- Never trust client-side payment or verification state.
- Webhooks are source-of-truth for external providers.
- Enforce idempotency for all webhook events.
- Persist raw webhook events immutably for forensics.
- Deny-by-default RBAC and full admin action auditing.
- Rate-limit auth, contact relay, and webhook endpoints.

## Migration strategy
- Strangler pattern: preserve working UX where useful, move backend authority first.
- Replace Base44-integrated APIs route-by-route.
- Maintain schema compatibility with non-destructive migrations.

## Immediate priorities
1. Wire real Confirmo credentials + event field mapping validation
2. Wire real Didit credentials + session API callout
3. Move rate limiting/idempotency state to Redis for multi-instance production
4. Frontend integration for admin workflows and SEO route consumers
5. Promote webhook workers/outbox to async queue processing
