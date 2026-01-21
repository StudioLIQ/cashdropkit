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

- Changed files: package.json, pnpm-lock.yaml, src/core/db/\*
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

### [x] T-0102 BigInt JSON serialization (replacer/reviver) — DONE

**Goal:** BigInt-safe persistence and export/import.

**Deliverables:**

- `src/core/util/bigintJson.ts`
- shared serialization layer used everywhere

**Acceptance:**

- bigint fields round-trip without loss

**Completion Details:**

- Changed files: package.json, pnpm-lock.yaml, tsconfig.json, vitest.config.mts
- Created files:
  - `src/core/util/bigintJson.ts` — BigInt JSON serialization with replacer/reviver
  - `src/core/util/bigintJson.test.ts` — 34 unit tests for round-trip verification
  - `src/core/util/index.ts` — Public exports
- Commands run:
  - `pnpm format` — passed
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed
  - `pnpm test` — passed (34 tests)
  - `pnpm build` — passed
- Manual QA:
  - [x] BigInt values round-trip through JSON without loss
  - [x] Very large BigInt values (30+ digits) serialize correctly
  - [x] Negative BigInt values handled correctly
  - [x] Display ↔ base conversion with decimals works correctly
  - [x] Rounding modes (floor/round/ceil) work as expected
- Commit: 0c79ec03e1c068039c640ec57b1a5ada5b277236

### [x] T-0103 App lock + AES-GCM encrypted secret storage — DONE

**Goal:** Encrypt mnemonic/private materials at rest.

**Deliverables:**

- PBKDF2 key derivation
- AES-GCM encrypt/decrypt helpers
- auto-lock by idle time
- settings UI for lock config

**Acceptance:**

- secrets cannot be decrypted without passphrase
- auto-lock triggers reliably

**Completion Details:**

- Created files:
  - `src/core/crypto/kdf.ts` — PBKDF2 key derivation (SHA-256, 100k iterations)
  - `src/core/crypto/aes.ts` — AES-256-GCM encrypt/decrypt with random IV
  - `src/core/crypto/lock.ts` — AppLockManager with auto-lock timer
  - `src/core/crypto/index.ts` — Public exports
  - `src/core/crypto/crypto.test.ts` — 42 unit tests
- Commands run:
  - `pnpm format` — passed
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed
  - `pnpm test` — passed (76 total: 34 bigint + 42 crypto)
  - `pnpm build` — passed
- Manual QA:
  - [x] Secrets cannot be decrypted without correct passphrase
  - [x] Auto-lock triggers after configured idle time
  - [x] Activity resets auto-lock timer
  - [x] Passphrase change works correctly
  - [x] Round-trip encryption/decryption preserves data
- Note: Settings UI for lock config deferred to T-0104 wallet UI (will integrate there)
- Commit: 76baba77946cd1cb87393fe144eedcf246555e16

### [x] T-0104 Wallet domain + mnemonic wallet create/import UI — DONE

**Goal:** Users can create/import/select active wallet.

**Deliverables:**

- wallet list UI
- create wallet flow (backup confirmation)
- import mnemonic flow
- watch-only skeleton (optional, placeholder only)

**Acceptance:**

- active wallet selection persists across reload
- mnemonic stored encrypted

**Completion Details:**

- Changed files: package.json, pnpm-lock.yaml, src/app/(app)/wallets/page.tsx
- Created files:
  - `src/core/wallet/types.ts` — Wallet types and derivation constants
  - `src/core/wallet/cashaddr.ts` — CashAddr encode/decode for BCH
  - `src/core/wallet/mnemonic.ts` — BIP39 mnemonic + BIP32/BIP44 HD derivation
  - `src/core/wallet/walletService.ts` — Wallet CRUD + encryption operations
  - `src/core/wallet/wallet.test.ts` — 25 unit tests
  - `src/core/wallet/index.ts` — Public exports
  - `src/stores/walletStore.ts` — Zustand wallet state store
  - `src/stores/index.ts` — Store exports
  - `src/ui/components/wallet/WalletListCard.tsx` — Wallet list item
  - `src/ui/components/wallet/CreateWalletModal.tsx` — 3-step create with backup
  - `src/ui/components/wallet/ImportWalletModal.tsx` — Import existing mnemonic
  - `src/ui/components/wallet/index.ts` — Component exports
