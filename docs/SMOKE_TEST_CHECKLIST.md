# Smoke Test Checklist

Run this after deploys that touch signup, verification, payments, or provider visibility.

## Public funnel
- [ ] Homepage loads
- [ ] Adult gate works
- [ ] Browse page loads
- [ ] Register page loads
- [ ] Login page loads

## Provider onboarding
- [ ] New account registration works
- [ ] Provider signup step 1 saves valid country/city inputs
- [ ] Package selection is explicit and shows current billing mode
- [ ] Verification step loads without console/API errors

## ID verification
- [ ] `POST /api/v1/verifications/didit/session` returns `201`
- [ ] Response contains a valid `launchUrl`
- [ ] Clicking Start Identity Verification opens a real hosted verification URL
- [ ] Callback returns user to the app without a broken page
- [ ] Webhook updates verification status correctly

## Payments
- [ ] Paid package selection is visible in dashboard/signup flow
- [ ] Payment session creation works for paid package
- [ ] Webhook dedupe prevents double-processing
- [ ] Payment success updates entitlement/activation state correctly
- [ ] Payment failure does not activate the package

## Reliability
- [ ] Backend Sentry event received
- [ ] Frontend Sentry event received
- [ ] Resend test email delivered
- [ ] `/api/health` is reachable
- [ ] Audit trail created for verification + payment events
