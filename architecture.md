# Platform Architecture

## Objective
Build and operate a production-grade escort/directory platform for **www.laboutiquevip.net** on **Hostinger** with secure backend authority for billing, verification, moderation, and SEO.

## Runtime topology (target)
1. Frontend application
2. API: TypeScript service + Prisma + PostgreSQL
3. Cache/limits: Redis (planned)
4. Async jobs: worker queue (planned)
5. Media: S3-compatible object storage
6. Edge: Nginx + TLS
7. Deploy orchestration: `/srv/apps/trystlike/deploy/deploy.sh`

## Current backend capabilities
- Header-auth trust guard (`ALLOW_HEADER_AUTH_TRUST`)
- Security headers + CORS allowlist + endpoint/IP rate limiting
- Webhook idempotency receipts + immutable invoice/verification event append
- Confirmo/NOWPayments webhook ingestion with entitlement policy enforcement
- Didit verification session + webhook-driven status updates
- Admin moderation/reconciliation APIs with audit events
- SEO route + sitemap endpoint stubs

## Core bounded contexts
- Identity & Auth
- Provider Profiles / Tours / Availability
- Discovery & SEO
- Payments (Confirmo/NOWPayments)
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
4. Complete frontend integration for admin workflows and SEO route consumers.
