# Security Model

CashDrop Kit is designed as a **local-first, non-custodial** application. This document describes the security architecture, threat model, and trust assumptions.

## Core Principles

### 1. Keys Never Leave the Device

**Mnemonic phrases and private keys are never transmitted over the network.**

- Keys are generated locally using browser cryptographic APIs
- Keys are encrypted at rest using AES-256-GCM
- All transaction signing happens in the browser runtime
- No server-side components have access to key material

### 2. Providers Are Untrusted

All external data sources (Electrum servers, APIs) are treated as potentially malicious:

- UTXO data is used for planning but verified during execution
- Broadcast failures are expected and handled gracefully
- Transaction status may be incorrect; confirmation requires multiple checks

### 3. Fail-Closed Design

When in doubt, the system stops rather than proceeding with potentially incorrect operations:

- Insufficient funds → execution halts with precise error
- Provider timeout → retry with backoff, then pause
- Unexpected state → preserve current state and alert user

## Cryptographic Implementation

### Key Derivation

```
User Passphrase
    ↓
PBKDF2 (SHA-256, 100,000 iterations, random salt)
    ↓
256-bit AES Key
    ↓
AES-256-GCM encryption of mnemonic/secrets
```

### Storage

| Data            | Storage Location | Encryption        |
| --------------- | ---------------- | ----------------- |
| Mnemonic phrase | IndexedDB        | AES-256-GCM       |
| Campaign state  | IndexedDB        | None (no secrets) |
| Settings        | IndexedDB        | None              |
| Session key     | Memory only      | N/A               |

### Signing Flow

1. User provides passphrase to unlock app
2. Mnemonic decrypted in memory
3. HD keys derived as needed (BIP-44/BIP-32)
4. Transaction signed in browser
5. Txid computed locally before broadcast
6. State persisted, then tx broadcast

## Threat Model

### In Scope (Protected Against)

| Threat                             | Mitigation                                              |
| ---------------------------------- | ------------------------------------------------------- |
| Server compromise                  | No server holds keys                                    |
| Network eavesdropping              | Keys never transmitted; HTTPS for API calls             |
| Provider returning false UTXO data | Verify during signing; halt on mismatch                 |
| Browser crash during execution     | Resume-safe state; txid persisted before broadcast      |
| Double-payment on retry            | Check recipient status; same-tx re-broadcast by default |
| Memory disclosure (cold boot)      | Session auto-lock; secrets cleared on lock              |

### Out of Scope (User Responsibility)

| Threat                      | User Action Required                            |
| --------------------------- | ----------------------------------------------- |
| Malware on user device      | Use trusted device                              |
| Phishing/social engineering | Verify app origin                               |
| Physical device theft       | Enable device encryption; use strong passphrase |
| Browser vulnerabilities     | Keep browser updated                            |
| Weak passphrase             | Use strong, unique passphrase                   |

### Partial Mitigations

| Threat                   | Current State                   | Notes                            |
| ------------------------ | ------------------------------- | -------------------------------- |
| XSS attacks              | CSP headers, React escaping     | Review before production         |
| Dependency supply chain  | Lock file, audit logs           | Regular dependency review needed |
| Timing attacks on crypto | WebCrypto native implementation | Browser-dependent                |

## Provider Trust Assumptions

### Electrum/Fulcrum Servers

CashDrop Kit connects to Electrum-compatible servers for:

- Fetching UTXOs for an address
- Broadcasting signed transactions
- Checking transaction status

**Trust assumptions:**

1. **Availability**: Servers may be down or slow. The app handles this gracefully.
2. **Correctness**: Servers might return incomplete or stale data. Critical operations verify state.
3. **Privacy**: Servers see which addresses you query. For privacy, run your own server or use Tor.

**What servers CANNOT do:**

- Steal your funds (they never see private keys)
- Forge transactions (all signing is local)
- Modify your transactions (txid is computed locally)

### BCMR Registries (Token Metadata)

Token metadata (name, symbol, decimals) comes from BCMR registries.

**Trust assumptions:**

- Metadata is for display only; incorrect metadata cannot cause fund loss
- Unknown tokens default to 0 decimals (safe fallback)
- User can manually override metadata

## Resume Safety

One of the most critical security properties is **preventing double-payments** during interrupted execution.

### The Problem

If the app crashes after broadcasting but before recording the txid:

1. User reloads and sees recipient as "pending"
2. App builds a new transaction (different txid)
3. Both transactions confirm → double payment

