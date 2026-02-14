# Railway Infrastructure Provisioning

## Service Definitions

### 1. API Server (`@cashdropkit/api`)

| Setting | Value |
|---------|-------|
| Source | `apps/api/` |
| Build Command | `pnpm install && pnpm --filter @cashdropkit/api build` |
| Start Command | `pnpm --filter @cashdropkit/api start` |
| Health Check | `GET /health` (HTTP 200) |
| Health Check Interval | 30s |
| Health Check Timeout | 5s |
| Restart Policy | Always (on failure) |
| Replicas | 1 (scale as needed) |
| Memory Limit | 512 MB |
| CPU | Shared (0.5 vCPU) |

### 2. Confirmation Worker

| Setting | Value |
|---------|-------|
| Source | `apps/api/` |
| Start Command | `node --import tsx src/worker/run.ts` |
| Health Check | Process alive (no HTTP endpoint) |
| Restart Policy | Always |
| Replicas | 1 |
| Memory Limit | 256 MB |
| CPU | Shared (0.25 vCPU) |

### 3. PostgreSQL

| Setting | Value |
|---------|-------|
| Plugin | Railway Postgres |
| Version | 16 |
| Storage | 1 GB (MVP), scale as needed |
| Connections | 20 max |
| Backup | Daily automatic (Railway managed) |

## Environment Variables

### API Server

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
SESSION_SECRET=<generate with: openssl rand -hex 32>
CORS_ALLOWED_ORIGINS=https://cashdropkit.com
ELECTRUM_MAINNET_URL=wss://bch.imaginary.cash:50004
ELECTRUM_TESTNET_URL=wss://chipnet.imaginary.cash:50004
PORT=${{PORT}}
NODE_ENV=production
LOG_LEVEL=info
```

### Worker

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
ELECTRUM_MAINNET_URL=wss://bch.imaginary.cash:50004
WORKER_POLL_INTERVAL_MS=30000
WORKER_DROPPED_THRESHOLD_MS=1800000
NODE_ENV=production
```

## Deployment Checklist

### Initial Setup

1. Create Railway project
2. Add Postgres plugin
3. Create API service (linked to `apps/api/`)
4. Create Worker service (linked to `apps/api/`, different start command)
5. Set environment variables for each service
6. Run initial migration: `pnpm --filter @cashdropkit/api db:migrate`
7. Run seed: `pnpm --filter @cashdropkit/api db:seed`
8. Verify health check: `curl https://api.cashdropkit.com/health`

### Scaling

- API: Add replicas via Railway UI (stateless, horizontal scaling)
- Worker: Single instance recommended (avoid duplicate polling)
- Postgres: Upgrade plan for more storage/connections

## Backup & Recovery

### PostgreSQL Backups

- **Automatic**: Railway provides daily point-in-time recovery
- **Manual**: `pg_dump` via Railway CLI for on-demand exports
- **Retention**: 7 days (Railway default)

### Recovery Procedure

1. Identify failure point from Railway logs
2. For data corruption: restore from Railway's point-in-time backup
3. For migration failure: rollback using `drizzle-kit drop` (last resort)
4. For service failure: Railway auto-restarts; check logs for root cause

### Disaster Recovery Rehearsal

Run quarterly:
1. Export database: `railway run pg_dump > backup.sql`
2. Create test environment
3. Import: `railway run psql < backup.sql`
4. Run migrations: `pnpm --filter @cashdropkit/api db:migrate`
5. Verify API health check
6. Verify campaign data integrity
