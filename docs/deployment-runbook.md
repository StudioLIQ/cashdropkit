# Deployment Runbook & On-Call Checklist

## 1. Deployment Procedures

### 1.1 Web (Vercel)

**Trigger:** Push to `main` branch (auto-deploy via Vercel)

**Pre-deploy:**
- [ ] All CI checks pass (lint, typecheck, test, build)
- [ ] No unresolved merge conflicts

**Deploy steps:**
1. Merge PR to `main`
2. Vercel auto-detects and builds `apps/web/`
3. Preview URL generated for review
4. Production URL updated after build succeeds

**Rollback:**
- Vercel dashboard → Deployments → Click previous deployment → "Promote to Production"

### 1.2 API Server (Railway)

**Trigger:** Push to `main` branch (auto-deploy via Railway)

**Pre-deploy:**
- [ ] All CI checks pass
- [ ] Database migrations tested locally
- [ ] Environment variables verified in Railway dashboard

**Deploy steps:**
1. Push to `main`
2. Railway builds from `apps/api/`
3. Health check runs automatically
4. If health check fails, Railway rolls back automatically

**Manual deploy:**
```bash
railway up --service api
```

**Rollback:**
- Railway dashboard → Deployments → Click previous deployment → "Redeploy"

### 1.3 Database Migrations

**ALWAYS run before API deploy if schema changed:**

```bash
# Via Railway CLI
railway run pnpm --filter @cashdropkit/api db:migrate

# Via direct connection
DATABASE_URL=<production-url> pnpm --filter @cashdropkit/api db:migrate
```

**Rollback migration (last resort):**
- Restore from Railway Postgres point-in-time backup
- Apply only the migrations up to the desired version

### 1.4 Worker (Railway)

Same as API but with different start command. Deployed as separate Railway service.

---

## 2. Failure Scenarios & Checklists

### 2.1 Database Connection Failure

**Symptoms:** API returns 500 errors, health check fails

**Checklist:**
- [ ] Check Railway Postgres service status
- [ ] Check `DATABASE_URL` env var is correct
- [ ] Check connection pool exhaustion (max 20 connections)
- [ ] Check Railway resource limits (memory/CPU)
- [ ] Test connection: `railway run psql -c "SELECT 1"`

**Resolution:**
1. If Postgres down → Wait for Railway auto-recovery (usually < 5 min)
2. If pool exhausted → Restart API service
3. If env var wrong → Fix in Railway dashboard, redeploy

### 2.2 Electrum Provider Failure

**Symptoms:** UTXO fetches fail, broadcasts timeout, tx status unknown

**Checklist:**
- [ ] Check provider URL is accessible (try WebSocket connection)
- [ ] Check if provider is overloaded (slow responses)
- [ ] Check if BCH network is experiencing issues (blockchair.com)

**Resolution:**
1. Worker auto-applies exponential backoff (up to 5 min)
2. If provider permanently down → Update `ELECTRUM_MAINNET_URL` in env
3. Campaigns in RUNNING state will PAUSE; resume after provider is back

### 2.3 API Health Check Failure

**Symptoms:** Railway shows service as unhealthy

**Checklist:**
- [ ] Check Railway deployment logs for errors
- [ ] Check if `PORT` env var matches Railway's expected port
- [ ] Check memory usage (OOM killer?)
- [ ] Check if database is accessible

**Resolution:**
1. Railway auto-restarts on health check failure
2. If persistent → Check logs, fix code, redeploy

### 2.4 Worker Stuck (No Progress)

**Symptoms:** SENT transactions never update to CONFIRMED

**Checklist:**
- [ ] Check worker logs for errors
- [ ] Check dead letter queue count
- [ ] Check if Electrum provider is responding
- [ ] Check database for stale `SENT` records

**Resolution:**
1. Restart worker service
2. If dead letter queue is full → Investigate individual txids manually
3. If provider issue → Update provider URL

### 2.5 CORS Errors in Browser

**Symptoms:** Browser console shows CORS preflight failures

**Checklist:**
- [ ] Verify `CORS_ALLOWED_ORIGINS` includes the web app's domain
- [ ] Check for trailing slashes in origin URLs
- [ ] Verify API server is running and accessible
- [ ] Check if proxy/CDN is stripping CORS headers

**Resolution:**
1. Update `CORS_ALLOWED_ORIGINS` in Railway env vars
2. Redeploy API service

### 2.6 Secret Field Detected in API Request

**Symptoms:** API returns 400 with `SECRET_DETECTED` error code

**Checklist:**
- [ ] Check which field triggered the filter (error response includes violations)
- [ ] Check if a recent FE change accidentally sends secrets to the API
- [ ] Review `secretFilter.ts` for false positives

**Resolution:**
1. Fix FE code to not send forbidden fields
2. If false positive → Update forbidden field list

---

## 3. Alert Priority Table

| Priority | Scenario | Response Time | Action |
|----------|----------|---------------|--------|
| **P0 - Critical** | Database down, all API requests failing | < 15 min | Check Railway, restore backup if needed |
| **P0 - Critical** | Secret field detected in production API | < 15 min | Audit FE code, deploy fix, review logs |
| **P1 - High** | API health check failing (auto-restart loop) | < 30 min | Check logs, fix root cause, redeploy |
| **P1 - High** | Worker completely stuck for > 1 hour | < 30 min | Restart worker, check provider |
| **P2 - Medium** | Electrum provider degraded (slow responses) | < 2 hours | Monitor, switch provider if persistent |
| **P2 - Medium** | CORS errors for specific origins | < 2 hours | Update allowlist, redeploy |
| **P3 - Low** | Dead letter queue growing | < 8 hours | Investigate individual txids |
| **P3 - Low** | Slow queries / high DB latency | < 8 hours | Analyze queries, add indexes |

---

## 4. Monitoring Checklist

### Daily

- [ ] API health check returning 200
- [ ] Worker process alive and polling
- [ ] No P0/P1 alerts in last 24 hours

### Weekly

- [ ] Review dead letter queue
- [ ] Check database storage usage
- [ ] Review Railway resource usage
- [ ] Check for dependency security advisories

### Monthly

- [ ] Disaster recovery rehearsal
- [ ] Review and rotate `SESSION_SECRET` if compromised
- [ ] Audit API access logs for unusual patterns
- [ ] Update Electrum provider list if needed
