# CashDrop Kit

A **local-first** web console for **CashTokens airdrops and vesting (CLTV lockboxes)** with **local signing**, **chunked execution**, **pause/resume**, and **auditable reporting**.

## What

CashDrop Kit is an operations tool for BCH token distribution. It provides:

- **Airdrop campaigns**: distribute tokens to thousands of recipients with chunked execution
- **Vesting lockboxes**: create CLTV time-locked outputs for cliff/tranche vesting
- **Resume-by-design**: stop anywhere, reload, continue without duplicating payments
- **Auditable reports**: export CSV/JSON with address-amount-txid mappings

## Why

Token distribution fails in practice for reasons beyond "how to build a transaction":

1. **Large-scale distribution breaks** — Browser crashes, provider failures, mempool issues. Naive retries risk double-paying or missing recipients.
2. **Vesting explodes in scope** — On-chain state machines, always-on servers, custom contracts. CashDrop Kit uses simple CLTV lockboxes instead.
3. **Operators need an engine, not a pretty UI** — The core is a Planner -> Executor -> Auditor pipeline.

## Security Model

**Your keys never leave this device.**

- Mnemonics are encrypted at rest with AES-GCM (WebCrypto)
- All signing happens locally in the browser
- Chain data comes through untrusted providers (Electrum/Fulcrum)
- See [SECURITY.md](./SECURITY.md) for the full threat model

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/cashdropkit.git
cd cashdropkit

# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env.local

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

```bash
pnpm dev        # Start development server with Turbopack
pnpm build      # Build for production
pnpm start      # Start production server
pnpm lint       # Run ESLint with auto-fix
pnpm format     # Format code with Prettier
pnpm typecheck  # Run TypeScript type checking
```

## Demo Walkthrough

### Airdrop Flow

1. **Create Campaign** — Name, select token, set network
2. **Import Recipients** — Upload CSV (address, amount columns), validate, merge duplicates
3. **Configure Funding** — Select source wallet, set fee rate and dust
4. **Simulate Plan** — Review batch count, estimated fees, warnings
5. **Execute** — Start, pause, resume. Watch batches complete.
6. **Export Report** — Download CSV/JSON with txids per recipient

### Vesting Flow

1. **Create Vesting** — Choose cliff/tranche template
2. **Import Beneficiaries** — Address + allocation
3. **Generate Lockboxes** — Create CLTV-locked outputs
4. **Claim Page** — Beneficiaries upload claim bundle, unlock when time passes

## Project Structure

```
src/
  app/                    # Next.js App Router pages
    (app)/                # Main app routes (with shell layout)
      dashboard/
      airdrops/
      vesting/
      wallets/
      settings/
      claim/[campaignId]/
  core/                   # Business logic (to be implemented)
    db/                   # Dexie schema + repositories
    crypto/               # AES-GCM encryption helpers
    signer/               # Local signing interface
    adapters/chain/       # Provider abstraction
    planner/              # Batch planning algorithms
    executor/             # Execution engine
    auditor/              # Report exporters
    tx/                   # Transaction building utilities
  ui/
    components/
      shell/              # Sidebar, Topbar, AppShell
```

## Configuration

Edit `.env.local` to configure:

```bash
# Network: "mainnet" or "testnet"
NEXT_PUBLIC_DEFAULT_NETWORK=testnet

# Electrum endpoints
NEXT_PUBLIC_MAINNET_ELECTRUM_URL=wss://electrum.bitcoincash.network:50004
NEXT_PUBLIC_TESTNET_ELECTRUM_URL=wss://chipnet.imaginary.cash:50004

# Auto-lock timeout (minutes)
NEXT_PUBLIC_AUTO_LOCK_MINUTES=15
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode)
- **Styling**: TailwindCSS
- **State**: Zustand (planned)
- **Local DB**: IndexedDB via Dexie (planned)
- **Crypto**: WebCrypto API

## MVP Scope

### Included

- Airdrop: create / run / pause / resume / retry / export
- Vesting: cliff + tranches via CLTV lockboxes
- Local signing only
- Resume-safe execution
- CSV/JSON export with txids

### Excluded

- Chain-wide holder snapshots
- Continuous/linear on-chain vesting
- Multi-chain support
- Hosted SaaS features

## Contributing

This project is under active development for a hackathon. Contributions welcome after initial release.

## License

[MIT](./LICENSE)

## Related Links

- [CashTokens](https://cashtokens.org/)
- [mainnet-js](https://mainnet.cash/)
- [libauth](https://libauth.org/)
