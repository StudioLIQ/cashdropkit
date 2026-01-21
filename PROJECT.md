# CashDrop Kit

A **local-first** web console that standardizes **CashTokens airdrops + vesting (CLTV lockboxes)** with **local signing**, **chunked execution**, **pause/resume**, and **auditable reporting (address↔amount↔txid)**.

## 0. Overview

### 0.1 Project name

CashDrop Kit

### 0.2 One-liner

A **local-first** web console that standardizes **CashTokens airdrops + vesting (CLTV lockboxes)** with **local signing**, **chunked execution**, **pause/resume**, and **auditable reporting (address↔amount↔txid)**.

### 0.3 What problem this solves

Token distribution fails in practice for reasons that are not “how to build a transaction”:

1. **Large-scale distribution breaks**
   - Browser tab closes, network/provider fails, mempool policies change.
   - If you retry naïvely: you risk **double-paying** or **missing recipients**.
   - You often can’t produce a credible “who got what” proof tied to txids.
2. **Vesting commonly explodes in scope**
   - On-chain state machines / always-on servers / permissions / custom contracts.
   - Beneficiaries struggle to understand “when can I unlock” and “how”.
3. Operators need an **engine**, not a pretty UI
   - The product’s core is:
     - **Planner** (UTXO, fees, chunks)
     - **Executor** (sign, broadcast, retry, resume)
     - **Auditor** (reports, reproducibility)

CashDrop Kit provides an “operations standard workflow”:

- **Non-custodial by default** (keys never leave the client runtime)
- **Chunked execution** + retries + **resume**
- **Exportable proofs** (CSV/JSON mapping to txid)
- **Vesting via CLTV lockbox outputs** with a beneficiary-facing **claim/unlock** flow

---

## 1. Goals and Success Criteria

### 1.1 Top-level goals (Hackathon 2-week MVP)

- A **2–3 minute demo** that is repeatable and strong:
  - Create campaign → import CSV → simulate plan → execute → pause/resume → export report
  - Create vesting lockboxes → show unlock status → build unlock tx → broadcast
- **Resume-by-design**: stop anywhere, reload, continue without duplicating payments.
- **Auditability**: export includes txids per recipient (and errors).

### 1.2 Non-functional goals (must not be compromised)

- **Local-first / Non-custodial**
  - Mnemonic/private keys are never sent to any server.
  - Secrets are stored encrypted locally (IndexedDB, AES-GCM).
- **Reliability under failure**
  - Provider outages, transient errors, and UI crashes are expected.
  - System state must survive reloads.
- **Reproducibility**
  - Same inputs/settings should produce a consistent plan, and execution produces verifiable logs.

### 1.3 Explicit scope (to prevent scope explosion)

#### MVP includes

- Airdrop Campaign: create / run / pause / resume / retry failed / export report
- Token selection: tokenId input + metadata display (best-effort)
- Recipients: CSV import, validation, optional duplicate merge
- Fee & dust settings
- UTXO selection: token UTXOs + BCH UTXOs (auto/manual)
- Chunk planning (batches, recipients per tx)
- Execution engine: sign/broadcast/poll confirmations/retry/resume
- Report export: CSV/JSON/txids.txt
- Vesting: cliff/tranches → CLTV lockbox outputs
  - Show “unlockable vs locked”
  - Build unlock transaction (local signing) + broadcast

#### MVP excludes

- Perfect “entire chain holder snapshot” distribution
- Continuous/linear vesting computed on-chain (use discrete tranches)
- Multi-chain / multi-wallet enterprise integrations
- Fully hosted SaaS (auth, billing, team roles). Local app first.

---

## 2. Users and Key Scenarios

### 2.1 Target users

- Token project operators: airdrops, team/investor lockups
- Builders: need a reusable distribution engine later (SDK potential)
- Community managers: need proofs and post-drop reports

### 2.2 Core scenarios

1. Run a “10,000 recipient airdrop”, crash or disconnect, then **resume** from the correct point.
2. Export an auditable report to publish to the community.
3. Create vesting: “3-month cliff + 9 monthly tranches”.
4. Beneficiary checks unlock schedule and performs **self-serve unlock**.

---

## 3. Design Principles (Elegant by construction)

### 3.1 Local-first, adapter-based

- UI/state/signing/job queue are client-owned.
- Chain data + broadcasting go through a `ChainAdapter` interface.
- Swap providers without rewriting core logic.

### 3.2 The engine is the product