- Commands run:
  - `pnpm format` — passed
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed
  - `pnpm test` — passed (101 tests: 34 bigint + 42 crypto + 25 wallet)
  - `pnpm build` — passed
- Manual QA:
  - [x] Wallet list UI displays wallets with active indicator
  - [x] Create wallet modal has 3-step flow (form → backup → confirm)
  - [x] Import wallet validates mnemonic before saving
  - [x] Mnemonic is encrypted with AES-256-GCM before storage
  - [x] Active wallet selection persists (via settings.lastActiveWalletId)
  - [x] Delete wallet requires confirmation
  - [x] Watch-only skeleton available (createWatchOnlyWallet function)
- Commit: 9669e55c56cbb80f8d6b8cd6f70bb7630fff4448

---

## 3) Phase 2 — Chain Adapter (UTXO / Broadcast / Tx Status)

### [x] T-0201 ChainAdapter interface definition — DONE

**Goal:** Fix provider abstraction before implementation.

**Deliverables:**

- `src/core/adapters/chain/ChainAdapter.ts`
- types: UTXO, TokenUTXO, TxStatus, BlockInfo

**Acceptance:**

- planners/executors depend only on interface, not provider details

**Completion Details:**

- Created files:
  - `src/core/adapters/chain/types.ts` — Core types (Utxo, TokenUtxo, CashToken, TxStatus, BlockInfo, etc.)
  - `src/core/adapters/chain/ChainAdapter.ts` — ChainAdapter interface + registry
  - `src/core/adapters/chain/index.ts` — Public exports
  - `src/core/adapters/index.ts` — Adapters module exports
- Key types defined:
  - Utxo, TokenUtxo, CashToken — UTXO representation
  - TxStatus, TxStatusType — Transaction status tracking
  - BlockInfo, ChainTip — Block/chain info
  - AddressBalance, TokenBalance — Balance queries
  - BroadcastResult — Transaction broadcast result
  - ChainAdapterError — Typed errors with retryable flag
- Interface methods: getUtxos, getBchUtxos, getTokenUtxos, getBalance, getTokenBalances, broadcast, getTxStatus, getRawTx, getChainTip, getBlock, getBlockByHash, isHealthy, estimateFeeRate
- Commands run:
  - `pnpm typecheck` — passed
  - `pnpm lint` — passed
  - `pnpm test` — passed (101 tests)
  - `pnpm build` — passed
- Manual QA:
  - [x] Interface defines all required methods for planner/executor
  - [x] Types are provider-agnostic
  - [x] Token UTXO properly extends base UTXO
  - [x] Error types support retry classification
- Commit: 78db4526803c12f5975cc8fc44fc7d688e8944e6

### [x] T-0202 Implement 1 ChainAdapter (browser-friendly) — DONE

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

**Completion Details:**

- Changed files: package.json, pnpm-lock.yaml, src/core/adapters/chain/index.ts
- Created files:
  - `src/core/adapters/chain/electrum/types.ts` — Electrum protocol types (JSON-RPC, UTXO, Token, Block)
  - `src/core/adapters/chain/electrum/ElectrumClient.ts` — WebSocket JSON-RPC client with auto-reconnect
  - `src/core/adapters/chain/electrum/ElectrumAdapter.ts` — Full ChainAdapter implementation
  - `src/core/adapters/chain/electrum/electrum.test.ts` — Unit tests (16 tests, 3 skipped integration)
  - `src/core/adapters/chain/electrum/index.ts` — Public exports
- Features implemented:
  - UTXO methods: getUtxos, getBchUtxos, getTokenUtxos (with CashTokens support)
  - Balance methods: getBalance, getTokenBalances
  - Transaction methods: broadcast, getTxStatus, getRawTx
  - Block/chain methods: getChainTip, getBlock, getBlockByHash
  - Health methods: isHealthy, estimateFeeRate
  - Retry/backoff strategy for transient failures
  - Automatic reconnection with exponential backoff
- Commands run:
  - `pnpm format` — passed
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 0 warnings)
  - `pnpm test` — passed (114 tests, 3 skipped)
  - `pnpm build` — passed
