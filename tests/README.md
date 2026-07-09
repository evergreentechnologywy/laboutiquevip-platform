# La Boutique VIP — Regression & Smoke Tests

**Platform repo:** `evergreentechnologywy/laboutiquevip-platform`  
**Production:** https://www.laboutiquevip.net  
**Vault QA pack:** `evergreen-vault/qa-screenshots/laboutiquevip-qa-final-2026-07-07/`

## Layout

| Path | Purpose |
|------|---------|
| `e2e/smoke-critical-path.spec.ts` | Login → Listing → Payment API → Search visibility |
| `e2e/regression.spec.ts` | Five regression areas (search, auth, billing, media, admin) |
| `e2e/ui-layout.spec.ts` | **UI layout regression** — badges, nav, overlap, age gate, soft visual snapshot |
| `e2e/helpers/lbv.ts` | Age gate, API helpers |
| `e2e/helpers/layout.ts` | Bounding-box overlap + alignment assertions |
| `api/prod-smoke.mjs` | Fast curl-free API smoke (no browser) |
| `playwright.config.ts` | Playwright config (`@playwright/test` in root `package.json`) |

## Prerequisites

1. **Node 20+** and `npm install` at repo root.
2. **QA Clerk accounts** (passwords in vault, not git):  
   `01_Infrastructure/secrets/lbv-qa/LBV_QA_ACCOUNTS.md`
3. Optional env for authenticated tests:

```bash
export LBV_BASE_URL=https://www.laboutiquevip.net
export CLERK_QA_MEMBER_EMAIL=qa-member@evergreentech.site
export CLERK_QA_MEMBER_PASSWORD=...
export CLERK_QA_ADMIN_EMAIL=qa-admin@evergreentech.site
export CLERK_QA_ADMIN_PASSWORD=...
# API Bearer tokens (from Clerk session JWT) for order/billing API tests:
export CLERK_QA_PROVIDER_TOKEN=eyJ...
export CLERK_QA_ADMIN_TOKEN=eyJ...
```

## Run commands

```bash
# Backend unit tests (orders, webhooks, search, slug)
npm run test:backend

# API smoke (read-only prod)
node tests/api/prod-smoke.mjs

# Playwright — guest smoke only
npx playwright test tests/e2e/smoke-critical-path.spec.ts

# Playwright — full regression (set Clerk env for auth cases)
npx playwright test tests/e2e/regression.spec.ts

# All e2e
npx playwright test
```

## UI layout regression

**Spec:** `e2e/ui-layout.spec.ts`  
**Helpers:** `e2e/helpers/layout.ts` (bounding-box overlap, vertical alignment)

### What it checks (prod-safe, read-only)

| Area | Assertion |
|------|-----------|
| Provider cards | Exactly one badge overlay row per card (`absolute left-4 top-4`); no duplicate Premium/Touring/verification labels |
| Badge geometry | Visible badges in overlay do not overlap (pairwise bbox) |
| Card links | `href` contains `viewprofile?id=` |
| Profile header | `h1` and verification badges share flex row; vertical center delta ≤ 28px |
| Desktop nav | Browse / Pricing / Trust links visible with correct `href` |
| Mobile nav | Hamburger opens sheet; links reachable; Browse navigates |
| Age gate | After dismiss, dialog hidden; sticky nav visible and not under modal overlay |
| Visual smoke | Browse page soft screenshot (`browse-miami-layout.png`, 4% max diff, images masked) |

### Run (gentle — single worker, prod default)

```bash
# Layout pack only (recommended for CI smoke)
LBV_BASE_URL=https://www.laboutiquevip.net npx playwright test tests/e2e/ui-layout.spec.ts --workers=1 --project=desktop-chrome

# Skip visual snapshot on first run or when UI intentionally changed
LBV_BASE_URL=https://www.laboutiquevip.net npx playwright test tests/e2e/ui-layout.spec.ts --grep-invert "screenshot"

# Refresh baselines after approved UI change
LBV_BASE_URL=https://www.laboutiquevip.net npx playwright test tests/e2e/ui-layout.spec.ts --grep "screenshot" --update-snapshots
```

Optional: `LBV_SMOKE_SLUG=rubyvega` overrides profile header test target.

Snapshots live beside the spec: `tests/e2e/ui-layout.spec.ts-snapshots/`.

## Payment testing policy

- **Processor:** NOWPayments (not Stripe checkout). Stripe appears only as provider-dashboard affiliate link.
- **No live charges** on prod QA — use `test_mode` order responses when `NOWPAYMENTS_API_KEY` is unset, or sandbox IPN replay in isolated env.
- **Credit allocation:** webhook `finished` → `ad_package` + `ad_package_expiry` on `Provider` + `Entitlement` row (see `backend/src/routes/webhookNowpayments.test.ts`).

## Staging gap

There is **no dedicated LBV staging URL** in vault docs. External QA uses prod read-only + Clerk QA accounts; destructive webhook fuzzing waits on staging (see `03_Journal/LBV_EXTERNAL_QA_WORKFLOW.md`).

## Related vault scripts

- `evergreen-vault/patches/lbv-prod-qa.sh` — shell smoke + injection probes
- `evergreen-vault/qa-screenshots/laboutiquevip-qa-final-2026-07-07/load_test.mjs` — concurrency
