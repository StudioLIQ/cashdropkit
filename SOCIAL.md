# Social Updates

## Update #1: Problem + Concept (T-0903)

### Post Copy

**Distributing tokens at scale shouldn't require a PhD in UTXO management.**

We're building CashDrop Kit -- a local-first engine for BCH token airdrops and vesting.

The problem:
- Browser crashes mid-airdrop? You might double-pay or miss recipients.
- Vesting usually means custom contracts and always-on servers.
- Operators can't prove "who got what" after the drop.

Our approach:
- Chunked execution with pause/resume (survives crashes)
- CLTV lockboxes for vesting (no server needed)
- Auditable CSV/JSON reports with txid per recipient
- Your keys never leave the browser

Built with Next.js, TypeScript, libauth. Coming soon.

### Screenshot Guidance
- Capture the airdrop wizard simulation step showing batch count and fee estimates
- Include the dashboard with summary cards

### Tags
#BitcoinCash #CashTokens #BCH #Airdrop #Vesting #LocalFirst #OpenSource

---

## Update #2: Progress -- Planner/Executor (T-0904)

### Post Copy

**CashDrop Kit progress: the engine works.**

Planner -> Executor -> Auditor pipeline is operational:

- CSV import with validation (catches invalid addresses, wrong network, zero amounts)
- Batch planning: 30 recipients chunked into 3 batches of 10
- Sequential execution with txid persistence BEFORE broadcast
- Pause mid-execution, reload the page, resume -- no duplicate payments
- Export report: every recipient mapped to their txid

550+ unit tests. Zero TypeScript errors.

Next up: vesting lockbox creation and beneficiary claim page.

### Capture Steps (GIF)
1. Start recording on the Execute step
2. Show batches processing (1, 2, 3)
3. Click Pause after batch 2
4. Reload the page
5. Navigate back, click Resume
6. Show batch 3 completing
7. Switch to Report step, click Download CSV

### Tags
#BitcoinCash #CashTokens #BCH #BuildInPublic #Hackathon

---

## Update #3: Final -- Demo Video + Repo Link (T-0905)

### Post Copy

**CashDrop Kit is live.**

A local-first web console for BCH token distribution:

- Airdrop 10,000+ recipients with chunked execution
- CLTV vesting lockboxes with beneficiary self-serve unlock
- Resume-safe: crash anywhere, reload, continue
- Non-custodial: keys never leave your browser
- Auditable: CSV/JSON reports with txid per recipient

Built in 2 weeks for [hackathon name].

Demo: [link to video]
Repo: [link to repository]

Key stats:
- 550+ unit tests
- 9 core modules (db, crypto, signer, adapter, planner, executor, auditor, tx, wallet)
- Provider-agnostic via ChainAdapter interface
- MIT licensed

### Bullets for Video Description
- 0:00 - Dashboard overview
- 0:15 - Create airdrop campaign
- 0:30 - Import CSV + validation
- 0:45 - Simulation with forced chunking
- 1:00 - Execute with pause/resume
- 1:30 - Export report
- 1:45 - Vesting lockbox creation
- 2:15 - Beneficiary claim/unlock page
- 2:45 - Closing

### Tags
#BitcoinCash #CashTokens #BCH #Airdrop #Vesting #CLTV #OpenSource #Hackathon
