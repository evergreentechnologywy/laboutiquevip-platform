# architecture.md

## Inspiration References (live)
- tryst.link: profile-first discovery, tour dates affecting location visibility, category/location pages.
- eros.com: city/category-led discovery, dense listing cards, strong internal linking.

## Platform shape
- Web: Next.js 15 (App Router, SSR)
- DB: PostgreSQL + Prisma
- Cache/Queue: Redis + BullMQ worker
- Media: S3-compatible (signed URL uploads)
- Deployment: Docker Compose via `/srv/apps/trystlike/deploy/deploy.sh` only

## Security non-negotiables
- Verify webhook signatures before processing.
- Immutable webhook event storage (`invoice_events`, `verification_events`).
- Idempotency unique constraints for inbound webhooks.
- RBAC + admin audit events for all moderation actions.
- Rate limiting for auth, relay, and webhook endpoints.

## Required domain tables
Implemented in phase-0 schema scaffold:
- users, profiles, profile_photos, profile_tours, tags, profile_tags
- verifications, verification_events
- products, orders, invoices, invoice_events, entitlements
- reports, blocks, audit_events
