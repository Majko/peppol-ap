# Nginx Reference Config + Docker Deployment

**Status:** implemented

**Blocked by:** 05 - Cluster mode

## Parent

Depends on ticket 05 — Cluster mode

## What to build

Create a reference Nginx configuration for TLS termination and load balancing, plus Docker deployment files for repeatable builds. These are reference configs — operators may adapt them for Caddy, HAProxy, or a cloud LB.

### Nginx config

**`nginx/nginx.conf`** — main config file:

- `upstream ap-core` block pointing to Worker nodes (127.0.0.1:3001–3008 by default, matching cluster worker count)
- `least_conn` load balancing strategy (AS4 payloads vary in size, least_conn distributes evenly)
- Rate limiting zone: `limit_req_zone $binary_remote_addr zone=as4:10m rate=10r/s` for the `/as4/receive` endpoint
- Proxy settings: `proxy_read_timeout 120s`, `proxy_http_version 1.1`, `proxy_set_header Connection ""`

**`nginx/sites-available/ap-core`** — virtual host config:

```nginx
server {
    listen 443 ssl http2;
    server_name ap.mojafaktura.sk;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # AS4 receive endpoint (rate limited)
    location /as4/receive {
        limit_req zone=as4 burst=20 nodelay;
        proxy_pass http://ap-core;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Health — no rate limit, direct to a single worker
    location /health/ {
        proxy_pass http://ap-core;
    }
}
```

**`nginx/sites-available/ap-core (port 80 redirect)`** — HTTP → HTTPS redirect:

```nginx
server {
    listen 80;
    server_name ap.mojafaktura.sk;
    return 301 https://$host$request_uri;
}
```

**`scripts/generate-dev-certs.sh`** — generates self-signed certs for development:

```bash
#!/bin/bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=ap.mojafaktura.sk" \
  -addext "subjectAltName=DNS:localhost,DNS:ap.mojafaktura.sk"
```

### Docker deployment

**`Dockerfile`** — multi-stage build:

```dockerfile
# Builder stage
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production stage
FROM node:22-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/node_modules ./node_modules
COPY . .
COPY nginx/ /etc/nginx/
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "require('http').get('http://localhost/health/live', r => { process.exit(r.statusCode === 200 ? 0 : 1) })"
CMD ["sh", "-c", "nginx && node server/cluster.js"]
```

**`docker-compose.yml`** — full stack:

```yaml
version: '3.8'
services:
  ap-core:
    build: .
    ports:
      - "443:443"
      - "80:80"
    environment:
      - AP_CORE_ADAPTER=sqlite
      - AP_CORE_DB_PATH=/data/ap-core.db
      - AP_CORE_WORKERS=${AP_CORE_WORKERS:-4}
      - AP_CORE_DRY_RUN=${AP_CORE_DRY_RUN:-false}
      - AP_CORE_TRUSTSTORE_PATH=/app/certs/truststore.pem
      - N42_HOME=/app/.node42
    volumes:
      - ap-core-data:/data
      - ./certs:/app/certs:ro
      - ./.node42:/app/.node42
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost/health/live', r => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 5s
      retries: 3

  # Optional: payload storage
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    volumes:
      - minio-data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    profiles:
      - with-payload-store

  # Optional: monitoring
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    profiles:
      - with-monitoring

volumes:
  ap-core-data:
  minio-data:
  prometheus-data:
```

**`.env.example`** — documented environment variables:

```
# Storage
AP_CORE_ADAPTER=sqlite
AP_CORE_DB_PATH=/data/ap-core.db

# Clustering
AP_CORE_WORKERS=4

# AS4
AP_CORE_DRY_RUN=false
AP_CORE_TRUSTSTORE_PATH=/app/certs/truststore.pem

# Node42
N42_HOME=/app/.node42

# Webhook
WEBHOOK_SECRET=
WEBHOOK_URL=

# Server
PORT=3001
HOST=0.0.0.0
```

### New files

| File | Purpose |
|------|---------|
| `nginx/nginx.conf` | Main Nginx config with upstream, rate limiting |
| `nginx/sites-available/ap-core` | HTTPS site config |
| `nginx/sites-available/ap-core-http` | HTTP → HTTPS redirect |
| `nginx/ssl/.gitkeep` | Placeholder for SSL certs directory |
| `Dockerfile` | Multi-stage Docker build |
| `docker-compose.yml` | Full stack (AP Core + optional MinIO + Prometheus) |
| `.env.example` | Documented env vars |
| `scripts/generate-dev-certs.sh` | Self-signed cert generator |
| `prometheus.yml` | Prometheus scrape config |

## Acceptance criteria

- [ ] Nginx config: `upstream ap-core` with 8 worker IP:port entries, `least_conn` balancing
- [ ] Nginx config: rate limiting zone for `/as4/receive` at 10 req/s per IP
- [ ] Nginx config: `proxy_read_timeout 120s` for AS4 (large payloads)
- [ ] Nginx config: TLS termination on port 443 with cert/key path
- [ ] `scripts/generate-dev-certs.sh` creates self-signed certs in `nginx/ssl/`
- [ ] `Dockerfile` builds and starts both Nginx + AP Core
- [ ] `docker-compose up` starts the AP Core on port 443
- [ ] Health check passes within 10 seconds of container start
- [ ] `.env.example` documents all configuration variables
- [ ] Optional MinIO and Prometheus services can be enabled via `--profile with-payload-store` and `--profile with-monitoring`
