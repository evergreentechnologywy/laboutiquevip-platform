# Trystlike Platform Audit Summary (Initial)

Date: 2026-02-24 UTC
Scope: `/srv/apps/trystlike/repo` (newly created; no legacy code present)

## Reality Check
- The repository was empty at audit time (only `.git/`).
- No existing application code was found to preserve or refactor.
- Therefore, this is a greenfield bootstrap with strict constraints for production-hardening from day 1.

## Baseline Findings
- ✅ Filesystem created:
  - `/srv/apps/trystlike/repo`
  - `/srv/apps/trystlike/deploy`
  - `/srv/apps/trystlike/secrets` (untouched)
- ❌ Missing required platform components:
  - Next.js app
  - Prisma schema/migrations
  - API/webhook handlers
  - worker/queue pipeline
  - admin moderation UI
  - SEO pages/generators
  - deployment script in `deploy/deploy.sh`
  - runbook + architecture docs

## Gap vs Target Product
Current: empty repo
Target: production-grade Tryst-like directory platform with:
- Public discovery/search/profile/tour SEO pages
- Auth + profile publishing workflow
- Confirmo billing integration
- iDenfy verification integration
- Admin moderation/reporting/audit tooling
- Security controls (idempotent webhooks, RBAC, audit immutability, rate limits)

Gap: 100% implementation gap.

## Prioritized Improvement Plan
1. Bootstrap architecture + docs (`architecture.md`, `runbook.md`, `.env.example`).
2. Initialize Next.js (TS, App Router), Prisma, Postgres models, Redis, worker scaffolding.
3. Implement auth + RBAC + profile domain (draft/publish flow).
4. Implement Confirmo invoices + webhook source-of-truth + entitlements.
5. Implement iDenfy session lifecycle + webhook source-of-truth.
6. Build admin moderation queues + immutable audit trail.
7. Build SEO city/tour generators + sitemap + internal linking.
8. Add tests (unit/integration/webhook idempotency) and hardening.
9. Deploy exclusively via `/srv/apps/trystlike/deploy/deploy.sh`.

## Risk/Security Assessment
### Critical risks if built incorrectly
- Webhook forgery/replay without signature verification + idempotency keys.
- Privilege escalation without strict RBAC and admin route protection.
- Financial inconsistency if entitlements trust frontend state.
- Legal/compliance risk if verification workflow is not source-of-truth via webhook events.
- Data/privacy risk if secrets leak into repo/logs/tests.

### Non-negotiable controls
- Immutable `*_events` storage for Confirmo + iDenfy webhooks.
- Verified callback/signature handling with replay protection.
- Redis-backed rate limiting (auth, relay, webhook endpoints).
- Append-only admin audit events for every admin action.
- Strictly no secrets under repo; secrets only from env/system.

## Architecture Checkpoint (Claude Code)
A Claude Code architectural review was run and aligned with:
- Next.js (TS, SSR/App Router)
- Prisma + PostgreSQL
- Redis + BullMQ worker
- S3-compatible media storage
- Security-first webhook and admin architecture

(Implementation begins only after this checkpoint.)
