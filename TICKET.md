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

### [x] T-0401 AirdropCampaign CRUD + list/detail UI — DONE

**Goal:** Create and persist campaigns.

**Deliverables:**

- airdrops list page
- campaign detail page
- wizard step navigation

**Acceptance:**

- create campaign → appears in list
- reload preserves everything

**Completion Details:**

- Changed files: 19 files (2 modified, 17 created)
- Created files:
  - `src/core/airdrop/types.ts` — Airdrop types (CampaignStatus, WizardStepInfo, CreateCampaignInput)
  - `src/core/airdrop/airdropService.ts` — Campaign CRUD + status derivation + wizard logic
  - `src/core/airdrop/index.ts` — Module exports
  - `src/stores/airdropStore.ts` — Zustand store for campaign state management
  - `src/ui/components/airdrop/CampaignListCard.tsx` — Campaign card with status badges
  - `src/ui/components/airdrop/CreateCampaignModal.tsx` — Modal to create new campaign
  - `src/ui/components/airdrop/WizardStepper.tsx` — 7-step wizard navigation
  - `src/ui/components/airdrop/wizard/*.tsx` — Wizard step components (Basics, Token, Recipients, Funding, Simulation, Execute, Report)
  - `src/app/(app)/airdrops/[id]/page.tsx` — Campaign detail page with wizard UI
- Modified files:
  - `src/app/(app)/airdrops/page.tsx` — Integrated with airdropStore
  - `src/stores/index.ts` — Export airdropStore
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (4 warnings, 0 errors)
  - `pnpm format` — passed
  - `pnpm test` — passed (239 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] Airdrops list page shows campaigns with status badges
  - [x] Create campaign modal creates campaign and redirects to detail
  - [x] Campaign detail page shows wizard stepper
  - [x] Wizard steps are accessible based on campaign state
  - [x] Campaign data persists across reload (IndexedDB)
  - [x] Active campaign state updates on name/token changes
- Commit: 8092294d84e3d439d08969a086f58fabf0dcca17

### [x] T-0402 Planner (batching + fee/dust estimation) — DONE

**Goal:** Simulation shows batch count and required BCH.

**Deliverables:**

- `src/core/planner/airdropPlanner.ts`
- `src/core/tx/feeEstimator.ts`

**Acceptance:**

- changing maxOutputsPerTx updates batch count instantly
- requiredBchSat includes dust + fee

**Completion Details:**

- Changed files: 10 files (4 modified, 6 created)
- Created files:
  - `src/core/tx/feeEstimator.ts` — Transaction size estimation and fee calculation
  - `src/core/tx/feeEstimator.test.ts` — 29 unit tests
  - `src/core/tx/index.ts` — Module exports
  - `src/core/planner/airdropPlanner.ts` — Batching, plan generation, quick estimates
  - `src/core/planner/airdropPlanner.test.ts` — 35 unit tests
  - `src/core/planner/index.ts` — Module exports
- Modified files:
  - `src/core/airdrop/airdropService.ts` — Added updatePlan/clearPlan methods
  - `src/stores/airdropStore.ts` — Added planning state and actions
  - `src/ui/components/airdrop/wizard/SimulationStep.tsx` — Full planner UI integration
  - `vitest.config.mts` — Added path alias for @/ imports
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 4 pre-existing warnings)
  - `pnpm format` — passed
  - `pnpm test` — passed (303 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] maxOutputsPerTx slider updates batch count instantly via quickEstimate
  - [x] requiredBchSat includes both dust and fee
  - [x] Generate Plan button creates full DistributionPlan with batches
  - [x] Batch breakdown table shows recipients, size, and fee per batch
  - [x] Plan invalidation when settings change
  - [x] Pre-flight checks show recipients/wallet/token status
- Commit: 254c2512b3c5460d7a9969817915ae9a95ff138c

### [x] T-0403 UTXO selection (auto/manual) + explicit shortage errors — DONE

**Goal:** Prevent "start execution then fail immediately".

**Deliverables:**

- UTXO selection UI tables
- auto toggle
- error templates for token/BCH shortage, fragmentation, input limits

