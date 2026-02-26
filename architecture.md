# Phase 0 Architecture (Hybrid)

## Goal
Preserve the current Vite/Base44 frontend while introducing a production-ready backend foundation that can be expanded incrementally.

## Current State
- Frontend: Vite + React app in `src/`, currently functional and unchanged for runtime behavior.
- Data/API: Frontend-integrated Base44 patterns.

## Phase 0 Target State
- Frontend remains served by Vite build artifacts.
- New backend foundation under `backend/`:
  - TypeScript API skeleton (`backend/src`)
  - RBAC middleware stub
  - Immutable audit logging utility stub
  - Prisma schema and initial migration scaffold
- Deployment standardized through a single entrypoint script (`deploy/deploy.sh` in environment root).

## High-Level Topology
1. Client (browser) hits frontend static assets.
2. Frontend continues current behavior.
3. Backend endpoints start with `/api/health` and can be expanded for migration.
4. Prisma models define authoritative domain tables for migration off Base44 data paths.

## Security Baseline (Phase 0)
- Deny-by-default RBAC middleware.
- Audit events modeled and logging utility designed as append-only.
- No secrets committed; `.env.example` only provides placeholders.

## Migration Principle
- Strangler pattern:
  1. Keep UI stable.
  2. Add backend interfaces behind feature flags / route-by-route cutover.
  3. Migrate data entities incrementally.
  4. Decommission legacy data paths only after parity validation.
