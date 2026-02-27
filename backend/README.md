# Backend Foundation

## Layout
- `src/`: API skeleton, middleware, and utilities.
- `prisma/`: schema and migration scaffolding.

## Endpoints
- `GET /api/health`
- `POST /api/v1/models/register`
- `GET /api/v1/models/me`
- `PATCH /api/v1/models/me`
- `GET /api/v1/models/me/calendar`
- `PUT /api/v1/models/me/calendar`
- `GET /api/v1/models/me/tours`
- `POST /api/v1/models/me/tours`
- `PATCH /api/v1/models/me/tours/:tourId`
- `DELETE /api/v1/models/me/tours/:tourId`
- `GET /api/v1/search/cities?q=`
- `GET /api/v1/search/models?city=&verified=&tag=&available_from=&available_to=&page=&limit=`

## Request examples
`POST /api/v1/models/register`
```json
{
  "displayName": "Ava Lane",
  "city": "Miami",
  "bio": "Independent companion for social events.",
  "services": ["events", "travel"],
  "rates": { "currency": "USD", "hourly": 450 },
  "contactPreferences": { "telegram": "ava_lane" },
  "tags": ["vip", "travel"],
  "isPublished": true
}
```

`PUT /api/v1/models/me/calendar`
```json
{
  "blocks": [
    {
      "city": "Miami",
      "startsAt": "2026-03-10T10:00:00.000Z",
      "endsAt": "2026-03-10T18:00:00.000Z",
      "isAvailable": true
    }
  ]
}
```

`POST /api/v1/models/me/tours`
```json
{
  "city": "Los Angeles",
  "startsAt": "2026-04-01T00:00:00.000Z",
  "endsAt": "2026-04-15T00:00:00.000Z",
  "notes": "Two-week west coast tour"
}
```

## Auth headers
- `x-user-id`: authenticated user UUID
- `x-roles`: comma-separated roles (for example `provider` or `admin,provider`)
