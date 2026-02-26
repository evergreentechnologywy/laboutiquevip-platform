# Audit Baseline (Phase 0)

## Objective
Define immutable, append-only audit trail behavior for security-sensitive and compliance-relevant actions.

## Scope
- AuthZ outcomes (allow/deny)
- Verification lifecycle events
- Invoice state transitions
- Admin moderation actions (reports, blocks)
- Entitlement grants/revocations

## Data Model
- `audit_events` is append-only.
- No update/delete API should be exposed for audit rows.
- Store actor, action, resource type/id, timestamp, request metadata, and payload hash.

## Implementation Status
- Utility scaffold added at `backend/src/utils/auditLogger.ts`.
- DB table included in Prisma schema and initial migration.
- Production sink and signature chain are deferred to later phases.

## Follow-up (Phase 1+)
- Add structured event taxonomy constants.
- Add tamper-evidence strategy (hash chaining or external write-once sink).
- Add SIEM forwarding connector and retention policy.