- UI is a wrapper around:
  - **Planner**: chunk sizing, fee/dust estimation, UTXO strategy
  - **Executor**: idempotent batching, signed tx generation, broadcast, retries, resume
  - **Auditor**: exportable proofs, deterministic campaign snapshots

---

## 4. Architecture

### 4.1 Components

**Frontend Web App (Next.js/React/TypeScript)**

- State: Zustand (MVP) or Redux Toolkit (if strict flows needed)
- Local DB: IndexedDB via Dexie
- Crypto: WebCrypto (PBKDF2 + AES-GCM)
- Background: WebWorker for tx building/signing (avoid UI freezes)

**Core modules**

- `core/db`: Dexie schema + repositories + migrations
- `core/crypto`: lock/unlock, KDF, AES-GCM, backups
- `core/signer`: signer interface + mnemonic signer
- `core/adapters/chain`: ChainAdapter interface + one implementation
- `core/planner`: airdropPlanner, vestingPlanner
- `core/executor`: airdropExecutor, vestingExecutor
- `core/auditor`: exporters, verification helpers
- `core/tx`: token tx builder, fee estimator, lockbox script utilities

### 4.2 Data flow (must remain stable)

1. CSV import → normalize/validate recipients
2. Planner → batches + estimated costs + required inputs
3. Executor per batch:
   - Select inputs → build tx skeleton → sign locally → compute txid
   - Persist txid + recipient states → broadcast → poll confirmations
4. Resume uses persisted state to skip `SENT` / `CONFIRMED`
5. Export report (CSV/JSON) with txids

---

## 5. Repository Layout (recommended)

```text
/
  PROJECT.md
  TICKET.md
  README.md
  LICENSE
  src/
    app/
      dashboard/
      airdrops/
      vesting/
      wallets/
      settings/
      claim/[campaignId]/
    core/
      db/
      crypto/
      signer/
      adapters/
        chain/
      planner/
      executor/
      auditor/
      tx/
      util/
    ui/
      components/
        wizard/
        tables/
        modals/
        toasts/
      worker/
        txWorker.ts
```

---

## 6. Domain Model (Types and Persistence)

### 6.1 Core types

```ts
export type Network = 'mainnet' | 'testnet';

export type TokenRef = {
  tokenId: string; // category hex
  symbol?: string;
  name?: string;
  decimals?: number;
  iconUrl?: string;
  verified?: boolean;
};
```

### 6.2 Airdrop campaign

Important persistence rule:

- In-memory: `bigint`
- On-disk (IndexedDB/export): `bigint` serialized as string via a shared replacer/reviver

```ts
export type AirdropCampaign = {
  id: string; // uuid
  name: string;
  createdAt: number;
  updatedAt: number;
  network: Network;
  token: TokenRef;

  mode: 'FT' | 'NFT'; // MVP focuses FT
  amountUnit: 'base' | 'display';

  recipients: RecipientRow[];

  settings: {
    feeRateSatPerByte: number; // UI allows decimal; internal uses ceil int
    dustSatPerOutput: number; // sat attached to token outputs
    maxOutputsPerTx: number; // default 80
    maxInputsPerTx: number; // prevent input explosion
    allowMergeDuplicates: boolean;
    rounding: 'floor' | 'round' | 'ceil';
  };

  funding: {
    sourceWalletId: string;
    tokenUtxoSelection: 'auto' | 'manual';
    bchUtxoSelection: 'auto' | 'manual';
    selectedTokenUtxos?: string[]; // outpoint ids
    selectedBchUtxos?: string[];
  };

  plan?: DistributionPlan;
  execution?: ExecutionState;

  tags?: string[];
  notes?: string;
};

export type RecipientRow = {
  id: string; // stable deterministic row id (not just CSV index)
  address: string; // normalized cashaddr
  amountBase: bigint;
  memo?: string;
  sourceLine?: number;

  valid: boolean;
  validationErrors?: string[];

  status: 'PENDING' | 'PLANNED' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'SKIPPED';
  batchId?: string;
  txid?: string;
  error?: string;
};
```

### 6.3 Distribution plan / batch plan

```ts
export type OutpointRef = {
  txid: string;
  vout: number;
};

export type DistributionPlan = {
  generatedAt: number;
  totalRecipients: number;
  totalTokenAmountBase: bigint;

  estimated: {
    txCount: number;
    totalFeeSat: bigint;
    totalDustSat: bigint;
    requiredBchSat: bigint;
  };

  batches: BatchPlan[];
};

export type BatchPlan = {
  id: string;
  recipients: string[]; // RecipientRow.id
  estimatedFeeSat: bigint;
  estimatedSizeBytes: number;
  tokenInputs: OutpointRef[];
  bchInputs: OutpointRef[];
  outputsCount: number;

  txid?: string; // post execution
};
```