### The Solution

```
1. Build transaction
2. Sign transaction locally
3. Compute txid from signed tx
4. Save to IndexedDB: recipient → SENT, txid → X
5. THEN broadcast transaction
6. Poll for confirmation
```

If the app crashes after step 4, we have the txid and can verify status on reload.

If the app crashes after step 5 but before confirmation, we re-check the saved txid.

## Auto-Lock

To protect against unattended access:

- Configurable idle timeout (default: 15 minutes)
- Manual lock button in UI
- On lock: session key cleared from memory
- Re-unlock requires passphrase entry

## Backup and Recovery

### Recommended Backup Flow

1. **Mnemonic phrase**: Write down and store offline (metal backup recommended)
2. **Campaign data**: Export encrypted backup periodically
3. **Claim bundles**: Distribute to beneficiaries (for vesting)

### Recovery Scenarios

| Scenario            | Recovery Method                                               |
| ------------------- | ------------------------------------------------------------- |
| Forgot passphrase   | Cannot recover encrypted data; re-import mnemonic             |
| Lost device         | Re-import mnemonic on new device; campaigns must be recreated |
| Corrupted IndexedDB | Re-import mnemonic; campaigns lost                            |

## Security Checklist for Operators

Before running production campaigns:

- [ ] Using a trusted device with updated OS/browser
- [ ] Strong, unique passphrase set
- [ ] Mnemonic backed up securely offline
- [ ] Auto-lock enabled
- [ ] Tested with small amounts first
- [ ] Verified provider endpoints are legitimate

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue
2. Email: [security contact to be added]
3. Include: description, reproduction steps, potential impact
4. Allow reasonable time for fix before disclosure

## Hosted Deployment: Data Classification

When deployed in hosted mode (Vercel + Railway + Postgres), the non-custodial model is preserved through strict data classification.

### Classification Table

| Classification | Data | Browser | Server DB | API Payload |
|---------------|------|---------|-----------|-------------|
| **SECRET** | Mnemonic phrase | IndexedDB (AES-256-GCM) | NEVER | NEVER |
| **SECRET** | Private keys | Memory only | NEVER | NEVER |
| **SECRET** | Encryption key (derived) | Memory only | NEVER | NEVER |
| **SECRET** | User passphrase | Memory only (transient) | NEVER | NEVER |
| **SECRET** | Signed tx hex | Memory only (ephemeral) | NEVER | Broadcast relay only |
| **INTERNAL** | Encryption salt/IV | IndexedDB | NEVER | NEVER |
| **PUBLIC** | Addresses (derived) | IndexedDB + display | Read/Write | Read/Write |
| **PUBLIC** | Campaign config | Display | Read/Write | Read/Write |
| **PUBLIC** | Execution state | Display | Read/Write | Read/Write |
| **PUBLIC** | Token metadata | Cache | Cache | Read/Write |
| **PUBLIC** | Transaction IDs | Display | Read/Write | Read/Write |

### Server-Side Enforcement

The API server enforces the non-custodial boundary via:

1. **Payload filter**: All incoming requests are scanned for forbidden fields (mnemonic, privateKey, encryptionKey, passphrase, etc.). Requests containing secrets are **rejected** (HTTP 400).
2. **Schema enforcement**: The Postgres schema contains NO columns for mnemonic, private keys, or encryption material.
3. **Response stripping**: Outbound responses are scanned to prevent accidental secret leakage.
4. **Forbidden field list**: Maintained in `apps/api/src/middleware/secretFilter.ts`.

### Signing Flow (Hosted Mode)

```
Browser                          API Server
  |                                |
  |  1. Fetch campaign + UTXOs     |
  |  <----- campaign data ------   |
  |                                |
  |  2. Build unsigned tx          |
  |  (browser-side, using UTXOs)   |
  |                                |
  |  3. Sign tx locally            |
  |  (mnemonic never leaves)       |
  |                                |
  |  4. Compute txid locally       |
  |                                |
  |  5. Persist SENT state ------> |
  |  (txid + recipient status)     |
  |                                |
  |  6. Broadcast signed tx -----> |
  |  (relay only, no key access)   |
  |                                |
  |  7. Server polls confirmation  |
  |  <----- status updates ------  |
```

## Audit Status

This software has not been formally audited. Use at your own risk, especially for large-value operations.

Recommended before production use:

- [ ] Professional security audit
- [ ] Dependency audit
- [ ] Penetration testing

---

_Last updated: January 2025_
