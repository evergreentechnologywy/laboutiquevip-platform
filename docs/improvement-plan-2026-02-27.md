# Improvement Plan — 2026-02-27

## P0 (must complete before production)
1. Auth hardening
   - Eliminate blind trust of `x-user-id`/`x-roles` in production mode.
   - Add signed token verification path.
2. Webhook security baseline
   - Signature verification
   - Idempotency keys + unique event IDs
   - Immutable event persistence
3. Confirmo integration
   - invoice create + callback handling
   - paid-status entitlement grants
   - late payment handling
4. Didit integration
   - create verification session endpoint
   - webhook status updates as source of truth
5. Rate limiting
   - auth, contact relay, webhook routes
6. Deployment automation
   - build, migrate, up, smoke checks in `/srv/apps/trystlike/deploy/deploy.sh`

## P1 (high-value platform completion)
1. Admin moderation queue (reports, verifications, billing review)
2. SEO pages + sitemap + internal linking
3. Contact relay API (no full inbox)
4. Profile media upload pipeline (S3-compatible signed URLs)

## P2 (stability & scale)
1. Worker queue for webhook and async jobs
2. Search ranking enhancements (postgres FTS + ranking)
3. CI pipeline for typecheck/test/build/migrations

## Current sprint focus
- P0.1 Auth hardening
- P0.2 webhook framework
- P0.3 Didit + Confirmo handlers
