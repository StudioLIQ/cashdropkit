# ADR-001: Hosted Deployment Architecture

**Status:** Accepted
**Date:** 2026-02-14
**Deciders:** CashDrop Kit core team

---

## Context

CashDrop Kit was built as a local-first web console (Phase 0-9). The MVP runs entirely in the browser with IndexedDB for persistence, WebCrypto for signing, and Electrum for chain interaction.

To support multi-user access, persistent execution state, and server-side confirmation polling, we need a hosted deployment layer while preserving the **non-custodial** security model (mnemonic/private keys never leave the client).

## Decision

### Service Boundaries

```
+------------------+      HTTPS/REST       +------------------+
|                  | --------------------> |                  |
|  Frontend (Web)  |                       |   API Server     |
|  Vercel          | <-------------------- |   Railway        |
|                  |      JSON responses   |                  |
+------------------+                       +------------------+
        |                                          |
        |                                          |
  [LocalVault]                              +------+------+
  IndexedDB/WebCrypto                       |             |
  - mnemonic                          +-----+----+  +-----+-----+
  - private keys                      | Postgres |  |  Worker   |
  - encryption keys                   | Railway  |  |  Railway  |
  (NEVER leaves browser)             +----------+  +-----------+
                                           |
                                     +-----+-----+
                                     | External  |
                                     | Contracts |
                                     | (on-chain)|
                                     +-----------+
```

### Component Responsibilities

| Component | Runtime | Owner | Responsibilities |
|-----------|---------|-------|------------------|
| **Frontend (Web)** | Vercel (Next.js static/SSR) | FE team | UI rendering, wallet UX, local signing, LocalVault (mnemonic/keys in IndexedDB+AES-GCM), CSV import/validation, transaction building & signing |
| **API Server** | Railway (Node.js) | BE team | Campaign CRUD, execution orchestration, report generation, authentication/authorization, tenant data isolation |
| **Worker** | Railway (Node.js) | BE team | Confirmation polling, tx status updates, DROPPED detection, dead-letter handling |
| **Database** | Railway Postgres | BE team | Campaign state, execution logs, token cache, user accounts, settings (NO secrets) |
| **External Contracts** | BCH mainnet/testnet | Protocol team | CLTV lockbox scripts, on-chain token operations |

### Data Ownership & Security Boundary

| Data | Location | Encryption | Server Access |
|------|----------|------------|---------------|
| Mnemonic / Private Keys | Browser LocalVault (IndexedDB) | AES-256-GCM (PBKDF2-derived key) | **NEVER** |
| Encryption passphrase | User memory only | N/A | **NEVER** |
| Derived public keys / addresses | Browser + Server DB | None (public data) | Read/Write |
| Campaign configuration | Server Postgres | None | Read/Write |
| Execution state (batches, txids) | Server Postgres | None | Read/Write |
| Signed transaction hex | Browser (ephemeral) | N/A | Broadcast only (via API relay) |
| Token metadata cache | Server Postgres | None | Read/Write |

### Environment Matrix

| Variable | Web (Vercel) | API (Railway) | Worker (Railway) |
|----------|-------------|---------------|-----------------|
| `NEXT_PUBLIC_API_URL` | Required | N/A | N/A |
| `NEXT_PUBLIC_DEFAULT_NETWORK` | Optional (mainnet) | N/A | N/A |
| `DATABASE_URL` | N/A | Required | Required |
| `SESSION_SECRET` | N/A | Required | N/A |
| `ELECTRUM_MAINNET_URL` | N/A | Required | Required |
| `ELECTRUM_TESTNET_URL` | N/A | Optional | Optional |
| `CORS_ALLOWED_ORIGINS` | N/A | Required | N/A |
| `WORKER_POLL_INTERVAL_MS` | N/A | N/A | Optional (30000) |
| `WORKER_DROPPED_THRESHOLD_MS` | N/A | N/A | Optional (1800000) |
| `LOG_LEVEL` | N/A | Optional (info) | Optional (info) |
| `PORT` | N/A | Auto (Railway) | Auto (Railway) |
| `NODE_ENV` | Auto (Vercel) | production | production |

### Domain / URL Plan

| Service | Production | Staging |
|---------|-----------|---------|
| Web | `cashdropkit.com` | `staging.cashdropkit.com` |
| API | `api.cashdropkit.com` | `api-staging.cashdropkit.com` |
| Worker | Internal (no public URL) | Internal |
| Postgres | Internal (Railway private network) | Internal |

## Consequences

### Positive

- **Non-custodial preserved**: Mnemonic/keys never transmitted; signing remains browser-only
- **Persistent state**: Server DB survives browser close; worker continues polling
- **Multi-user ready**: Auth + tenant isolation enables shared deployment
- **Independent scaling**: Web (Vercel edge), API (Railway containers), Worker (Railway containers) scale independently

### Negative

- **Increased complexity**: Two runtimes to maintain (FE + BE) instead of one
- **Network dependency**: API downtime blocks campaign operations (but not local signing)
- **Migration effort**: Existing IndexedDB users need data export/import path

### Risks

- CORS misconfiguration could block API calls or leak credentials
- Session/token management adds attack surface (mitigated by never handling secrets server-side)
- Postgres connection pool exhaustion under heavy polling (mitigated by worker-based polling instead of per-user)

## Alternatives Considered

1. **Keep fully local**: Rejected - no persistence across devices, no server-side polling
2. **Supabase (BaaS)**: Rejected - less control over worker processes, vendor lock-in for BCH-specific logic
3. **Single Next.js app on Railway**: Rejected - Vercel edge caching benefits lost, API and FE coupled

---

## References

- [PROJECT.md](../../PROJECT.md) - Core architecture and design principles
- [SECURITY.md](../../SECURITY.md) - Security model and threat analysis