- Manual QA:
  - [x] Interface methods match ChainAdapter contract
  - [x] Private keys/mnemonic never transmitted (adapter only handles addresses/txhex)
  - [x] Endpoints configurable via DEFAULT_ELECTRUM_ENDPOINTS
  - [x] CashTokens token_data properly parsed from UTXO responses
  - [x] Retry logic handles timeout/connection errors
  - [x] Uses existing cashaddr module for address-to-scripthash conversion
- Commit: e9397640198a90ad6fc0fd20f03c86a1d0204683

### [x] T-0203 Connection status (Connected/Degraded/Offline) — DONE

**Goal:** Reflect provider instability in UX.

**Deliverables:**

- health checks
- topbar status indicator
- retry controls

**Acceptance:**

- offline mode clearly shown
- actions fail gracefully with actionable error

**Completion Details:**

- Changed files: 4 modified, 3 created
- Created files:
  - `src/core/adapters/chain/connectionService.ts` — ConnectionService class with health checks, retry, and adapter lifecycle
  - `src/core/adapters/chain/connectionService.test.ts` — 17 unit tests for connection service
  - `src/stores/connectionStore.ts` — Zustand store for connection state (status, network, errors, retry)
- Modified files:
  - `src/core/adapters/chain/index.ts` — Export connection service
  - `src/stores/index.ts` — Export connection store
  - `src/ui/components/shell/Topbar.tsx` — Clickable status indicator with retry controls and error tooltip
  - `src/ui/components/shell/AppShell.tsx` — Wire up connection service and wallet loading
- Features implemented:
  - ConnectionService: singleton that manages ElectrumAdapter lifecycle
  - Periodic health checks (30s interval, 5s timeout)
  - Status calculation: connected (0-1 failures), degraded (2-4 failures), offline (5+ failures)
  - Retry button when offline/degraded (click status indicator)
  - Error tooltip showing last error message
  - Network switching triggers reconnection
  - Proper cleanup on unmount
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 0 warnings)
  - `pnpm format` — passed
  - `pnpm test` — passed (131 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] Offline mode clearly shown (red indicator, "Offline" label)
  - [x] Degraded mode shows amber indicator
  - [x] Connected mode shows green indicator
  - [x] Clicking offline/degraded status shows retry icon and triggers reconnection
  - [x] Error tooltip appears on hover when there's an error
  - [x] Network selector disabled during connection attempts
  - [x] Actions fail gracefully with actionable error (tooltip shows error, retry available)
- Commit: e75c4c863064e9e5b2cc9df38c3148b57df8afad

---

## 4) Phase 3 — Token Metadata / Validation / CSV

### [x] T-0301 TokenId input + metadata lookup (best-effort) — DONE

**Goal:** Display symbol/name/decimals if available.

**Deliverables:**

- token lookup UI card
- local cache
- decimals fallback if not found (manual input)

**Acceptance:**

- campaigns can proceed even if metadata is missing
- decimals always known before amount normalization

**Completion Details:**

- Changed files: 12 files (4 modified, 8 created)
- Created files:
  - `src/core/token/types.ts` — Token metadata types (TokenLookupResult, BcmrRegistry, OtrTokenEntry, etc.)
  - `src/core/token/tokenService.ts` — TokenService for fetching metadata from BCMR/OTR registries with local cache
  - `src/core/token/token.test.ts` — 24 unit tests for token service
  - `src/core/token/index.ts` — Public exports
  - `src/stores/tokenStore.ts` — Zustand store for token lookup state
  - `src/ui/components/token/TokenLookupCard.tsx` — UI component for token lookup with manual decimals fallback
  - `src/ui/components/token/index.ts` — Component exports
- Modified files:
  - `src/core/db/types.ts` — Added TokenMetadataCache type
  - `src/core/db/db.ts` — Added tokenMetadata table (v2 schema migration)
  - `src/core/db/repositories.ts` — Added tokenMetadataRepo for cache operations
  - `src/core/db/index.ts` — Export tokenMetadataRepo and TokenMetadataCache
  - `src/stores/index.ts` — Export tokenStore
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (1 warning: img element for external URLs)
  - `pnpm test` — passed (155 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] TokenLookupCard accepts 64-char hex token ID
  - [x] Fetches metadata from BCMR registry
  - [x] Falls back to OTR registry when BCMR fails
  - [x] Shows manual decimals input when metadata not found
  - [x] Caches results in IndexedDB with TTL
  - [x] Campaigns can proceed without metadata (requiresManualDecimals flag)
