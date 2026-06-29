# Cloudflare Configuration for VelumX

## Zone: velumx.xyz

### Page Rules

1. **CDN SDK bundle** — `cdn.velumx.xyz/sdk/*`
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 year
   - Browser Cache TTL: 1 year
   - Always Use HTTPS: On
   - Cache Key: Include query string

2. **API endpoints** — `api.velumx.xyz/*`
   - Cache Level: Bypass
   - Always Use HTTPS: On
   - Security Level: High

3. **Docs** — `docs.velumx.xyz/*`
   - Cache Level: Standard
   - Edge Cache TTL: 4 hours
   - Always Use HTTPS: On

### WAF Rules

Custom rules applied to all zones:

| Rule | Action | Pattern |
|------|--------|---------|
| Rate Limit — API | Challenge | 100 req/min per IP on `api.velumx.xyz` |
| SQL Injection | Block | `UNION SELECT`, `OR 1=1`, `DROP TABLE` |
| XSS | Block | `<script>`, `javascript:`, `onerror=` |
| Path Traversal | Block | `../`, `..\\`, `/etc/passwd` |
| Bot Protection | Managed Challenge | Known bot signatures |
| Country Block | Block | Sanctioned countries (OFAC) |

### Custom Error Pages

```
cdn.velumx.xyz/errors/
  500.html  — "Service temporarily unavailable"
  502.html  — "Origin server error"
  waf.html  — "Request blocked for security reasons"
```

### Cache Headers

CDN SDK files served with:
```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/javascript; charset=utf-8
Access-Control-Allow-Origin: *
```

SDK files are versioned: `sdk/0.1.0/velumx.iife.js` — newer versions get new paths, avoiding invalidation.

### DDoS Protection

- Cloudflare L3/L4 protection: Default enabled
- Cloudflare L7 protection: Managed ruleset
- Rate limiting: 1000 req/min per IP globally
- Challenge passage: 5 minutes (re-triggered on threshold breach)

### DNS Records

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | `@` | `velumx.pages.dev` | On |
| CNAME | `api` | `k8s-ingress.example.com` | On |
| CNAME | `cdn` | `r2-bucket.workers.dev` | On |
| CNAME | `docs` | `docs.pages.dev` | On |
| CNAME | `status` | `statuspage.io` | On |
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` | — |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:security@velumx.xyz` | — |
