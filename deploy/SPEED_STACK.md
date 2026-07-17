# LBV speed stack (Coolify + Cloudflare)

## Architecture (correct for performance)

```
Browser → Cloudflare (orange cloud, HTTP/3, edge cache)
       → VPS nginx (www.laboutiquevip.net)
         → static dist/ (Vite assets)
         → Node :8787 (API + R2 photo proxy)
```

**Coolify** runs other apps on this host. **LBV is intentionally NOT proxied through Coolify** — that would add a hop and slow pages. Keep Coolify healthy for other services; do not move LBV behind Coolify Traefik unless you need multi-replica app deploys.

## Cloudflare checklist

1. DNS: `laboutiquevip.net` + `www` **Proxied** (orange cloud) → origin `67.225.163.73`
2. SSL/TLS mode: **Full (strict)**
3. Always Use HTTPS: ON
4. Min TLS: 1.2
5. HTTP/3 (QUIC): ON
6. Brotli: ON
7. Early Hints: ON (if available)
8. Cache Rules (recommended):
   - `/assets/*` → Cache Everything, Edge TTL 1 month+, Browser TTL respect origin
   - `/api/r2-photo/*` → Cache Everything, Edge TTL 1 month+
   - HTML `/` → respect origin (`s-maxage=60`)
9. Optional Page Rule: `www.laboutiquevip.net/assets/*` Cache Level = Cache Everything

## Origin nginx (this repo)

- `deploy/laboutiquevip.nginx.conf` — site config
- `deploy/cloudflare-realip.conf` — real client IPs via `CF-Connecting-IP`

Key cache headers:

| Path | Cache-Control |
|------|----------------|
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/api/r2-photo/*` | `public, max-age=31536000, immutable` |
| `/api/eros-photo`, `/api/tryst-photo` | `public, max-age=86400` |
| SPA HTML `/` | `public, max-age=0, s-maxage=60, must-revalidate` |

## Apply on VPS

```bash
cp deploy/laboutiquevip.nginx.conf /etc/nginx/sites-enabled/laboutiquevip.net
cp deploy/cloudflare-realip.conf /etc/nginx/conf.d/cloudflare-realip.conf
nginx -t && systemctl reload nginx
```

## Verify

```bash
curl -sSI https://www.laboutiquevip.net/ | grep -iE 'cf-cache|cache-control|server'
curl -sSI https://www.laboutiquevip.net/assets/index-*.js | grep -iE 'cf-cache|cache-control'
curl -sSI https://www.laboutiquevip.net/api/r2-photo/<id>/000.jpg | grep -iE 'cf-cache|cache-control'
```

Expect: `Server: cloudflare`, asset/photo `Cf-Cache-Status: HIT` after first request.
