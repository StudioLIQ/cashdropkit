# CashDrop Kit

A **local-first** web console for **CashTokens airdrops and vesting (CLTV lockboxes)** with **local signing**, **chunked execution**, **pause/resume**, and **auditable reporting**.

## What

CashDrop Kit is an operations tool for BCH token distribution. It provides:

- **Airdrop campaigns**: distribute tokens to thousands of recipients with chunked execution
- **Vesting lockboxes**: create CLTV time-locked outputs for cliff/tranche vesting
- **Resume-by-design**: stop anywhere, reload, continue without duplicating payments
- **Auditable reports**: export CSV/JSON with address-amount-txid mappings
- **Beneficiary claim page**: self-serve token unlock without indexer dependency

## Why

Token distribution fails in practice for reasons beyond "how to build a transaction":

1. **Large-scale distribution breaks** -- Browser crashes, provider failures, mempool issues. Naive retries risk double-paying or missing recipients.
2. **Vesting explodes in scope** -- On-chain state machines, always-on servers, custom contracts. CashDrop Kit uses simple CLTV lockboxes instead.
3. **Operators need an engine, not a pretty UI** -- The core is a Planner -> Executor -> Auditor pipeline.

## Security Model

**Your keys never leave this device.**

- Mnemonics encrypted at rest with AES-256-GCM (PBKDF2 key derivation, 100k iterations)
- All signing happens locally in the browser (BIP143 sighash with SIGHASH_FORKID)
- Chain data comes through untrusted Electrum/Fulcrum providers
- Auto-lock on idle with configurable timeout
- See [SECURITY.md](./SECURITY.md) for the full threat model

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd cashdropkit

# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env.local

# Start web (terminal 1)
pnpm dev

# Start API (terminal 2)
pnpm dev:api
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running Tests

```bash
pnpm test          # Run all tests (550+ tests)
pnpm typecheck     # TypeScript type checking (0 errors)
pnpm lint          # ESLint
pnpm build         # Production build
```

## Demo Walkthrough (2-3 minutes)

### Setup (< 1 minute)

1. Go to **Settings** > **Demo Preset** > **Download Sample CSV**
2. Go to **Wallets** > **Create Wallet** (testnet, save mnemonic)
3. Fund the wallet with testnet BCH and a test FT token

### Airdrop Flow

1. **Airdrops** > **New Airdrop** -- Name it, select token, set network
2. **Recipients** -- Upload the sample CSV (30 rows: 27 valid + 3 invalid). Validation catches the 3 bad rows.
3. **Funding** -- Select wallet, auto-select UTXOs
4. **Simulation** -- Set `maxOutputsPerTx = 10` to force visible chunking (3+ batches). Review fees.
5. **Execute** -- Start execution. **Pause mid-way** to demonstrate resume.
6. **Reload the page** -- Go back to the campaign. **Resume** execution. No duplicate payments.
7. **Report** -- Download CSV/JSON export with txids per recipient.

### Vesting Flow

1. **Vesting** > **New Vesting** -- 2 tranches, unlock times a few minutes apart
2. **Execute** -- Creates CLTV lockbox outputs on-chain
3. **Export Claim Bundle** -- JSON file with outpoints + redeemScripts
4. **Claim Page** (`/claim/[campaignId]`) -- Upload bundle, enter beneficiary address, see LOCKED vs UNLOCKABLE tranches, click Unlock when time passes

### Key Demo Points

- **Chunked execution**: batches visible in real-time
- **Pause/Resume**: mid-execution pause survives page reload
- **Validation**: invalid CSV rows caught with precise error messages
- **Audit trail**: CSV export maps every recipient to their txid
- **Non-custodial**: mnemonic never leaves the browser

## Architecture

