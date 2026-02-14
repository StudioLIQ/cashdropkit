/**
 * Vesting Planner Tests
 */
import { describe, expect, it } from 'vitest';

import type { BeneficiaryRow, VestingCampaign, VestingSettings } from '@/core/db/types';

import {
  generateVestingPlan,
  generateVestingPlanFromCampaign,
  isVestingPlanValid,
  vestingQuickEstimate,
} from './vestingPlanner';

// ============================================================================
// Test Helpers
// ============================================================================

function makeSettings(overrides?: Partial<VestingSettings>): VestingSettings {
  return {
    feeRateSatPerByte: 1,
    dustSatPerOutput: 800,
    lockScriptType: 'P2SH_CLTV_P2PKH',
    ...overrides,
  };
}

function makeBeneficiary(
  id: string,
  address: string,
  trancheCount: number,
  valid = true
): BeneficiaryRow {
  const tranches = Array.from({ length: trancheCount }, (_, i) => ({
    id: `${id}-t${i}`,
    unlockTime: 1700000000 + i * 2592000, // monthly
    amountBase: '1000000',
    lockbox: { status: 'PLANNED' as const },
  }));

  return { id, address, tranches, valid };
}

// ============================================================================
// Tests
// ============================================================================

describe('vestingPlanner', () => {
  describe('generateVestingPlan', () => {
    it('should generate a plan for a single beneficiary with 3 tranches', () => {
      const beneficiaries = [makeBeneficiary('b1', 'bchtest:qz...', 3)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(true);
      expect(result.plan).toBeDefined();
      expect(result.plan!.totalLockboxes).toBe(3);
      expect(result.plan!.batches).toHaveLength(1);
      expect(result.plan!.batches[0].trancheIds).toHaveLength(3);
    });

    it('should generate multiple batches when tranches exceed maxOutputsPerTx', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 10)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 5, // 5 - 2 reserved = 3 per batch
      });

      expect(result.success).toBe(true);
      expect(result.plan!.totalLockboxes).toBe(10);
      // ceil(10/3) = 4 batches
      expect(result.plan!.batches).toHaveLength(4);
      expect(result.plan!.batches[0].trancheIds).toHaveLength(3);
      expect(result.plan!.batches[1].trancheIds).toHaveLength(3);
      expect(result.plan!.batches[2].trancheIds).toHaveLength(3);
      expect(result.plan!.batches[3].trancheIds).toHaveLength(1);
    });

    it('should handle multiple beneficiaries with multiple tranches', () => {
      const beneficiaries = [
        makeBeneficiary('b1', 'addr1', 3),
        makeBeneficiary('b2', 'addr2', 3),
        makeBeneficiary('b3', 'addr3', 3),
      ];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(true);
      expect(result.plan!.totalLockboxes).toBe(9);
      expect(result.plan!.batches).toHaveLength(1);
      expect(result.plan!.batches[0].trancheIds).toHaveLength(9);
    });

    it('should filter out invalid beneficiaries', () => {
      const beneficiaries = [
        makeBeneficiary('b1', 'addr1', 3, true),
        makeBeneficiary('b2', 'addr2', 3, false),
      ];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(true);
      expect(result.plan!.totalLockboxes).toBe(3);
    });

    it('should fail with no valid beneficiaries', () => {
      const result = generateVestingPlan({
        beneficiaries: [],
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('NO_BENEFICIARIES');
    });

    it('should fail with all invalid beneficiaries', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3, false)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('NO_BENEFICIARIES');
    });

    it('should fail with beneficiaries that have no tranches', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 0)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('NO_TRANCHES');
    });

    it('should fail with invalid fee rate', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings({ feeRateSatPerByte: 0 }),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('INVALID_SETTINGS');
    });

    it('should fail with dust below minimum', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings({ dustSatPerOutput: 100 }),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0].type).toBe('INVALID_SETTINGS');
    });

    it('should warn with low dust', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings({ dustSatPerOutput: 600 }),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.type === 'LOW_DUST')).toBe(true);
    });

    it('should warn with high fee rate', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings({ feeRateSatPerByte: 200 }),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.type === 'HIGH_FEE_RATE')).toBe(true);
    });

    it('should calculate estimated fees and dust', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 5)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      expect(result.success).toBe(true);
      const est = result.plan!.estimated;
      expect(BigInt(est.totalFeeSat)).toBeGreaterThan(0n);
      expect(BigInt(est.totalDustSat)).toBeGreaterThan(0n);
      expect(BigInt(est.requiredBchSat)).toBe(BigInt(est.totalFeeSat) + BigInt(est.totalDustSat));
    });

    it('should be deterministic for same inputs', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3), makeBeneficiary('b2', 'addr2', 2)];
      const settings = makeSettings();

      const result1 = generateVestingPlan({
        beneficiaries,
        settings,
        maxOutputsPerTx: 80,
      });
      const result2 = generateVestingPlan({
        beneficiaries,
        settings,
        maxOutputsPerTx: 80,
      });

      expect(result1.plan!.totalLockboxes).toBe(result2.plan!.totalLockboxes);
      expect(result1.plan!.estimated.totalFeeSat).toBe(result2.plan!.estimated.totalFeeSat);
      expect(result1.plan!.estimated.totalDustSat).toBe(result2.plan!.estimated.totalDustSat);
      expect(result1.plan!.batches.length).toBe(result2.plan!.batches.length);
      // Tranche IDs should be in same order
      expect(result1.plan!.batches[0].trancheIds).toEqual(result2.plan!.batches[0].trancheIds);
    });

    it('should have unique batch IDs', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 20)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 5,
      });

      const ids = result.plan!.batches.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should include each batch size estimate', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 5)];

      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      for (const batch of result.plan!.batches) {
        expect(batch.estimatedSizeBytes).toBeGreaterThan(0);
        expect(BigInt(batch.estimatedFeeSat)).toBeGreaterThan(0n);
      }
    });
  });

  describe('generateVestingPlanFromCampaign', () => {
    it('should generate a plan from a campaign object', () => {
      const campaign: VestingCampaign = {
        id: 'c1',
        name: 'Test Vesting',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        network: 'testnet',
        token: { tokenId: 'a'.repeat(64) },
        template: 'MONTHLY_TRANCHES',
        schedule: {
          unlockTimes: [1700000000, 1702592000],
          amountsBasePerTranche: ['500000', '500000'],
        },
        beneficiaries: [makeBeneficiary('b1', 'addr1', 2)],
        settings: makeSettings(),
        funding: { sourceWalletId: 'w1' },
      };

      const result = generateVestingPlanFromCampaign(campaign);
      expect(result.success).toBe(true);
      expect(result.plan!.totalLockboxes).toBe(2);
    });
  });

  describe('vestingQuickEstimate', () => {
    it('should return zero for no tranches', () => {
      const est = vestingQuickEstimate(0, makeSettings());
      expect(est.totalLockboxes).toBe(0);
      expect(est.batchCount).toBe(0);
      expect(est.estimatedTotalRequired).toBe(0n);
    });

    it('should estimate for simple case', () => {
      const est = vestingQuickEstimate(10, makeSettings(), 80);
      expect(est.totalLockboxes).toBe(10);
      expect(est.batchCount).toBe(1);
      expect(est.lockboxesPerBatch).toBe(78);
      expect(est.estimatedTotalFee).toBeGreaterThan(0n);
      expect(est.estimatedTotalDust).toBeGreaterThan(0n);
      expect(est.estimatedTotalRequired).toBe(est.estimatedTotalFee + est.estimatedTotalDust);
    });

    it('should scale with more lockboxes', () => {
      const est10 = vestingQuickEstimate(10, makeSettings(), 5);
      const est100 = vestingQuickEstimate(100, makeSettings(), 5);

      expect(est100.batchCount).toBeGreaterThan(est10.batchCount);
      expect(est100.estimatedTotalRequired).toBeGreaterThan(est10.estimatedTotalRequired);
    });

    it('should update batch count when maxOutputsPerTx changes', () => {
      const est5 = vestingQuickEstimate(20, makeSettings(), 5);
      const est20 = vestingQuickEstimate(20, makeSettings(), 20);
      const est80 = vestingQuickEstimate(20, makeSettings(), 80);

      expect(est5.batchCount).toBeGreaterThan(est20.batchCount);
      expect(est20.batchCount).toBeGreaterThanOrEqual(est80.batchCount);
    });
  });

  describe('isVestingPlanValid', () => {
    it('should return false when no plan exists', () => {
      const campaign: VestingCampaign = {
        id: 'c1',
        name: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        network: 'testnet',
        token: { tokenId: 'a'.repeat(64) },
        template: 'CLIFF_ONLY',
        schedule: { unlockTimes: [], amountsBasePerTranche: [] },
        beneficiaries: [makeBeneficiary('b1', 'addr1', 3)],
        settings: makeSettings(),
        funding: { sourceWalletId: 'w1' },
      };

      expect(isVestingPlanValid(campaign)).toBe(false);
    });

    it('should return true when plan matches beneficiaries', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3)];
      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      const campaign: VestingCampaign = {
        id: 'c1',
        name: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        network: 'testnet',
        token: { tokenId: 'a'.repeat(64) },
        template: 'CLIFF_ONLY',
        schedule: { unlockTimes: [], amountsBasePerTranche: [] },
        beneficiaries,
        settings: makeSettings(),
        funding: { sourceWalletId: 'w1' },
        plan: result.plan,
      };

      expect(isVestingPlanValid(campaign)).toBe(true);
    });

    it('should return false when tranches changed', () => {
      const beneficiaries = [makeBeneficiary('b1', 'addr1', 3)];
      const result = generateVestingPlan({
        beneficiaries,
        settings: makeSettings(),
        maxOutputsPerTx: 80,
      });

      // Change beneficiary tranches
      const updatedBeneficiaries = [makeBeneficiary('b1', 'addr1', 5)];

      const campaign: VestingCampaign = {
        id: 'c1',
        name: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        network: 'testnet',
        token: { tokenId: 'a'.repeat(64) },
        template: 'CLIFF_ONLY',
        schedule: { unlockTimes: [], amountsBasePerTranche: [] },
        beneficiaries: updatedBeneficiaries,
        settings: makeSettings(),
        funding: { sourceWalletId: 'w1' },
        plan: result.plan,
      };

      expect(isVestingPlanValid(campaign)).toBe(false);
    });
  });
});