### 6.4 Execution state (resume-critical)

```ts
export type ExecutionState = {
  state: 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  currentBatchIndex: number;

  broadcast: {
    adapterName: string;
    startedAt?: number;
    lastUpdatedAt?: number;
  };

  failures: {
    batchFailures: { batchId: string; error: string }[];
    recipientFailures: { recipientId: string; error: string }[];
  };

  confirmations: Record<
    string,
    {
      status: 'UNKNOWN' | 'SEEN' | 'CONFIRMED' | 'DROPPED';
      confirmations?: number;
      lastCheckedAt: number;
    }
  >;

  debug?: {
    storeRawTxHex?: boolean; // OFF by default
  };
};
```

### 6.5 Vesting campaign (lockboxes)

Core design:

- No continuous formula on-chain.
- Tranches = multiple locked outputs.

```ts
export type VestingCampaign = {
  id: string;
  name: string;
  createdAt: number;
  network: Network;
  token: TokenRef;

  template: 'CLIFF_ONLY' | 'MONTHLY_TRANCHES' | 'CUSTOM_TRANCHES';
  schedule: {
    unlockTimes: number[]; // unix seconds (MVP)
    amountsBasePerTranche: bigint[]; // same length
  };

  beneficiaries: BeneficiaryRow[];

  settings: {
    feeRateSatPerByte: number;
    dustSatPerOutput: number;
    lockScriptType: 'P2SH_CLTV_P2PKH'; // MVP fixed
  };

  funding: {
    sourceWalletId: string;
  };

  plan?: VestingPlan;
  execution?: ExecutionState;
};

export type BeneficiaryRow = {
  id: string;
  address: string;
  tranches: TrancheRow[];
  valid: boolean;
  errors?: string[];
};

export type TrancheRow = {
  id: string;
  unlockTime: number;
  amountBase: bigint;

  lockbox: {
    lockAddress?: string; // P2SH address
    redeemScriptHex?: string; // critical for unlock
    outpoint?: OutpointRef; // post creation
    txid?: string;
    status: 'PLANNED' | 'CREATED' | 'CONFIRMED' | 'UNLOCKED';
  };
};

export type VestingPlan = {
  generatedAt: number;
  totalLockboxes: number;
  estimated: {
    txCount: number;
    totalFeeSat: bigint;
    totalDustSat: bigint;
    requiredBchSat: bigint;
  };
  batches: {
    id: string;
    trancheIds: string[]; // TrancheRow.id
    estimatedFeeSat: bigint;
    estimatedSizeBytes: number;
  }[];
};
```

---

## 7. Core Algorithms (Implementation-level constraints)

### 7.1 Address normalization and validation

- Normalize to canonical cashaddr form.
- Reject:
  - invalid checksum
  - network mismatch (mainnet/testnet)
- Persist normalized address only.

### 7.2 Amount normalization (display → base bigint)

- UI may input decimal; internally store `bigint` base units.
- Conversion:
  - `amountBase = rounding(display * 10^decimals)`
- Reject:
  - `amountBase <= 0`
  - “too small to represent” (rounds to 0)

### 7.3 Duplicate handling

- Optional “merge duplicates by address”.
- When merging: sum `bigint` amounts with overflow checks.
- Row IDs must remain stable and deterministic:
  - Do not use CSV line index as the only identity.

### 7.4 UTXO selection strategy

Reality:

- Token UTXOs carry both token amounts and satoshis.
- Massive outputs require both dust and fees.

Auto selection (MVP default):

- Token UTXOs: choose largest fungible amounts first.
- BCH UTXOs: choose largest satoshi values first.
- Exclude NFT-bearing token UTXOs by default (safety). Allow only via advanced option.

Failure modes must be explicit:

- “Insufficient BCH for dust+fees”
- “Insufficient token amount”
- “Too fragmented UTXOs / exceeds maxInputsPerTx”

### 7.5 Chunk planning (batching)

- `maxOutputsPerTx` default 80.
- Real recipients-per-tx must subtract:
  - token change output
  - BCH change output (if needed)
  - optional OP_RETURN
- Planner must show:
  - batch count
  - recipients/tx
  - estimated total fee & dust

