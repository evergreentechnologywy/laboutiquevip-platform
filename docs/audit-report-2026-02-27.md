# Audit Report — 2026-02-27

## Scope
Repository: `/srv/apps/trystlike/repo`
Domain target: `laboutiquevip.net`

## Executive Summary
Current repo is a hybrid migration scaffold (Base44 frontend + TypeScript/Prisma backend). It is **not production-ready** yet. Core backend tables exist, but security-critical controls and major product flows are incomplete.

## What exists today
- Vite React frontend from Base44 export (`src/`)
- TypeScript backend scaffold (`backend/src`)
- Prisma schema with many target entities already present:
  - users, profiles, profile_photos, profile_tours, tags, profile_tags
  - verifications, verification_events
  - products, orders, invoices, invoice_events, entitlements
  - reports, blocks, audit_events
- Provider APIs: register/profile/calendar/tours/search
- Basic RBAC middleware and audit logger utility

## Critical gaps
1. Authentication is header-trust based (`x-user-id`, `x-roles`) and can be spoofed.
2. No webhook ingestion for payments (Confirmo) or verification (Didit).
3. No webhook idempotency and immutable event processing guarantees.
4. No rate limiting middleware.
5. No admin moderation UI/API for reports, verification review, billing reconciliation.
6. Frontend still coupled to Base44 patterns; no Next.js SSR migration yet.
7. Deploy script is placeholder (does not execute build/migrate/smoke pipeline).

## Product parity gaps vs tryst-like target
- Public SEO city pages and sitemap generation missing.
- Verification status and billing status UX incomplete.
- Report/flag UX and moderation queue missing.
- Contact relay flow not implemented.

## Security risk assessment
- **Critical:** auth bypass risk due to trusted headers.
- **High:** missing signature verification/idempotency for webhooks.
- **High:** missing rate limiting on auth/contact/webhook endpoints.
- **Medium:** audit writes can degrade silently if DB unavailable.

## Immediate implementation order
1. Replace/guard header-trust auth (token-based context).
2. Add webhook framework (raw capture + signature verify + idempotent store).
3. Implement Confirmo webhook handler + entitlement grants.
4. Implement Didit verification session + webhook source-of-truth updates.
5. Build admin moderation/review APIs + UI.
6. Add SEO city/profile sitemap generation.
7. Harden deployment script + smoke tests.