```
src/
  app/                     # Next.js App Router pages
    (app)/                 # Main app routes (with shell layout)
      dashboard/           # Summary cards + recent activity
      airdrops/            # Campaign list + wizard (7 steps)
      vesting/             # Vesting campaigns + lockbox creation
      wallets/             # Create/import/manage wallets
      settings/            # Config + demo presets
      claim/[campaignId]/  # Beneficiary self-serve unlock page
  core/                    # Business logic (framework-independent)
    db/                    # Dexie schema, repositories, migrations
    crypto/                # PBKDF2 + AES-GCM encryption
    signer/                # Signer interface + LocalMnemonicSigner
    adapters/chain/        # ChainAdapter interface + Electrum impl
    planner/               # Airdrop + vesting batch planning
    executor/              # Airdrop + vesting execution engines
    auditor/               # Report + claim bundle exporters
    tx/                    # Tx builder, fee estimator, lockbox scripts, unlock builder
    wallet/                # BIP39/BIP32/BIP44, CashAddr
    token/                 # BCMR/OTR metadata lookup
    csv/                   # CSV parsing, validation, duplicate merge
    util/                  # BigInt JSON, validation, error templates, demo presets
  stores/                  # Zustand state management
  ui/components/           # React UI components
    shell/                 # AppShell, Sidebar, Topbar
    airdrop/               # Campaign cards, wizard steps
    claim/                 # Claim page client
    csv/                   # CSV uploader, mapper, preview
    dashboard/             # Dashboard client
    token/                 # Token lookup card
    toasts/                # Toast notification system
    wallet/                # Wallet create/import modals
```

## Configuration

Manage all environment variables in root `.env.local`:

```bash
# Web (testnet only)
NEXT_PUBLIC_DEFAULT_NETWORK=testnet
NEXT_PUBLIC_TESTNET_ELECTRUM_URL=wss://chipnet.imaginary.cash:50004
NEXT_PUBLIC_AUTO_LOCK_MINUTES=15

# API (testnet only)
DATABASE_URL=postgresql://user:password@localhost:5432/cashdropkit
SESSION_SECRET=replace-with-random-64-char-hex
CORS_ALLOWED_ORIGINS=https://cashdropkit.com,https://www.cashdropkit.com,http://localhost:3000
API_ACCESS_TOKEN=replace-with-same-shared-api-token
ELECTRUM_TESTNET_URL=wss://chipnet.imaginary.cash:50004
```

FE의 API endpoint/token은 소스에 하드코딩되어 있습니다:
- API URL: `https://api.cashdropkit.com`
- Bearer token: `cashdropkit-public-client-token`

따라서 Vercel에는 FE API env를 넣지 않아도 됩니다.  
Railway에는 `API_ACCESS_TOKEN=cashdropkit-public-client-token`을 반드시 설정하세요.

Useful commands:

```bash
pnpm gen:session-secret
pnpm gen:api-access-token
```

Production target values:

- Web domains: `https://cashdropkit.com`, `https://www.cashdropkit.com`
- API domain: `https://api.cashdropkit.com`
- `CORS_ALLOWED_ORIGINS` must include both web domains
- `API_ACCESS_TOKEN` must match FE hardcoded token

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS
- **State**: Zustand
- **Local DB**: IndexedDB via Dexie
- **Crypto**: WebCrypto API (PBKDF2 + AES-256-GCM)
- **Signing**: @bitauth/libauth (secp256k1, BIP143 sighash)
- **HD Keys**: @scure/bip32, @noble/hashes (BIP39/BIP44)
- **Testing**: Vitest (550+ tests)

## MVP Scope

### Included

- Airdrop: create / run / pause / resume / retry / export report
- Vesting: cliff + tranches via CLTV lockboxes with claim/unlock page
- Local signing (non-custodial)
- Resume-safe execution (txid persisted before broadcast)
- CSV/JSON/txids export with per-recipient audit trail
- Claim bundle export for beneficiary self-serve unlock
- Connection health monitoring (connected/degraded/offline)
- Toast notification system with precise error messages
- Demo presets for repeatable demonstrations

### Excluded (intentional MVP tradeoffs)

- Chain-wide holder snapshot distribution
- Continuous/linear on-chain vesting (discrete tranches only)
- Multi-chain / multi-wallet enterprise support
- Hosted SaaS features (auth, billing, team roles)
- Full chain indexer for lockbox scanning (uses claim bundles instead)

## Contributing

This project is under active development for a hackathon. Contributions welcome after initial release.

## License

[MIT](./LICENSE)

## Related Links

- [CashTokens](https://cashtokens.org/)
- [mainnet-js](https://mainnet.cash/)
- [libauth](https://libauth.org/)
- [Dexie.js](https://dexie.org/)