### 7.6 Fee estimation (MVP-safe approach)

Avoid “hand-wavy fee estimates” that break execution. Two-stage design:

- Fast approximation by counts + safety margin (15–20%).
- Preferred: build tx skeleton (pre/post signing) and measure bytes.

Executor must handle mismatch safely:

- If actual fee needed exceeds plan:
  - stop batch
  - show deficit precisely
  - attempt to add more BCH inputs if allowed

### 7.7 Executor and resume safety (idempotency)

Key rule to prevent double payment:

- After signing a tx, compute txid locally and persist it + mark recipients `SENT` **before broadcasting**.
- If the app crashes after broadcast but before saving, you can lose txid and risk rebuilding a different tx.

Pause/Resume:

- Pause: completes current batch then stops.
- Resume: skip recipients already `SENT` / `CONFIRMED`.

Retry semantics:

- Default: re-broadcast the same signed tx if possible.
- Rebuild tx (new inputs) is a “force” advanced option because txid changes.

### 7.8 Mempool/confirmation considerations

- If too many chained unconfirmed txs accumulate, policy may reject.
- Provide a guard like:
  - “wait for confirmations after N batches” (optional, off by default)

---

## 8. Vesting Lockboxes (CLTV)

### 8.1 Script template (MVP fixed)

Spending conditions:

- `nLockTime >= unlockTime`
- beneficiary signature required

Important:

- Unlock tx must set `nSequence` to a non-final value to enable locktime.

### 8.2 Tranche creation

- Many outputs (lockboxes) can be created in one tx until output limits are hit.
- If too many, create multiple txs (chunk like airdrop).

### 8.3 Beneficiary claim/unlock UX (MVP constraint)

Full on-chain scanning requires an indexer. MVP avoids that. MVP approach:

- Include a “claim bundle” in the operator’s exported report:
  - lockbox outpoints + `redeemScriptHex` per tranche
- Claim page accepts:
  - uploaded bundle JSON (or pasted)
- Then:
  - filter tranches for provided address
  - compute locked/unlockable
  - build unlock tx and broadcast (local signing)

---

## 9. UI Screens (MVP must-have)

### 9.1 Global layout

- Sidebar + topbar + main content
- Topbar:
  - Network selector
  - Connection status (Connected/Degraded/Offline)
  - Active wallet summary
  - New: (New Airdrop, New Vesting)

### 9.2 Airdrop wizard (step-by-step)

- Basics
- Token
- Recipients (CSV, mapping, validation, merge duplicates)
- Funding & Fees (wallet, fee rate, dust, UTXOs)
- Simulation (batch count, fee/dust, warnings)
- Execute (start/pause/stop/retry, batch list, recipient search)
- Report export

### 9.3 Vesting wizard

- Template selection
- Beneficiaries import
- Simulation
- Execute lockbox creation
- Claim page

### 9.4 Wallet & security

- Mnemonic wallet creation/import
- App lock (passphrase), auto-lock
- Encrypted backup export/import

---

## 10. Error and Warning Messages (Product quality hinge)

Messages must be precise, not generic. Examples:

- Token shortfall: “Required: X / Available: Y / Missing: Z”
- BCH shortfall: “Estimated required BCH: A / Available: B / Missing: C”
- CSV validation:
  - “Invalid address at line N”
  - “Amount is zero/negative at line N”
- Broadcast failure: show raw error + “Retry batch”
- Confirmation delays:
  - “Seen in mempool (0 conf)”
  - “Dropped suspected”

---

## 11. Demo Plan (must be reproducible)

- Prepare a test FT token.
- Use a 30-recipient CSV with 3 invalid rows.
- Set `maxOutputsPerTx = 10` to force visible chunking.
- During execution:
  - Pause → reload → Resume
- Export report.
- Vesting:
  - 2 tranches with unlock times a few minutes apart
  - Claim page shows `UNLOCKABLE` and performs unlock

---

## 12. Submission and Communication Deliverables (for hackathon)

- Working demo (live)
- 2–3 minute demo video
- README with reproducible steps
- License & code availability clearly stated
- Post-sprint plan (1–2 pages)
- 3 social updates (drafts prepared in tickets)

---

## 13. Reference links

- mainnet-js tutorial: https://mainnet.cash/tutorial/
- libauth: https://libauth.org/
- Dexie: https://dexie.org/
- BCMR (concept reference): https://cashtokens.org/docs/bcmr/chip/
- CashScript SDK (reference): https://cashscript.org/docs/sdk/
