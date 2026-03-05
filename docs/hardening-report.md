# Hardening Follow-up Report

Date: 2026-03-05

## Completed

1. **JWT hardening**
   - Replaced custom hand-rolled JWT signing/verification with `jsonwebtoken` HS256.
   - Enforced claim-based auth using `sub` and `role`.
   - Token verification now routes through central auth header parsing.

2. **Authorization guards for entity mutations**
   - `Provider` create/update now enforces owner-or-admin rules.
   - `Booking` and `Message` create remain public but now include anti-spam request limits per IP+provider.
   - `Review` create now requires authenticated users.

3. **Prompt auth flow removed from frontend**
   - Removed prompt/confirm-based login-register fallback.
   - Added dedicated UI pages:
     - `/login`
     - `/register`
   - Added redirect helpers preserving `next` URL.

4. **Server-side validation added (zod)**
   - Added validation schemas for:
     - auth payloads (`register`, `login`)
     - entity mutations (`Provider`, `Booking`, `Message`, `Review`)
     - upload payloads
   - Validation errors now return structured issue details.

5. **Upload endpoint hardening**
   - Added MIME allowlist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
   - Added max size guard (5 MiB).
   - Added safe basename handling and generated safe file names.
   - Added path safety guard before write.

6. **Backend tests expanded**
   - Added tests for:
     - JWT token validation behavior in auth extraction
     - provider ownership mutation guard
     - review auth requirement
     - provider update authorization guard

## Notes

- Anti-spam controls currently use in-memory buckets; they reset on process restart and are per-instance.
- Existing data model does not currently map reviews to authenticated user IDs; review auth gate is enforced at API boundary.

## Remaining Risks / Next Hardening Steps

1. Move anti-spam throttling to Redis or DB for multi-instance consistency.
2. Rotate JWT secrets via env/versioning and consider short-lived access + refresh token flow.
3. Add ownership relation in `Review` (reviewer user id) for stronger moderation/auditability.
4. Add content scanning / magic-byte sniffing for uploaded files (MIME header alone can be spoofed).
