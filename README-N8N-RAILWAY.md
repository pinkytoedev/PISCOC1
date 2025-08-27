## n8n on Railway: Deployment Guide

This guide explains how to run n8n on Railway for PISCOC workflows. It covers architecture options, essential environment variables, and secure configuration. Prefer a separate Railway project for n8n.

### Architecture options
- **Single instance (simple, recommended to start)**
  - Services: n8n + PostgreSQL (managed by Railway)
  - `EXECUTIONS_MODE=regular` (in-process)
  - Good for low/medium load; easiest to run
- **Queue/Worker (scales better)**
  - Services: n8n (main), Worker(s), PostgreSQL, Redis
  - `EXECUTIONS_MODE=queue` with Redis-backed Bull queue
  - Add more workers to process flows under load

### Create on Railway (two paths)
1) Easiest: use Railway's official n8n template
- In Railway, New Project → Deploy from Template → search "n8n" → pick either standard or workers template
- Railway provisions PostgreSQL (and Redis for workers template) automatically

2) From container (if you need custom image)
- Create New Service → Deploy from Docker Image → `n8nio/n8n:latest`
- Add a Railway PostgreSQL plugin
- Set env vars below

### Required environment variables
Set these in the n8n service.

- Security
  - `N8N_BASIC_AUTH_ACTIVE=true`
  - `N8N_BASIC_AUTH_USER=admin` (choose your value)
  - `N8N_BASIC_AUTH_PASSWORD=<strong password>`
  - `N8N_ENCRYPTION_KEY=<32+ char random string>`

- Web server and webhooks
  - `N8N_HOST=<your-domain-or-railway-host>`
  - `N8N_PORT=${PORT}` (Railway provides `PORT`)
  - `N8N_PROTOCOL=https` (use `http` for testing only)
  - `WEBHOOK_URL=https://<your-domain-or-railway-host>/` (must match public URL)

- Database (PostgreSQL; attach Railway Postgres and map variables)
  - `DB_TYPE=postgresdb`
  - Option A (single URL): `DB_POSTGRESDB_CONNECTION_STRING=${DATABASE_URL}`
  - Option B (components):
    - `DB_POSTGRESDB_HOST=${PGHOST}`
    - `DB_POSTGRESDB_PORT=${PGPORT}`
    - `DB_POSTGRESDB_DATABASE=${PGDATABASE}`
    - `DB_POSTGRESDB_USER=${PGUSER}`
    - `DB_POSTGRESDB_PASSWORD=${PGPASSWORD}`

- Executions
  - For single instance: `EXECUTIONS_MODE=regular`
  - For workers: `EXECUTIONS_MODE=queue`
    - `QUEUE_BULL_REDIS_HOST=${REDIS_HOST}`
    - `QUEUE_BULL_REDIS_PORT=${REDIS_PORT}`
    - `QUEUE_BULL_REDIS_PASSWORD=${REDIS_PASSWORD}` (if set)

- Optional hardening
  - `N8N_DISABLE_PRODUCTION_MAIN_PROCESS=false`
  - `N8N_METRICS=false`
  - `N8N_PERSONALIZATION_ENABLED=false`
  - `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none`
  - `EXECUTIONS_DATA_SAVE_ON_ERROR=all`

### Binary data storage
Railway ephemeral filesystems are not persistent. Choose one:
- Start simple: `N8N_DEFAULT_BINARY_DATA_MODE=filesystem` and accept that binaries may be pruned on redeploys
- Production: use S3-compatible storage and n8n's S3 binary data manager (recommended)
  - Typical variables (adjust to your provider):
    - `N8N_BINARY_DATA_MANAGER=s3`
    - `S3_BUCKET` / `N8N_BINARY_DATA_S3_BUCKET`
    - `S3_ENDPOINT` / `N8N_BINARY_DATA_S3_ENDPOINT`
    - `S3_REGION` / `N8N_BINARY_DATA_S3_REGION`
    - `S3_ACCESS_KEY` / `N8N_BINARY_DATA_S3_ACCESS_KEY`
    - `S3_ACCESS_SECRET` / `N8N_BINARY_DATA_S3_ACCESS_SECRET`
    - `S3_FORCE_PATH_STYLE=true` (for MinIO or path-style endpoints)

Consult the n8n docs for the exact S3 variable names corresponding to your n8n version.

### PISCOC integration variables
If your workflows call back into PISCOC or vice versa:
- In n8n:
  - `PISCOC_BASE_URL=https://<your-piscoc-domain>`
  - `PISCOC_API_KEY=<generated key>`
- In PISCOC (Railway variables on the app service):
  - `N8N_API_KEY=<same key>` so the app can authenticate to n8n (see server references to `N8N_API_KEY`)

### Custom domain and HTTPS
- Add a custom domain to the n8n service in Railway → Domains
- Update `N8N_HOST` and `WEBHOOK_URL` to the HTTPS custom domain
- Re-run a manual webhook test once the URL changes

### Deploy steps (quick start)
1. Create a Railway project from the n8n template
2. Attach PostgreSQL (and Redis for queue mode)
3. Set env vars above (especially `N8N_ENCRYPTION_KEY` and basic auth)
4. Deploy and open the generated URL to access n8n
5. Configure PISCOC env vars to point at the n8n URL if needed

### Version pinning
- Recommended image: `n8nio/n8n:<stable-tag>` (e.g., `1.64.x`) to avoid breaking changes

### Backups and recovery
- PostgreSQL: enable Railway backups or export regularly
- Binary data: if using S3 mode, rely on bucket lifecycle and backups

### Security checklist
- Strong `N8N_BASIC_AUTH_*` and set `N8N_ENCRYPTION_KEY`
- Use HTTPS and a custom domain; disable public editor exposure where possible
- Restrict API/webhooks with secrets; avoid exposing credentials inside nodes
- Rotate keys on role changes; enable least-privilege on S3/DB creds


