# TICKET.md

## 0) Workflow Rules

### 0.1 Ticket status

- [ ] TODO
- [~] IN_PROGRESS
- [x] DONE

### 0.2 Completion protocol

A ticket can be marked DONE only when:

1. Definition of Done is met
2. The ticket includes:
   - changed files
   - commands run + outcomes
   - manual QA checklist results
   - remaining risks / follow-ups (if any)

### 0.3 Definition of Done (global)

- TypeScript build errors: 0
- Lint/format applied
- Minimum unit tests for core logic (planner/executor/tx utils)
- Demo path does not crash or lose state
- Resume works after reload

---

## 1) Phase 0 — Repo Bootstrap

### [x] T-0001 Repo bootstrap (Next.js + TS + lint/format + env) — DONE

**Goal:** Create the skeleton with stable dev ergonomics.

**Deliverables:**

- Next.js app with TypeScript (strict)
- eslint + prettier + import sorting
- env configuration (.env.example)
- app router + initial pages
- UI shell (sidebar/topbar)

**Acceptance:**

- `pnpm dev` (or npm) runs immediately
- base layout renders

**Completion Details:**

- Changed files: 34 files (see commit d9fc89a)
- Commands run:
  - `pnpm format` — passed
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed
  - `pnpm build` — passed (all routes generated)
  - `pnpm dev` — runs successfully on localhost:3000
- Manual QA:
  - [x] Dev server starts without errors
  - [x] Root page redirects to /dashboard
  - [x] Sidebar navigation works for all pages
  - [x] Topbar network selector and connection status render
  - [x] All pages (dashboard, airdrops, vesting, wallets, settings, claim) render
- Commit: d9fc89adbac42df68b20df959e0a21339ae25250

### [x] T-0002 Docs baseline (README + LICENSE + SECURITY.md) — DONE

**Goal:** Minimum documentation required for demo/review.

**Deliverables:**

- README: install/run/demo steps
- LICENSE: chosen license and scope
- SECURITY.md: local signing, encrypted storage, threat model, provider trust assumptions

**Acceptance:**

- A reviewer can run locally without guessing
- Clear statement: secrets never leave the client

**Completion Details:**

- Changed files: README.md, LICENSE, SECURITY.md
- README includes: What/Why/How, Quick Start, Demo Walkthrough, Project Structure, Config, Tech Stack, MVP Scope
- LICENSE: MIT License
- SECURITY.md includes: Core principles, crypto implementation, threat model, provider trust assumptions, resume safety, auto-lock, backup/recovery, security checklist
- Manual QA:
  - [x] README has clear install/run steps
  - [x] Security statement "Your keys never leave this device" present
  - [x] SECURITY.md covers all required topics
- Commit: ab3d231e531c6dc94093e0b3a12230b6491ebfda

---

## 2) Phase 1 — Local DB / Crypto / Wallets

### [x] T-0101 Dexie schema + migrations — DONE

**Goal:** Persist campaigns + execution state in IndexedDB.

**Scope:**

- tables: wallets, airdropCampaigns, vestingCampaigns, logs, settings
- migration strategy
- repositories

**Acceptance:**

- reload retains all state
- schema version upgrade path exists

**Completion Details:**

