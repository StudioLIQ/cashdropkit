import { describe, expect, it } from 'vitest';

import type { MigrationBundle } from './index.js';
import { computeSummary, validateBundle, verifySummary } from './index.js';

const validBundle: MigrationBundle = {
  version: '1.0.0',
  exportedAt: '2026-02-14T12:00:00Z',
  source: 'indexeddb',
  wallets: [
    { id: 'w1', name: 'Test', network: 'testnet', type: 'mnemonic', createdAt: 1, updatedAt: 1 },
  ],
  airdropCampaigns: [
    {
      id: 'a1', name: 'Campaign 1', network: 'testnet',
      token: { tokenId: 'abc' }, mode: 'FT', amountUnit: 'base',
      recipients: [{ id: 'r1' }, { id: 'r2' }],
      settings: {}, funding: {}, createdAt: 1, updatedAt: 1,
    },
  ],
  vestingCampaigns: [
    {
      id: 'v1', name: 'Vesting 1', network: 'testnet',
      token: { tokenId: 'abc' }, template: 'CLIFF_ONLY',
      schedule: {}, beneficiaries: [{ id: 'b1' }],
      settings: {}, funding: {}, createdAt: 1, updatedAt: 1,
    },
  ],
  settings: {
    network: 'testnet',
    autoLockMinutes: 15,
    requirePasswordForSigning: true,
    defaultFeeRateSatPerByte: 1,
    defaultDustSatPerOutput: 546,
    defaultMaxOutputsPerTx: 80,
  },
  summary: {
    totalWallets: 1,
    totalAirdropCampaigns: 1,
    totalVestingCampaigns: 1,
    totalRecipients: 2,
    totalBeneficiaries: 1,
  },
};

describe('migration', () => {
  describe('validateBundle', () => {
    it('validates a correct bundle', () => {
      expect(validateBundle(validBundle)).toEqual([]);
    });

    it('rejects null', () => {
      expect(validateBundle(null)).toEqual(['Bundle must be a non-null object']);
    });

    it('rejects wrong version', () => {
      const errors = validateBundle({ ...validBundle, version: '2.0.0' });
      expect(errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('rejects missing arrays', () => {
      const errors = validateBundle({ ...validBundle, wallets: 'not-array' });
      expect(errors.some((e) => e.includes('wallets'))).toBe(true);
    });

    it('detects forbidden secret fields', () => {
      const bad = {
        ...validBundle,
        wallets: [{ id: 'w1', encryptedMnemonic: 'secret', name: 'test', network: 'testnet', type: 'mnemonic', createdAt: 1, updatedAt: 1 }],
      };
      const errors = validateBundle(bad);
      expect(errors.some((e) => e.includes('SECURITY'))).toBe(true);
    });
  });

  describe('computeSummary', () => {
    it('counts correctly', () => {
      const summary = computeSummary(validBundle);
      expect(summary.totalWallets).toBe(1);
      expect(summary.totalAirdropCampaigns).toBe(1);
      expect(summary.totalVestingCampaigns).toBe(1);
      expect(summary.totalRecipients).toBe(2);
      expect(summary.totalBeneficiaries).toBe(1);
    });
  });

  describe('verifySummary', () => {
    it('returns no errors for matching summaries', () => {
      const summary = computeSummary(validBundle);
      expect(verifySummary(validBundle.summary, summary)).toEqual([]);
    });

    it('detects mismatches', () => {
      const actual = { ...validBundle.summary, totalRecipients: 5 };
      const errors = verifySummary(validBundle.summary, actual);
      expect(errors.some((e) => e.includes('totalRecipients'))).toBe(true);
    });
  });
});