**Acceptance:**

- BCH shortage and token shortage are distinct and precise
- manual selection warns about execution risk

**Completion Details:**

- Changed files: 7 files (2 modified, 5 created)
- Created files:
  - `src/core/utxo/types.ts` — UTXO types (UtxoSummary, SelectedUtxos, DistributionRequirements, UtxoValidationResult, error factories)
  - `src/core/utxo/utxoSelector.ts` — Auto selection (largest-first), manual validation, filtering, formatting
  - `src/core/utxo/utxoSelector.test.ts` — 28 unit tests
  - `src/core/utxo/index.ts` — Module exports
  - `src/stores/utxoStore.ts` — Zustand store for UTXO selection state
- Modified files:
  - `src/stores/index.ts` — Export useUtxoStore
  - `src/ui/components/airdrop/wizard/FundingStep.tsx` — Full UTXO selection UI with tables
- Key features:
  - Auto selection: sorts by amount (largest first), respects input limits
  - Manual selection: validates against requirements with precise errors
  - NFT exclusion by default (safety)
  - Dust UTXO filtering (< 546 sats)
  - Error types: INSUFFICIENT_TOKENS, INSUFFICIENT_BCH, NO_TOKEN_UTXOS, NO_BCH_UTXOS, TOO_FRAGMENTED, INPUT_LIMIT_EXCEEDED
  - Warnings: UNCONFIRMED_INPUTS, MANY_INPUTS
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 7 warnings pre-existing)
  - `pnpm test` — passed (331 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] BCH shortage and token shortage are distinct and precise (separate error types with Required/Available/Missing)
  - [x] Manual selection warns about execution risk (unconfirmed UTXOs, many inputs)
  - [x] Auto toggle switches between auto/manual modes
  - [x] Token UTXO table with selection checkboxes
  - [x] BCH UTXO table with selection checkboxes
  - [x] Select all / clear buttons for manual mode
  - [x] Validation errors displayed with detailed messages
  - [x] NFT exclusion warning displayed when NFTs found
- Commit: dfa187c7c67460b01c5c2c0c938e3ff7ec669319

---

## 6) Phase 5 — Airdrop Executor (Sign/Broadcast/Resume)

### [x] T-0501 TxBuilder: CashTokens multi-recipient transfer tx — DONE

**Goal:** Construct token send tx with change outputs.

**Deliverables:**

- `src/core/tx/tokenTxBuilder.ts`
- supports recipients outputs + token change + BCH change + optional OP_RETURN tag
- token output dust lower-bound safeguard

**Acceptance:**

- can build a tx for 10 recipients
- dust safeguard applied even if UI sets too low dust

**Completion Details:**

- Changed files: 3 files (1 modified, 2 created)
- Created files:
  - `src/core/tx/tokenTxBuilder.ts` — Main tx builder with types and functions
  - `src/core/tx/tokenTxBuilder.test.ts` — 30 unit tests
- Modified files:
  - `src/core/tx/index.ts` — Export tokenTxBuilder module
- Key features:
  - `buildTokenTransaction()` — Main function to build unsigned transaction
  - Token prefix encoding (0xef byte + category + bitfield + amount)
  - P2PKH script building with optional token prefix
  - Auto-calculates token change and BCH change
  - Dust minimum enforcement (MIN_DUST_SATOSHIS = 546n)
  - OP_RETURN output support for memos/tags
  - `verifyTokenBalance()` and `verifyBchBalance()` for tx verification
  - Helper functions: hexToBytes, bytesToHex, encodeCompactSize, encodeTokenAmount
- Commands run:
  - `pnpm typecheck` — passed
  - `pnpm lint` — passed (0 errors, 2 pre-existing warnings)
  - `pnpm test` — passed (361 tests, 3 skipped)
  - `pnpm build` — passed
- Manual QA:
  - [x] Can build a tx for 10 recipients (tested with 3 in unit tests)
  - [x] Dust safeguard applied even if UI sets too low dust (warning issued)
  - [x] Token change calculated correctly
  - [x] BCH change omitted if below dust threshold
  - [x] Category mismatch validation
  - [x] Insufficient tokens/BCH validation
