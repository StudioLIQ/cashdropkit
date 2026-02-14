# Post-Sprint Plan

## Current State (Hackathon MVP)

CashDrop Kit is a working local-first web console for BCH token distribution with:
- Airdrop campaigns (create/run/pause/resume/retry/export)
- Vesting lockboxes (CLTV) with beneficiary claim/unlock
- 550+ unit tests, 0 TypeScript errors
- Non-custodial, resume-safe, auditable

## Roadmap

### Week 4-6: Hardening

**Goal**: Production-ready reliability.

- [ ] End-to-end integration tests with testnet (real broadcasts)
- [ ] Fee estimation refinement (build tx skeleton, measure exact bytes)
- [ ] Mempool chain limit guard (wait for confirmations after N batches)
- [ ] Error recovery improvements (partial batch retry, input substitution)
- [ ] WebWorker for signing (avoid UI freezes on large batches)
- [ ] Performance profiling for 1,000+ recipient campaigns

### Week 6-8: Provider Options

**Goal**: Reduce single-provider dependency.

- [ ] Second ChainAdapter implementation (e.g., Chaingraph, REST API)
- [ ] Automatic provider failover (try secondary when primary fails)
- [ ] Fee rate estimation from network (replace static default)
- [ ] UTXO consolidation tool (reduce fragmentation before airdrops)

### Week 8-12: SDK Packaging

**Goal**: Reusable distribution engine.

- [ ] Extract `core/` as standalone npm package (`@cashdropkit/core`)
- [ ] Framework-independent API (works in Node.js, Deno, browser)
- [ ] CLI tool for scripted/automated distributions
- [ ] TypeDoc documentation for all public APIs
- [ ] Example integrations (Node.js script, React app, Express server)

## Optional Hosted Services

These extend the local-first core without replacing it:

### Campaign Dashboard (SaaS)

- Hosted campaign status page (read-only, no keys)
- Shareable URL for stakeholders to monitor progress
- Webhook notifications (batch completed, execution failed)

### Claim Portal

- Hosted claim page with campaign discovery
- QR code for beneficiary onboarding
- Push notifications when tranches unlock

### Analytics

- Token distribution analytics (concentration, timing)
- Fee efficiency reports across campaigns
- Historical campaign comparisons

**Important**: The core engine always runs client-side. Hosted services are optional layers for convenience, not custody.

## Monetization Strategy (Optional)

### Open Core Model

- **Free forever**: Core engine, CLI, local-first web app
- **Paid**: Hosted dashboard, analytics, webhook notifications, priority support

### Enterprise Features (Future)

- Multi-signer workflows (requires threshold signing)
- Compliance reporting templates
- SLA-backed provider endpoints
- Custom branding for claim pages

## Technical Debt to Address

1. **Settings page**: Currently mostly static. Wire to IndexedDB settings.
2. **Vesting wizard UI**: Needs step-by-step wizard similar to airdrops.
3. **NFT distribution**: Mode='NFT' is defined but not implemented.
4. **Batch detail modal**: Could show raw tx hex (optional toggle exists but needs tx storage).
5. **Mobile responsiveness**: Current layout assumes desktop/tablet.

## Conclusion

The MVP demonstrates a reliable, non-custodial token distribution engine. The architecture (adapter pattern, framework-independent core, BigInt-safe persistence) was designed from day 1 for extensibility. The path from hackathon to production is incremental hardening, not a rewrite.
