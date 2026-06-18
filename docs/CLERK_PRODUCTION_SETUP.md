# Clerk Production Setup — laboutiquevip.net

**Status (2026-06-18):** Development instance in use (`pk_test_*`). Auth UI works on production URL but **production Clerk instance required** for launch-grade auth.

## Current state

| Check | Status |
|-------|--------|
| Clerk UI on `/login` | ✓ Renders (Google/Apple/email) |
| VPS keys set | ✓ `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| Instance type | ✗ `development` |
| Publishable key | ✗ `pk_test_*` |
| Production domain | ✗ Not in Clerk domains API |
| Agency owner `admin@evergreentechnology.app` | ✓ DB: `role=agency`, `status=active`, `clerk_id=null` |

## Required steps (Clerk Dashboard)

1. Open [Clerk Dashboard](https://dashboard.clerk.com) → **Production** instance (or create one).
2. **Domains:** set primary to `https://www.laboutiquevip.net` (DNS verification per Clerk).
3. Copy **Production** keys:
   - `pk_live_...` → `VITE_CLERK_PUBLISHABLE_KEY` on VPS `.env`
   - `sk_live_...` → `CLERK_SECRET_KEY` on VPS `.env`
4. Rebuild + restart:
   ```bash
   cd /srv/apps/trystlike/repo && npm run build && systemctl restart laboutiquevip-backend
   ```
5. Agency owner: visit `https://www.laboutiquevip.net/login` and sign in with `admin@evergreentechnology.app` (links `clerk_id` on first auth).

## Verify

```bash
cd /srv/apps/trystlike/repo
set -a && source .env && set +a
bash scripts/clerk-status.sh
```

## API notes

- `POST /v1/instance/change_domain` — **production instances only** (returns `domain_update_forbidden` on dev).
- Dev instance ID: `ins_3FAiGWJ8V7cItXh0HshXGdRMiqJ`
