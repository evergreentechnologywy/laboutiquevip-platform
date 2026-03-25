# Overnight Progress

## Completed
- Added backend security baseline:
  - header auth trust is disabled by default and requires `ALLOW_HEADER_AUTH_TRUST=true`
  - response security headers and CORS allowlist support
  - in-memory rate limiting for auth/contact/webhook path families
- Added webhook infrastructure:
  - idempotency receipts via `webhook_event_receipts`
  - immutable invoice/verification event append helpers
  - raw payload + HMAC signature verification abstractions
- Added NOWPayments webhook scaffold:
  - signature verification
  - idempotent processing
  - invoice event persistence and paid entitlement grant flow
- Added Didit integration scaffold:
  - session creation endpoint contract
  - webhook status mapping into verification state/events
- Added admin APIs:
  - reports queue
  - verification review action endpoint
  - billing reconciliation read endpoint
  - audit event emission for each admin action
- Added SEO generation primitives:
  - city hub route data endpoint
  - profile route data endpoint
  - sitemap XML endpoint/generator stub
- Hardened repo deploy script execution order:
  - install -> backend build -> backend tests -> frontend build -> migrations -> smoke

## Remaining
- Replace placeholder provider contracts with real NOWPayments/Didit API field mappings.
- Move rate limiting and idempotency state from in-memory/DB-only baseline into distributed controls (Redis).
- Integrate frontend admin tooling with new moderation/reconciliation endpoints.

## Blockers
- Missing NOWPayments credentials and canonical webhook payload samples.
- Missing Didit API credentials/workflow ID and webhook signing contract confirmation.
- Cannot modify `/srv/apps/trystlike/deploy/deploy.sh` in this environment due sandbox permission denial.
