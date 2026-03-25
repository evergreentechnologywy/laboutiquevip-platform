# Reliability Deploy Note — 2026-03-20

## Commit

- Git commit: `419bd64`
- Message: `feat: add reliability monitoring and payment email hooks`

## What was added

### Backend observability
- Sentry-ready backend initialization in `backend/src/observability.ts`
- Global capture for:
  - uncaught exceptions
  - unhandled promise rejections
  - request-level route failures in `backend/src/server.ts`

### Frontend observability
- Sentry-ready frontend initialization in `src/lib/observability.js`
- App-wide error boundary in `src/components/AppErrorBoundary.jsx`
- Error boundary wired into `src/App.jsx`

### Payment/email reliability
- Transactional email service in `backend/src/services/email.ts`
- Payment-link email hook from `backend/src/routes/orders.ts`
- Payment-confirmed / payment-needs-review email hooks from `backend/src/routes/webhookNowpayments.ts`
- Existing webhook idempotency remains based on `WebhookEventReceipt` + immutable invoice events

## Required environment variables

### Frontend
- `VITE_SENTRY_DSN`
- `VITE_SENTRY_ENVIRONMENT`
- `VITE_SENTRY_RELEASE`
- `VITE_SENTRY_TRACES_SAMPLE_RATE`

### Backend
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

### Existing crypto/webhook variables still required
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_API_BASE_URL` (optional override)
- `NOWPAYMENTS_WEBHOOK_SECRET`
- `NOWPAYMENTS_WEBHOOK_SIGNATURE_HEADER`

## Post-deploy verification checklist

### Observability
- [ ] Backend deployed with `SENTRY_DSN`
- [ ] Frontend deployed with `VITE_SENTRY_DSN`
- [ ] Trigger one controlled backend exception and confirm it appears in Sentry
- [ ] Trigger one controlled frontend exception and confirm it appears in Sentry

### Email
- [ ] `RESEND_API_KEY` configured
- [ ] `RESEND_FROM_EMAIL` configured with verified sending domain/address
- [ ] Create one safe test payment request and confirm payment-link email delivery
- [ ] Simulate or process one safe confirmed payment event and confirm payment confirmation email delivery

### Crypto payment flow
- [ ] Confirm invoice creation still returns a payment URL
- [ ] Confirm webhook processing still updates invoice status correctly
- [ ] Confirm webhook retries do not double-process due to receipt dedupe

### NOWPayments contract assumptions
- [ ] Confirm the live API still accepts `POST /invoice` with `x-api-key`
- [ ] Confirm hosted invoice URLs still arrive as `invoice_url`, `payment_url`, or `url`
- [ ] Confirm webhook signatures are raw-body HMAC-SHA256 hex in `x-nowpayments-signature`

## Current coverage

This reliability layer currently covers:
- runtime exception capture hooks
- user-facing fallback UI for frontend crashes
- payment email plumbing
- webhook dedupe/event history support

This does **not** yet cover:
- tier entitlement mapping for Basic / Featured / Premium
- weekly/monthly duration logic
- free Basic trial logic
- expiry / renewal behavior
- deployment of env vars itself

## Recommended next step

Implement the entitlement layer next, using the same operational discipline:
- stable tier IDs
- durable entitlement records
- explicit expiry behavior
- test cases for webhook retry and upgrade edge cases