- Commit: bca6c7a997db5508da22a2c326ea90e5f0238305

### [x] T-0302 CashAddr normalize/validate module — DONE

**Goal:** Single canonical implementation for address handling.

**Deliverables:**

- `src/core/util/validate.ts`
- normalize + network mismatch detection

**Acceptance:**

- detects wrong-network addresses reliably
- persists normalized address only

**Completion Details:**

- Created files:
  - `src/core/util/validate.ts` — Address and amount validation with detailed errors
  - `src/core/util/validate.test.ts` — 49 unit tests
- Modified files:
  - `src/core/util/index.ts` — Export validation utilities
- Key features:
  - `validateAddress()` with network mismatch detection
  - `validateAmount()` with rounding modes (floor/round/ceil)
  - `validateRecipient()` for single row validation
  - `validateRecipientBatch()` for CSV batch validation
  - Error types: EMPTY, INVALID_FORMAT, INVALID_CHECKSUM, NETWORK_MISMATCH, UNKNOWN_PREFIX
  - Amount errors: EMPTY, NOT_A_NUMBER, NEGATIVE, ZERO, TOO_MANY_DECIMALS, OVERFLOW
- Commands run:
  - `pnpm typecheck` — passed
  - `pnpm lint` — passed
  - `pnpm test` — passed (204 tests)
  - `pnpm build` — passed
- Manual QA:
  - [x] Validates mainnet/testnet addresses correctly
  - [x] Detects network mismatch with clear error message
  - [x] Normalizes addresses to canonical form
  - [x] Amount parsing with decimal handling and rounding
  - [x] Batch validation with summary statistics
- Commit: 93dcb36459b9842949157bccabdba614bd863325

### [x] T-0303 CSV import + column mapping + validation + optional duplicate merge — DONE

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

**Completion Details:**

- Changed files: 13 files (1 modified, 12 created)
- Created files:
  - `src/core/csv/types.ts` — CSV parsing types (CsvRawRow, ColumnMapping, ValidatedRecipientRow, ValidationSummary, etc.)
  - `src/core/csv/csvParser.ts` — CSV parsing, column mapping, validation, and duplicate merge functions
  - `src/core/csv/csvParser.test.ts` — 35 unit tests
  - `src/core/csv/index.ts` — Public exports
  - `src/stores/csvStore.ts` — Zustand store for CSV import workflow state
  - `src/ui/components/csv/CsvUploader.tsx` — Drag-and-drop file upload with paste option
  - `src/ui/components/csv/ColumnMapper.tsx` — Column mapping UI with preview table
  - `src/ui/components/csv/CsvPreviewTable.tsx` — Validated rows table with filter/search
  - `src/ui/components/csv/ValidationSummary.tsx` — Summary cards with error breakdown
  - `src/ui/components/csv/index.ts` — Component exports
- Modified files:
  - `src/stores/index.ts` — Export csvStore
- Key features:
  - CSV parsing with quoted field handling and escaped quotes
  - Automatic column detection from headers (address/amount/memo patterns)
  - Address validation with network mismatch detection
  - Amount validation with rounding modes (floor/round/ceil)
  - Duplicate address detection and optional merge (sum amounts)
  - Export invalid rows as CSV with error details
  - Full validation summary with error breakdown
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (1 pre-existing warning)
  - `pnpm test` — passed (239 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] CSV parsing handles various line endings (CRLF, CR, LF)
  - [x] Quoted fields with commas and escaped quotes work correctly
  - [x] Column auto-detection works for common patterns
  - [x] Address validation detects invalid/network-mismatch addresses
  - [x] Amount validation with rounding modes works
  - [x] Duplicate merge sums amounts deterministically
  - [x] Invalid row export generates valid CSV with errors
- Commit: f03c2581e0f5c840a9d537c822149b666a0f7803

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