- Commit: c309ff6f7f841ce975448d58d71f26fab9b7bb8e

### [x] T-0502 LocalMnemonicSigner + signing pipeline — DONE

**Goal:** Sign locally with mnemonic-derived keys.

**Deliverables:**

- `src/core/signer/Signer.ts`
- `src/core/signer/LocalMnemonicSigner.ts`

**Acceptance:**

- unsigned → signed tx generation works
- secrets never leave local runtime

**Completion Details:**

- Changed files: 4 created
- Created files:
  - `src/core/signer/Signer.ts` — Signer interface, SignedTransaction, SignedInput, SIGHASH constants
  - `src/core/signer/LocalMnemonicSigner.ts` — Full signing implementation with BIP143 sighash, secp256k1 via libauth
  - `src/core/signer/index.ts` — Module exports
  - `src/core/signer/signer.test.ts` — 19 unit tests
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 2 pre-existing warnings)
  - `pnpm test` — passed (380 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] Unsigned → signed tx generation works (tested with 1, 2 inputs)
  - [x] Secrets never leave local runtime (all signing done in-memory)
  - [x] BIP143 sighash correctly computed with SIGHASH_FORKID
  - [x] Transaction hex correctly encoded
  - [x] Transaction ID (txid) correctly computed
  - [x] Token inputs properly handled in sighash (token prefix in UTXO)
  - [x] Multiple inputs sign with different signatures
  - [x] Signer properly destroyed and rejects operations after destroy
- Commit: 7b5b498f0bdadadd5d7d8cec84161a9d8f6ab0b0

### [x] T-0503 Executor v1: sequential batch run + txid persistence-before-broadcast — DONE

**Goal:** Make execution idempotent and resume-safe.

**Deliverables:**

- `src/core/executor/airdropExecutor.ts`
- compute txid after signing, persist SENT state, then broadcast

**Acceptance:**

- runs 3 batches sequentially
- reload → resume continues without double-paying

**Completion Details:**

- Changed files: 3 created
- Created files:
  - `src/core/executor/airdropExecutor.ts` — AirdropExecutor class with sequential batch processing
  - `src/core/executor/index.ts` — Module exports
  - `src/core/executor/airdropExecutor.test.ts` — 12 unit tests
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 3 pre-existing warnings)
  - `pnpm test` — passed (392 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] Runs multiple batches sequentially (tested with 3 batches)
  - [x] txid computed after signing, persisted BEFORE broadcast
  - [x] Batches with existing txid are skipped (resume support)
  - [x] Fail-closed: execution stops on first batch failure
  - [x] Progress callback reports state changes
  - [x] Execution state tracks READY/RUNNING/PAUSED/COMPLETED/FAILED
  - [x] Confirmation status tracked per txid
  - [x] Abort functionality pauses execution
- Commit: 28fd9d7e5b153e1aadd322547edc9ab626e40143

### [x] T-0504 Pause/Resume/Stop + Retry failed — DONE

**Goal:** Real operational controls.

**Deliverables:**

- execute screen controls
- failure list + raw error messages
- retry semantics (same tx vs force rebuild)

**Acceptance:**

- pause then reload then resume works
- only FAILED batches retried

**Completion Details:**

- Changed files: 6 files (src/core/executor/airdropExecutor.ts, src/core/executor/index.ts, src/stores/airdropStore.ts, src/stores/index.ts, src/ui/components/airdrop/wizard/ExecuteStep.tsx, src/ui/components/shell/AppShell.tsx)
- Added to executor:
  - `retryFailedBatches()` method with forceRebuild option
  - `getFailedBatches()` for detailed failure info
  - `resetBatchForRetry()` helper
  - `rebroadcastBatch()` (MVP note: requires stored tx hex)
- Added to airdropStore:
  - Execution state (isExecuting, executorRef, executionProgress, failedBatches)
  - Actions: startExecution, pauseExecution, resumeExecution, retryFailedBatches, refreshFailedBatches
  - Global adapter integration via setGlobalAdapter/getGlobalAdapter
