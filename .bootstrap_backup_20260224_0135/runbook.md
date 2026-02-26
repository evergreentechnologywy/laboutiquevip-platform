# runbook.md

## Local bootstrap
1. Copy `.env.example` to `.env`.
2. `npm install`
3. `npx prisma generate`
4. `npx prisma migrate dev --name init`
5. `npm run dev`

## Health checks
- App: `GET /api/health`
- Webhooks:
  - `POST /api/webhooks/confirmo`
  - `POST /api/webhooks/idenfy`

## Deployment (ONLY)
Use:
- `/srv/apps/trystlike/deploy/deploy.sh`

## Incident priorities
1. Webhook failures (payments/verification)
2. Auth/login failures
3. Admin moderation availability
4. Search/indexing regressions
