# peppol-ap Runbook

## Quick Start

```bash
# Default: just the app (no MinIO, no Prometheus)
docker compose up -d

# With object storage (MinIO)
docker compose --profile with-payload-store up -d

# With monitoring (Prometheus)
docker compose --profile with-monitoring up -d

# Both together
docker compose --profile with-payload-store --profile with-monitoring up -d
```

## Services & Ports

| Service    | URL                          | Notes                        |
|------------|------------------------------|------------------------------|
| ap-core    | http://localhost             | Main app (via nginx :80/:443)|
| nginx      | http://localhost             | Reverse proxy in front of app|
| minio      | http://localhost:9000        | S3 API (opt-in)              |
| minio console | http://localhost:9001     | MinIO admin UI (opt-in)      |
| prometheus | http://localhost:9090        | Metrics dashboard (opt-in)   |

## Environment Variables

| Variable               | Default         | Description                       |
|------------------------|-----------------|-----------------------------------|
| `AP_CORE_WORKERS`      | `4`             | Number of Node worker processes   |
| `AP_CORE_DRY_RUN`      | `false`         | If `true`, app runs without side effects |
| `AP_CORE_DB_PATH`      | `/data/ap-core.db` | SQLite database path            |
| `AP_CORE_TRUSTSTORE_PATH` | `/app/certs/truststore.pem` | TLS truststore        |
| `MINIO_ROOT_USER`      | `minioadmin`    | MinIO admin username (if used)    |
| `MINIO_ROOT_PASSWORD`  | `minioadmin`    | MinIO admin password (if used)    |

Copy `.env.example` to `.env` and adjust as needed.

## Useful Commands

```bash
# View logs
docker compose logs -f ap-core
docker compose logs -f prometheus

# Restart a service
docker compose restart ap-core

# Stop everything
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v

# Rebuild after code changes
docker compose build ap-core
docker compose up -d --force-recreate ap-core

# Access a running container shell
docker compose exec ap-core sh

# Health check
curl -f http://localhost/health/live
```

## Profiles

Docker Compose profiles control which services start:

| Profile             | Services started               |
|---------------------|-------------------------------|
| *(none)*            | ap-core, nginx                |
| `with-payload-store`| ap-core, nginx, minio         |
| `with-monitoring`   | ap-core, nginx, prometheus    |

Profiles can be combined.

## Prometheus

- Scrapes `/metrics` from `localhost:3001` every 15s
- Access the Prometheus web UI at http://localhost:9090
- Config file: `prometheus.yml` (checked into repo)

## MinIO

- S3-compatible object storage
- Credentials: `minioadmin` / `minioadmin` (change in `.env` for production)
- Console at http://localhost:9001 — use for creating buckets

## Project Structure

```
peppol-ap/
├── docker-compose.yml   # Service definitions
├── Dockerfile           # Multi-stage Node image with nginx
├── prometheus.yml       # Prometheus scrape config
├── nginx/
│   └── nginx.conf       # Reverse proxy + rate limiting
└── .env.example         # Environment variable template
```