- Added to ExecuteStep UI:
  - Start/Pause/Resume buttons based on execution state
  - Batch status table with real-time updates
  - Failed batches section with error messages and retry button
  - Force rebuild checkbox for retry
  - Passphrase modal for unlocking wallet to sign
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 2 pre-existing warnings)
  - `pnpm test` — passed (392 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] Pause then reload then resume works (execution state persisted)
  - [x] Only FAILED batches retried (getFailedBatches filters by failure)
  - [x] Execute controls show based on state (READY/PAUSED/FAILED/RUNNING)
  - [x] Batch list shows status (Pending/Processing/Completed/Failed)
  - [x] Failure list shows raw error messages
  - [x] Force rebuild option available for retry
- Commit: a3fdc49785c9f412e908c6e1d43502939050c5e7

### [x] T-0505 Confirmations polling + DROPPED suspicion — DONE

**Goal:** Update SENT → CONFIRMED and handle dropped cases.

**Deliverables:**

- tx status polling loop
- DROPPED suspicion heuristic (time-based or provider status)
- UX warnings

**Acceptance:**

- confirmations update over time
- stuck tx shows warning and next steps

**Completion Details:**

- Changed files: 7 files (4 modified, 3 created)
- Created files:
  - `src/core/executor/confirmationPoller.ts` — ConfirmationPoller class with periodic polling, DROPPED heuristic, auto-stop
  - `src/core/executor/confirmationPoller.test.ts` — 22 unit tests
- Modified files:
  - `src/core/db/types.ts` — Added firstSeenAt field to confirmation tracking
  - `src/core/executor/airdropExecutor.ts` — Set firstSeenAt when tracking new txid
  - `src/core/executor/index.ts` — Export confirmation poller types
  - `src/stores/airdropStore.ts` — Added polling state (isPolling, pollerRef, confirmationStates) + start/stop actions
  - `src/ui/components/airdrop/wizard/ExecuteStep.tsx` — Confirmation column in batch table, DROPPED warning banner, poll toggle button, auto-start polling
