# Demo Script (2-3 minutes)

## Pre-Demo Checklist

- [ ] `pnpm dev` running on localhost:3000
- [ ] Testnet wallet created with funded BCH + test FT token
- [ ] Sample CSV downloaded from Settings > Demo Preset
- [ ] Browser devtools closed (cleaner UX)
- [ ] Screen recording ready (if recording)

## Plan B: Provider Instability

If Electrum connection fails during demo:

1. Topbar shows **Degraded** or **Offline** -- click to retry
2. If retry fails, switch to a different network endpoint in `.env.local`
3. Worst case: show the planner/simulation steps (work offline) and skip broadcast

---

## Script

### Act 1: Setup (30 seconds)

**Narrator**: "CashDrop Kit is a local-first tool for BCH token distribution. Keys never leave your browser."

1. Open **Dashboard** -- show summary cards (0 campaigns)
2. Go to **Wallets** -- show existing testnet wallet with balance
3. Go to **Settings** -- show Demo Preset section, note maxOutputsPerTx=10

### Act 2: Airdrop (90 seconds)

**Narrator**: "Let's distribute tokens to 30 recipients."

1. **Airdrops** > **New Airdrop**
   - Name: "Community Airdrop"
   - Network: testnet
   - Click Create

2. **Token Step**
   - Paste token ID
   - Show metadata lookup (or set decimals manually)

3. **Recipients Step**
   - Upload sample CSV
   - **Point out**: 27 valid, 3 invalid rows caught
   - Show validation summary with error details

4. **Funding Step**
   - Auto-select UTXOs
   - Show token + BCH balance checks

5. **Simulation Step**
   - Set `maxOutputsPerTx = 10`
   - **Point out**: "3 batches planned, estimated fees shown"
   - Click Generate Plan

6. **Execute Step**
   - Enter passphrase, click Start
   - Watch 1-2 batches complete
   - **Click Pause** mid-execution
   - **Reload the page** (F5)
   - Navigate back to the campaign
   - **Click Resume** -- execution continues from where it stopped
   - **Point out**: "No duplicate payments. txid persisted before broadcast."

7. **Report Step**
   - Click Download CSV
   - **Point out**: "Every recipient mapped to their txid"

### Act 3: Vesting (45 seconds)

**Narrator**: "Now let's create time-locked vesting."

1. **Vesting** > **New Vesting**
   - 2 tranches, unlock times 2 and 5 minutes from now
   - Execute lockbox creation

2. **Export Claim Bundle**
   - Download JSON file

3. **Claim Page** (`/claim/[campaignId]`)
   - Upload claim bundle
   - Enter beneficiary address
   - Show: first tranche **UNLOCKABLE**, second **LOCKED**
   - Click Unlock on the first tranche
   - **Point out**: "Beneficiary signs locally. No server needed."

### Closing (15 seconds)

**Narrator**: "CashDrop Kit: chunked execution, resume-safe, auditable, non-custodial. Built for operators who need reliability, not just a UI."

---

## Post-Demo Notes

- Total test coverage: 550+ unit tests
- All core logic is framework-independent (can be extracted as SDK)
- Provider-agnostic via ChainAdapter interface
- Full source available under MIT license
