# LaBoutiqueVIP hardening note (2026-03-20)

App-level changes in this pass:

- Public provider visibility is centralized in code and now excludes blocklisted test listings by exact display name, with `Jarvis Test Listing` blocked by default and `PUBLIC_PROVIDER_NAME_BLOCKLIST` available for additional names.
- Provider self-preview no longer forces `status=active` and `is_profile_approved=true` at the page level, so owners can preview their own listing by id while public visitors still only see approved live profiles.
- Anonymous public page loads no longer call `/api/auth/me` when no auth token exists.
- Homepage featured listings now use the public provider search endpoint instead of the generic entity path.
- Public provider search responses emit short cache headers suitable for CDN / reverse-proxy caching.
- `/api/health` now returns a static payload with `Cache-Control: no-store`.

What still depends on infrastructure:

- CDN / reverse-proxy caching for static assets and short-lived GET API responses.
- Compression, keep-alive, worker/process sizing, and connection limits on the Hetzner origin.
- Cloudflare cache rules, bot/WAF tuning, and origin shielding behavior.
- Database pool sizing and Postgres tuning under sustained concurrent read load.