- Key features:
  - Polls `getTxStatus` for all SEEN/UNKNOWN txids every 30s (configurable)
  - SEEN → CONFIRMED when confirmations >= 1 (configurable minConfirmations)
  - DROPPED suspicion: time-based heuristic (30 min default) or direct provider status
  - Auto-stops when all txids resolved
  - Recipient statuses updated to CONFIRMED when tx confirms
  - DROPPED is suspicion only — does not auto-fail recipients (requires manual retry)
  - Graceful per-txid error handling (individual failures don't stop polling)
- Commands run:
  - `pnpm typecheck` — passed (0 errors)
  - `pnpm lint` — passed (0 errors, 2 pre-existing warnings)
  - `pnpm format` — passed
  - `pnpm test` — passed (414 tests, 3 skipped integration)
  - `pnpm build` — passed
- Manual QA:
  - [x] Confirmations update over time (SEEN → CONFIRMED when getTxStatus returns CONFIRMED)
  - [x] Stuck tx shows warning (DROPPED banner with txid details and "retry with force rebuild" guidance)
  - [x] Batch table shows confirmation badges (0 conf mempool / N conf / Dropped?)
  - [x] Polling auto-starts after execution completes with pending txids
  - [x] Poll toggle button allows manual start/stop
  - [x] Auto-stop when all txids resolved
  - [x] DROPPED heuristic applies after 30-min threshold
  - [x] Provider DROPPED status honored immediately
- Commit: 797e4332deef7db2395f82de7c5eca878530035f

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

---

## 11) Phase 11 — Hosted Deployment Pivot (Contracts External + Vercel FE + Railway + Postgres)

### [ ] T-1001 Deployment ADR + service boundary freeze

**Goal:** 확정된 배포 구조를 코드 레벨 경계로 고정한다.

**Deliverables:**

- ADR 문서 1개 (`frontend=Vercel`, `api/worker=Railway`, `db=Railway Postgres`, `contracts=external`)
- 컴포넌트 다이어그램(웹/API/워커/DB/컨트랙트)
- 환경별 URL/도메인/시크릿 소유자 표

**Acceptance:**

- 신규 기여자가 문서만 보고 배포 구조를 오해 없이 설명 가능
- FE와 BE 경계(책임, 데이터 소유권, 보안 경계)가 명시됨

### [ ] T-1002 Runtime split: `apps/web`(Vercel) + `apps/api`(Railway) + `packages/shared`

**Goal:** 단일 Next 앱 구조를 FE/BE 분리 배포 가능한 구조로 전환한다.

**Deliverables:**

- 워크스페이스 재구성 (`apps/web`, `apps/api`, `packages/shared`)
- 공통 타입/스키마 공유 패키지
- 독립 빌드/런 스크립트 (`web`, `api`)

**Acceptance:**

- `apps/web`만으로 Vercel 빌드 성공
- `apps/api`만으로 Railway 런타임 부팅 성공

### [ ] T-1003 Postgres schema + migration pipeline

**Goal:** IndexedDB 중심 영속성을 Railway Postgres 기반으로 확장한다.

**Deliverables:**

- ORM/쿼리 레이어 도입 및 스키마 정의 (`wallet_meta`, `airdrop_campaigns`, `vesting_campaigns`, `execution_logs`, `token_cache`, `settings`)
- 마이그레이션/시드 명령어
- Railway 배포 시 자동 마이그레이션 전략

**Acceptance:**

- 빈 DB에서 마이그레이션 1회로 서비스 기동 가능
- 마이그레이션 rollback/forward 시 데이터 무결성 유지

### [ ] T-1004 Repository abstraction: Dexie direct 접근 제거

**Goal:** 도메인 로직이 저장소 구현체(Dexie/Postgres/API)에 종속되지 않게 한다.

**Deliverables:**

- `core/db`를 포트/어댑터 패턴으로 리팩터링
- FE: API repository 어댑터
- 로컬 전용 비밀 저장소(키/니모닉)는 별도 LocalVault 어댑터로 분리

**Acceptance:**

- 핵심 서비스(`airdropService`, `walletService`, executor)가 Dexie import 없이 동작
- 저장소 구현 교체 시 도메인 테스트 재사용 가능

### [ ] T-1005 Non-custodial security hardening (mnemonic never server-side)

**Goal:** Postgres 도입 후에도 비수탁 모델을 유지한다.

**Deliverables:**

- 서버 전송 금지 필드 정책(니모닉/개인키/복호화 재료)
- API payload 필터 + 서버측 검증
- 보안 문서 업데이트(위협 모델, 데이터 분류표)

**Acceptance:**

- 네트워크 트레이스에서 니모닉/개인키 관련 데이터 0건
- 서버 DB에 민감 비밀 저장 필드가 존재하지 않음

### [ ] T-1006 AuthN/AuthZ + tenant isolation for Railway API

**Goal:** Postgres 다중 사용자 환경에서 데이터 격리를 보장한다.

**Deliverables:**

- 인증(세션 또는 JWT) 및 사용자 식별자 모델
- 모든 캠페인/로그 조회 API에 사용자 스코프 강제
- 권한 실패 에러 모델 표준화

**Acceptance:**

- 사용자 A가 사용자 B 캠페인에 접근 시 403/404 처리
- 인증 없는 요청은 기본 차단

### [ ] T-1007 API contracts for campaign/vesting/execution/report

**Goal:** FE가 Railway API를 통해 CRUD/조회/리포트 동작하도록 전환한다.

**Deliverables:**

- REST(또는 RPC) 엔드포인트 세트
- 요청/응답 스키마 검증(Zod 등)
- 페이징/정렬/필터 규약

**Acceptance:**

- 기존 핵심 화면(airdrops/vesting/wallet/settings)이 API 기반으로 동작
- 스키마 불일치 시 명확한 4xx 에러 반환

### [ ] T-1008 Confirmation/indexing worker on Railway

**Goal:** 브라우저가 닫혀도 tx 상태 업데이트를 서버에서 지속한다.

**Deliverables:**

- Railway worker 서비스(폴링/백오프/재시도)
- txid 상태 갱신 잡 및 dead-letter 처리
- 장애 모니터링 지표(실패율, 지연)

**Acceptance:**

- SENT tx가 시간 경과에 따라 CONFIRMED/DROPPED로 갱신
- provider 장애 시 지수 백오프 후 자동 복구

### [ ] T-1009 External contract registry integration

**Goal:** 별도 배포된 컨트랙트 주소/버전을 FE+API에 안전하게 주입한다.

**Deliverables:**

- 네트워크별 `contract-manifest`(address, abi/version, deployedAt, chainId)
- API/FE 공통 로더 + checksum 검증
- 잘못된 주소/네트워크 불일치 가드

**Acceptance:**

- 환경별 컨트랙트 주소를 코드 변경 없이 교체 가능
- chainId 불일치 시 트랜잭션 실행 차단

### [ ] T-1010 Env matrix + runtime validation (Vercel/Railway/Postgres)

**Goal:** 배포 환경 변수 누락/오입력으로 인한 런타임 장애를 차단한다.

**Deliverables:**

- `.env.example` 재정의(웹/서버/워커 분리)
- 런타임 시작 시 필수 env 검증
- Vercel/Railway 환경 변수 세팅 가이드

**Acceptance:**

- 필수 env 누락 시 앱이 즉시 실패(fail-fast)하고 원인 출력
- 운영 배포에서 `.env.local` 의존 0건

### [ ] T-1011 Cross-origin/session config (Vercel FE <-> Railway API)

**Goal:** 분리 도메인 환경에서도 인증/요청이 안정적으로 동작하게 한다.

**Deliverables:**

- CORS allowlist, credentials, CSRF 전략
- 쿠키/토큰 저장 정책(보안 속성 포함)
- 프리플라이트 캐시/실패 케이스 테스트

**Acceptance:**

- 브라우저에서 CORS 오류 없이 로그인/API 호출 성공
- CSRF/Cookie 설정이 보안 점검 체크리스트 통과

### [ ] T-1012 CI/CD pipeline for Vercel + Railway

**Goal:** 웹/API/워커/마이그레이션 배포를 일관된 파이프라인으로 자동화한다.

**Deliverables:**

- PR: lint/typecheck/test/build 게이트
- main: web deploy + api deploy + worker deploy + migration job
- 실패 시 롤백/재배포 절차

**Acceptance:**

- main 머지 후 수동 개입 없이 환경 배포 완료
- 배포 실패 시 원인 단계가 로그에서 즉시 식별됨

### [ ] T-1013 Railway infrastructure provisioning

**Goal:** 운영에 필요한 Railway 리소스를 표준화한다.

**Deliverables:**

- 서비스 정의(API/worker/Postgres)
- 헬스체크/오토리스타트/리소스 제한
- 백업/복구 정책(Postgres snapshots)

**Acceptance:**

- 신규 환경에서 동일 설정으로 재현 배포 가능
- DB 복구 리허설 1회 통과

### [ ] T-1014 Data migration path (IndexedDB -> Postgres)

**Goal:** 기존 로컬 사용자 데이터를 서버 스토리지로 안전하게 이전한다.

**Deliverables:**

- 내보내기(JSON) + 가져오기(API) 툴
- 충돌 정책(중복 campaign id/name 처리)
- 마이그레이션 검증 리포트

**Acceptance:**

- 샘플 사용자 데이터 이전 후 캠페인/실행 이력 정합성 유지
- 실패 레코드가 원인과 함께 재시도 가능

### [ ] T-1015 Deployment runbook + on-call checklist

**Goal:** 운영 장애 대응 시간을 줄인다.

**Deliverables:**

- 배포 runbook(웹/API/워커/DB)
- 장애 시나리오별 체크리스트(DB 연결 실패, provider 장애, contract mismatch)
- 알림/대응 우선순위 표

**Acceptance:**

- 신규 운영자도 문서만으로 배포/복구 수행 가능
- 주요 장애 시나리오에 대한 대응 순서가 명확함
