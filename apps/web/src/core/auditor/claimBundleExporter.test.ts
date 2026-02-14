/**
 * Claim Bundle Exporter Tests
 */
import { describe, expect, it } from 'vitest';

import type { VestingCampaign } from '@/core/db/types';

import { buildClaimBundle, exportClaimBundle } from './claimBundleExporter';

// ============================================================================
// Test Data
// ============================================================================

function makeVestingCampaign(overrides?: Partial<VestingCampaign>): VestingCampaign {
  return {
    id: 'vc-1',
    name: 'Test Vesting',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    network: 'testnet',
    token: {
      tokenId: 'a'.repeat(64),
      symbol: 'TEST',
      decimals: 2,
    },
    template: 'MONTHLY_TRANCHES',
    schedule: {
      unlockTimes: [1700000000, 1703000000],
      amountsBasePerTranche: ['50000', '50000'],
    },
    beneficiaries: [
      {
        id: 'b1',
        address: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
        valid: true,
        tranches: [
          {
            id: 't1',
            unlockTime: 1700000000,
            amountBase: '50000',
            lockbox: {
              lockAddress: 'bchtest:ptest1lockaddr',
              redeemScriptHex: 'aabbccdd11',
              outpoint: { txid: 'ee'.repeat(32), vout: 0 },
              txid: 'ee'.repeat(32),
              status: 'CREATED',
            },
          },
          {
            id: 't2',
            unlockTime: 1703000000,
            amountBase: '50000',
            lockbox: {
              lockAddress: 'bchtest:ptest2lockaddr',
              redeemScriptHex: 'aabbccdd22',
              outpoint: { txid: 'ff'.repeat(32), vout: 1 },
              txid: 'ff'.repeat(32),
              status: 'CREATED',
            },
          },
        ],
      },
      {
        id: 'b2',
        address: 'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdpn3jdgd',
        valid: true,
        tranches: [
          {
            id: 't3',
            unlockTime: 1700000000,
            amountBase: '30000',
            lockbox: {
              lockAddress: 'bchtest:ptest3lockaddr',
              redeemScriptHex: 'aabbccdd33',
              outpoint: { txid: 'dd'.repeat(32), vout: 0 },
              txid: 'dd'.repeat(32),
              status: 'CONFIRMED',
            },
          },
        ],
      },
    ],
    settings: {
      feeRateSatPerByte: 1,
      dustSatPerOutput: 800,
      lockScriptType: 'P2SH_CLTV_P2PKH',
    },
    funding: { sourceWalletId: 'w1' },
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('claimBundleExporter', () => {
  describe('buildClaimBundle', () => {
    it('should build a claim bundle with all created tranches', () => {
      const campaign = makeVestingCampaign();
      const bundle = buildClaimBundle(campaign);

      expect(bundle.version).toBe(1);
      expect(bundle.campaignId).toBe('vc-1');
      expect(bundle.campaignName).toBe('Test Vesting');
      expect(bundle.network).toBe('testnet');
      expect(bundle.token.tokenId).toBe('a'.repeat(64));
      expect(bundle.token.symbol).toBe('TEST');
      expect(bundle.token.decimals).toBe(2);
      expect(bundle.tranches).toHaveLength(3);
    });

    it('should include correct tranche data', () => {
      const campaign = makeVestingCampaign();
      const bundle = buildClaimBundle(campaign);

      const t1 = bundle.tranches.find((t) => t.trancheId === 't1');
      expect(t1).toBeDefined();
      expect(t1!.beneficiaryAddress).toBe('bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc');
      expect(t1!.unlockTime).toBe(1700000000);
      expect(t1!.amountBase).toBe('50000');
      expect(t1!.tokenCategory).toBe('a'.repeat(64));
      expect(t1!.lockbox.lockAddress).toBe('bchtest:ptest1lockaddr');
      expect(t1!.lockbox.redeemScriptHex).toBe('aabbccdd11');
      expect(t1!.lockbox.outpoint).toEqual({ txid: 'ee'.repeat(32), vout: 0 });
      expect(t1!.lockbox.satoshis).toBe(800);
    });

    it('should include tranches from all beneficiaries', () => {
      const campaign = makeVestingCampaign();
      const bundle = buildClaimBundle(campaign);

      const b1Tranches = bundle.tranches.filter(
        (t) => t.beneficiaryAddress === 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc'
      );
      const b2Tranches = bundle.tranches.filter(
        (t) => t.beneficiaryAddress === 'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdpn3jdgd'
      );

      expect(b1Tranches).toHaveLength(2);
      expect(b2Tranches).toHaveLength(1);
    });

    it('should exclude tranches without outpoints', () => {
      const campaign = makeVestingCampaign({
        beneficiaries: [
          {
            id: 'b1',
            address: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
            valid: true,
            tranches: [
              {
                id: 't1',
                unlockTime: 1700000000,
                amountBase: '50000',
                lockbox: {
                  lockAddress: 'bchtest:ptest1',
                  redeemScriptHex: 'aabb',
                  outpoint: { txid: 'ee'.repeat(32), vout: 0 },
                  txid: 'ee'.repeat(32),
                  status: 'CREATED',
                },
              },
              {
                id: 't2',
                unlockTime: 1703000000,
                amountBase: '50000',
                lockbox: {
                  status: 'PLANNED', // no outpoint yet
                },
              },
            ],
          },
        ],
      });

      const bundle = buildClaimBundle(campaign);
      expect(bundle.tranches).toHaveLength(1);
      expect(bundle.tranches[0].trancheId).toBe('t1');
    });

    it('should exclude tranches without redeemScriptHex', () => {
      const campaign = makeVestingCampaign({
        beneficiaries: [
          {
            id: 'b1',
            address: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
            valid: true,
            tranches: [
              {
                id: 't1',
                unlockTime: 1700000000,
                amountBase: '50000',
                lockbox: {
                  lockAddress: 'bchtest:ptest1',
                  outpoint: { txid: 'ee'.repeat(32), vout: 0 },
                  txid: 'ee'.repeat(32),
                  status: 'CREATED',
                  // no redeemScriptHex
                },
              },
            ],
          },
        ],
      });

      const bundle = buildClaimBundle(campaign);
      expect(bundle.tranches).toHaveLength(0);
    });

    it('should return empty tranches for campaign with no created lockboxes', () => {
      const campaign = makeVestingCampaign({
        beneficiaries: [
          {
            id: 'b1',
            address: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
            valid: true,
            tranches: [
              {
                id: 't1',
                unlockTime: 1700000000,
                amountBase: '50000',
                lockbox: { status: 'PLANNED' },
              },
            ],
          },
        ],
      });

      const bundle = buildClaimBundle(campaign);
      expect(bundle.tranches).toHaveLength(0);
    });

    it('should use campaign dust setting for satoshis', () => {
      const campaign = makeVestingCampaign({
        settings: {
          feeRateSatPerByte: 1,
          dustSatPerOutput: 1000,
          lockScriptType: 'P2SH_CLTV_P2PKH',
        },
      });

      const bundle = buildClaimBundle(campaign);
      for (const tranche of bundle.tranches) {
        expect(tranche.lockbox.satoshis).toBe(1000);
      }
    });

    it('should set exportedAt timestamp', () => {
      const before = Date.now();
      const bundle = buildClaimBundle(makeVestingCampaign());
      const after = Date.now();

      expect(bundle.exportedAt).toBeGreaterThanOrEqual(before);
      expect(bundle.exportedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('exportClaimBundle', () => {
    it('should produce valid JSON content', () => {
      const campaign = makeVestingCampaign();
      const result = exportClaimBundle(campaign);

      expect(result.mimeType).toBe('application/json');
      expect(() => JSON.parse(result.content)).not.toThrow();

      const parsed = JSON.parse(result.content);
      expect(parsed.version).toBe(1);
      expect(parsed.tranches).toHaveLength(3);
    });

    it('should generate safe filename', () => {
      const campaign = makeVestingCampaign({ name: 'My Test/Campaign!' });
      const result = exportClaimBundle(campaign);

      expect(result.filename).toMatch(/^My_Test_Campaign__claim_bundle_/);
      expect(result.filename).toMatch(/\.json$/);
    });

    it('should truncate long campaign names in filename', () => {
      const campaign = makeVestingCampaign({ name: 'A'.repeat(100) });
      const result = exportClaimBundle(campaign);

      // 50 chars + _claim_bundle_ + timestamp + .json
      expect(result.filename.startsWith('A'.repeat(50))).toBe(true);
    });
  });
});
