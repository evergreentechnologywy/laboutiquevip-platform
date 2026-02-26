# Migration Phase Plan

## Phase 0 (This Change)
- Preserve current Vite/Base44 frontend.
- Add backend foundation with TypeScript server skeleton.
- Add Prisma schema and initial migration scaffold.
- Add RBAC middleware and audit logger stubs.
- Add deployment single entrypoint script.

## Phase 1
- Introduce auth/session boundary in backend.
- Implement users/profiles read APIs with parity checks.
- Start dual-read observability for key entities.

## Phase 2
- Move write paths for selected domains:
  - reports, blocks, verification events
- Enable strict RBAC policies for admin/provider/member roles.

## Phase 3
- Migrate commerce flows:
  - products, orders, invoices, entitlements
- Add webhooks/async workers for billing state transitions.

## Phase 4
- Final cutover from Base44-integrated data dependencies.
- Remove deprecated client-side data paths.
- Harden compliance and operational controls.

## Exit Criteria
- Functional parity validated on critical user journeys.
- Database migrations automated in deployment.
- Security controls (RBAC + audit) enforced server-side.