- Changed files: package.json, pnpm-lock.yaml, src/core/db/*
- Created files:
  - `src/core/db/types.ts` — Domain types (Wallet, AirdropCampaign, VestingCampaign, etc.)
  - `src/core/db/db.ts` — Dexie database class with schema v1
  - `src/core/db/repositories.ts` — CRUD operations for all tables
  - `src/core/db/migrations.ts` — Migration utilities and version checking
  - `src/core/db/index.ts` — Public exports
  - `src/core/db/db.test.ts` — Test suite for persistence verification
- Commands run:
  - `pnpm format` — passed
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed
  - `pnpm build` — passed
- Manual QA:
  - [x] All tables defined with proper indexes
  - [x] Repository CRUD operations implemented
  - [x] Migration strategy documented
  - [x] BigInt stored as string for IndexedDB compatibility
- Commit: 6238a8396343341d0e305a48925a4cf4750cc702

### [ ] T-0102 BigInt JSON serialization (replacer/reviver)

**Goal:** BigInt-safe persistence and export/import.

**Deliverables:**

- `src/core/util/bigintJson.ts`
- shared serialization layer used everywhere

**Acceptance:**

- bigint fields round-trip without loss

### [ ] T-0103 App lock + AES-GCM encrypted secret storage

**Goal:** Encrypt mnemonic/private materials at rest.

**Deliverables:**

- PBKDF2 key derivation
- AES-GCM encrypt/decrypt helpers
- auto-lock by idle time
- settings UI for lock config

**Acceptance:**

- secrets cannot be decrypted without passphrase
- auto-lock triggers reliably

### [ ] T-0104 Wallet domain + mnemonic wallet create/import UI

**Goal:** Users can create/import/select active wallet.

**Deliverables:**

- wallet list UI
- create wallet flow (backup confirmation)
- import mnemonic flow
- watch-only skeleton (optional, placeholder only)

**Acceptance:**

- active wallet selection persists across reload
- mnemonic stored encrypted

---

## 3) Phase 2 — Chain Adapter (UTXO / Broadcast / Tx Status)

### [ ] T-0201 ChainAdapter interface definition

**Goal:** Fix provider abstraction before implementation.

**Deliverables:**

- `src/core/adapters/chain/ChainAdapter.ts`
- types: UTXO, TokenUTXO, TxStatus, BlockInfo

**Acceptance:**

- planners/executors depend only on interface, not provider details

### [ ] T-0202 Implement 1 ChainAdapter (browser-friendly)

**Goal:** UTXO fetch + broadcast + tx status for mainnet/testnet.

**Constraints:**

- never transmit private keys/mnemonic
- endpoints configurable via env

**Deliverables:**

- `src/core/adapters/chain/<provider>/...`
- basic retry/backoff strategy

**Acceptance:**

- address → UTXOs works
- raw tx → broadcast works
- txid → status works

### [ ] T-0203 Connection status (Connected/Degraded/Offline)

**Goal:** Reflect provider instability in UX.

**Deliverables:**

- health checks
- topbar status indicator
- retry controls

**Acceptance:**

- offline mode clearly shown
- actions fail gracefully with actionable error

---

## 4) Phase 3 — Token Metadata / Validation / CSV

### [ ] T-0301 TokenId input + metadata lookup (best-effort)

**Goal:** Display symbol/name/decimals if available.

**Deliverables:**

- token lookup UI card
- local cache
- decimals fallback if not found (manual input)

**Acceptance:**

- campaigns can proceed even if metadata is missing
- decimals always known before amount normalization

### [ ] T-0302 CashAddr normalize/validate module

**Goal:** Single canonical implementation for address handling.

**Deliverables:**

- `src/core/util/validate.ts`
- normalize + network mismatch detection

**Acceptance:**

- detects wrong-network addresses reliably
- persists normalized address only

### [ ] T-0303 CSV import + column mapping + validation + optional duplicate merge

**Goal:** Build the recipients ingestion pipeline.

**Deliverables:**

- CSV uploader UI + preview
- column mapping (address/amount/memo)
- validation summary (valid/invalid counts)
- invalid export with reasons
- merge duplicates option

**Acceptance:**

- sample CSV with known invalid rows yields correct results
- merge duplicates sums amounts deterministically

---

## 5) Phase 4 — Airdrop Planner / Simulation

### [ ] T-0401 AirdropCampaign CRUD + list/detail UI

**Goal:** Create and persist campaigns.

**Deliverables:**

- airdrops list page
- campaign detail page
- wizard step navigation

**Acceptance:**

- create campaign → appears in list
- reload preserves everything

### [ ] T-0402 Planner (batching + fee/dust estimation)

**Goal:** Simulation shows batch count and required BCH.

**Deliverables:**

- `src/core/planner/airdropPlanner.ts`
- `src/core/tx/feeEstimator.ts`

**Acceptance:**

- changing maxOutputsPerTx updates batch count instantly
- requiredBchSat includes dust + fee

### [ ] T-0403 UTXO selection (auto/manual) + explicit shortage errors

**Goal:** Prevent “start execution then fail immediately”.

**Deliverables:**

- UTXO selection UI tables
- auto toggle
- error templates for token/BCH shortage, fragmentation, input limits

**Acceptance:**

- BCH shortage and token shortage are distinct and precise
- manual selection warns about execution risk

---

## 6) Phase 5 — Airdrop Executor (Sign/Broadcast/Resume)

### [ ] T-0501 TxBuilder: CashTokens multi-recipient transfer tx

**Goal:** Construct token send tx with change outputs.

**Deliverables:**

- `src/core/tx/tokenTxBuilder.ts`
- supports recipients outputs + token change + BCH change + optional OP_RETURN tag
- token output dust lower-bound safeguard

**Acceptance:**

- can build a tx for 10 recipients
- dust safeguard applied even if UI sets too low dust

### [ ] T-0502 LocalMnemonicSigner + signing pipeline

**Goal:** Sign locally with mnemonic-derived keys.

**Deliverables:**

- `src/core/signer/Signer.ts`
- `src/core/signer/LocalMnemonicSigner.ts`

**Acceptance:**

- unsigned → signed tx generation works
- secrets never leave local runtime

### [ ] T-0503 Executor v1: sequential batch run + txid persistence-before-broadcast

**Goal:** Make execution idempotent and resume-safe.

**Deliverables:**

- `src/core/executor/airdropExecutor.ts`
- compute txid after signing, persist SENT state, then broadcast

**Acceptance:**

- runs 3 batches sequentially
- reload → resume continues without double-paying

### [ ] T-0504 Pause/Resume/Stop + Retry failed

**Goal:** Real operational controls.

**Deliverables:**

- execute screen controls
- failure list + raw error messages
- retry semantics (same tx vs force rebuild)

**Acceptance:**

- pause then reload then resume works
- only FAILED batches retried

### [ ] T-0505 Confirmations polling + DROPPED suspicion

**Goal:** Update SENT → CONFIRMED and handle dropped cases.

**Deliverables:**

- tx status polling loop
- DROPPED suspicion heuristic (time-based or provider status)
- UX warnings

**Acceptance:**

- confirmations update over time
- stuck tx shows warning and next steps

---

## 7) Phase 6 — Auditor / Export

### [ ] T-0601 Report export (CSV/JSON/txids.txt)

**Goal:** Produce community-proof artifacts.

**Deliverables:**

- exporters in `src/core/auditor/`
- download UI

**Acceptance:**

- includes address↔amount↔status↔txid
- includes errors for failed/invalid rows

### [ ] T-0602 Batch detail modal (debug-grade)

**Goal:** Demonstrate “engine credibility” in demos.

**Deliverables:**

- raw tx hex display (optional toggle)
- inputs/outputs breakdown

**Acceptance:**

- clicking a batch shows full details

---

## 8) Phase 7 — Vesting (Lockboxes + Claim/Unlock)

### [ ] T-0701 Lockbox redeemScript generator (P2SH_CLTV_P2PKH)

**Goal:** Deterministic redeemScriptHex + P2SH address.

**Deliverables:**

- `src/core/tx/lockboxScripts.ts`

**Acceptance:**

- deterministic output for same inputs
- displays lock address correctly

### [ ] T-0702 VestingPlanner (tranche outputs planning + chunking)

**Goal:** Estimate lockbox outputs count/fees/dust.

**Deliverables:**

- `src/core/planner/vestingPlanner.ts`

**Acceptance:**

- estimates scale with beneficiaries/tranches
- chunking consistent with output limits

### [ ] T-0703 VestingExecutor (create lockboxes + persist outpoints)

**Goal:** Build and broadcast lockbox creation txs.

**Deliverables:**

- `src/core/executor/vestingExecutor.ts`

**Acceptance:**

- demo with 2 tranches works
- outpoints are stored and exported

### [ ] T-0704 Claim/Unlock page (bundle-based MVP)

**Goal:** Beneficiary can unlock without indexer.

**Deliverables:**

- `/claim/[campaignId]` route
- accepts bundle JSON (upload/paste)
- shows tranches for address
- builds unlock tx (nLockTime + non-final sequence) and broadcasts

**Acceptance:**

- shows LOCKED vs UNLOCKABLE correctly
- unlocking produces txid and updates state

---

## 9) Phase 8 — UI Finish / Demo Stability

### [ ] T-0801 Dashboard (summary cards + recent activity)

**Goal:** One-screen operational overview.

**Deliverables:**

- active wallet summary
- running jobs / failed / pending counts
- activity feed

**Acceptance:**

- updates reflect ongoing execution

### [ ] T-0802 Unified errors/warnings + toast system

**Goal:** Consistent, precise messaging.

**Deliverables:**

- centralized error templates
- toasts/modals standardized

**Acceptance:**

- representative cases show exact, consistent copy

### [ ] T-0803 Demo preset (sample CSV + forced chunk preset)

**Goal:** Demo setup in <1 minute.

**Deliverables:**

- sample CSV generation or downloadable assets
- preset: maxOutputsPerTx=10, small batch counts, vesting times

**Acceptance:**

- demo can be repeated quickly under stress

---

## 10) Phase 9 — Submission & Social (Claude writes drafts; humans post)

### [ ] T-0901 Submission-grade README improvements

**Goal:** Reviewer understands in 2 minutes.

**Deliverables:**

- What/Why/How
- Demo steps
- Limitations and MVP tradeoffs

**Acceptance:**

- a new reviewer can run demo without questions

### [ ] T-0902 2–3 minute demo script + checklist

**Goal:** Prevent demo failure.

**Deliverables:**

- exact script per screen
- plan B for provider instability

**Acceptance:**

- repeatable rehearsal

### [ ] T-0903 Social update #1 (problem + concept + wireframes)

**Deliverables:** post copy + screenshot guidance + tags
**Acceptance:** ready-to-post

### [ ] T-0904 Social update #2 (progress: planner/executor GIF)

**Deliverables:** post copy + capture steps
**Acceptance:** ready-to-post

### [ ] T-0905 Social update #3 (final: demo video + repo link)

**Deliverables:** post copy + bullets
**Acceptance:** ready-to-post

### [ ] T-0906 Post-sprint plan document (1–2 pages)

**Goal:** Show execution beyond hackathon.

**Deliverables:**

- roadmap (4/8/12 weeks)
- provider options and hardening
- SDK packaging plan
- optional hosted services (without violating local-first core)
- monetization strategy (optional)

**Acceptance:**

- structured, concise, credible
  txt
  코드 복사
