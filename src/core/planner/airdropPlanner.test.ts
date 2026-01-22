/**
 * Airdrop Planner Tests
 */
import { describe, expect, it } from 'vitest';

import type { AirdropCampaign, AirdropSettings, RecipientRow } from '@/core/db/types';

import {
  type PlannerInput,
  formatSatoshis,
  formatSatoshisAsBch,
  generatePlan,
  generatePlanFromCampaign,
  isPlanValid,
  quickEstimate,
} from './airdropPlanner';

/**
 * Generate a UUID using the built-in crypto API
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Test Helpers
// ============================================================================

function createRecipient(overrides: Partial<RecipientRow> = {}): RecipientRow {
  return {
    id: generateId(),
    address: 'bitcoincash:qr5agtachyxvrwxu76vzszan5pnvuzy8duhv4lxrsk',
    amountBase: '1000000000', // 10 tokens (8 decimals)
    valid: true,
    status: 'PENDING',
    ...overrides,
  };
}

function createRecipients(count: number): RecipientRow[] {
  return Array.from({ length: count }, () => createRecipient());
}

function createSettings(overrides: Partial<AirdropSettings> = {}): AirdropSettings {
  return {
    feeRateSatPerByte: 1.0,
    dustSatPerOutput: 800,
    maxOutputsPerTx: 80,
    maxInputsPerTx: 50,
    allowMergeDuplicates: true,
    rounding: 'floor',
    ...overrides,
  };
}

function createPlannerInput(overrides: Partial<PlannerInput> = {}): PlannerInput {
  return {
    recipients: createRecipients(100),
    settings: createSettings(),
    ...overrides,
  };
}

function createCampaign(recipientCount: number = 100): AirdropCampaign {
  return {
    id: generateId(),
    name: 'Test Campaign',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    network: 'mainnet',
    token: {
      tokenId: '0000000000000000000000000000000000000000000000000000000000000000',
      symbol: 'TEST',
      decimals: 8,
    },
    mode: 'FT',
    amountUnit: 'base',
    recipients: createRecipients(recipientCount),
    settings: createSettings(),
    funding: {
      sourceWalletId: '',
      tokenUtxoSelection: 'auto',
      bchUtxoSelection: 'auto',
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('airdropPlanner', () => {
  describe('generatePlan', () => {
    it('generates a valid plan for 100 recipients', () => {
      const input = createPlannerInput();
      const result = generatePlan(input);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.plan).toBeDefined();
      expect(result.plan!.totalRecipients).toBe(100);
    });

    it('calculates correct batch count for maxOutputsPerTx=80', () => {
      const input = createPlannerInput({
        recipients: createRecipients(100),
        settings: createSettings({ maxOutputsPerTx: 80 }),
      });
      const result = generatePlan(input);

      // 80 - 2 (changes) = 78 recipients per batch
      // 100 / 78 = 2 batches (78 + 22)
      expect(result.plan!.batches.length).toBe(2);
      expect(result.plan!.estimated.txCount).toBe(2);
    });

    it('calculates correct batch count for maxOutputsPerTx=10', () => {
      const input = createPlannerInput({
        recipients: createRecipients(100),
        settings: createSettings({ maxOutputsPerTx: 10 }),
      });
      const result = generatePlan(input);

      // 10 - 2 = 8 recipients per batch
      // 100 / 8 = 13 batches
      expect(result.plan!.batches.length).toBe(13);
    });

    it('includes all recipients in batches', () => {
      const recipients = createRecipients(50);
      const input = createPlannerInput({ recipients });
      const result = generatePlan(input);

      const allRecipientIds = result.plan!.batches.flatMap((b) => b.recipients);
      expect(allRecipientIds.length).toBe(50);

      // Each recipient should appear exactly once
      const uniqueIds = new Set(allRecipientIds);
      expect(uniqueIds.size).toBe(50);
    });

    it('calculates fees and dust', () => {
      const input = createPlannerInput({
        recipients: createRecipients(10),
        settings: createSettings({
          maxOutputsPerTx: 80,
          feeRateSatPerByte: 1.0,
          dustSatPerOutput: 800,
        }),
      });
      const result = generatePlan(input);

      expect(BigInt(result.plan!.estimated.totalFeeSat)).toBeGreaterThan(0n);
      expect(BigInt(result.plan!.estimated.totalDustSat)).toBeGreaterThan(0n);
      expect(BigInt(result.plan!.estimated.requiredBchSat)).toBe(
        BigInt(result.plan!.estimated.totalFeeSat) + BigInt(result.plan!.estimated.totalDustSat)
      );
    });

    it('filters out invalid recipients', () => {
      const recipients = [
        createRecipient({ valid: true }),
        createRecipient({ valid: false }),
        createRecipient({ valid: true }),
      ];
      const input = createPlannerInput({ recipients });
      const result = generatePlan(input);

      expect(result.plan!.totalRecipients).toBe(2);
    });

    it('fails with no valid recipients', () => {
      const recipients = [createRecipient({ valid: false }), createRecipient({ valid: false })];
      const input = createPlannerInput({ recipients });
      const result = generatePlan(input);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.type === 'NO_RECIPIENTS')).toBe(true);
    });

    it('fails with invalid settings - maxOutputsPerTx too low', () => {
      const input = createPlannerInput({
        settings: createSettings({ maxOutputsPerTx: 2 }),
      });
      const result = generatePlan(input);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.type === 'INVALID_SETTINGS')).toBe(true);
    });

    it('fails with invalid settings - feeRate too low', () => {
      const input = createPlannerInput({
        settings: createSettings({ feeRateSatPerByte: 0.5 }),
      });
      const result = generatePlan(input);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.type === 'INVALID_SETTINGS')).toBe(true);
    });

    it('fails with invalid settings - dust too low', () => {
      const input = createPlannerInput({
        settings: createSettings({ dustSatPerOutput: 100 }),
      });
      const result = generatePlan(input);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.type === 'INVALID_SETTINGS')).toBe(true);
    });

    it('warns about many batches', () => {
      const input = createPlannerInput({
        recipients: createRecipients(1000),
        settings: createSettings({ maxOutputsPerTx: 10 }),
      });
      const result = generatePlan(input);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.type === 'MANY_BATCHES')).toBe(true);
    });

    it('warns about high fee rate', () => {
      const input = createPlannerInput({
        settings: createSettings({ feeRateSatPerByte: 150 }),
      });
      const result = generatePlan(input);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.type === 'HIGH_FEE_RATE')).toBe(true);
    });

    it('warns about low dust', () => {
      const input = createPlannerInput({
        settings: createSettings({ dustSatPerOutput: 600 }),
      });
      const result = generatePlan(input);

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.type === 'LOW_DUST')).toBe(true);
    });

    it('calculates total token amount', () => {
      const recipients = [
        createRecipient({ amountBase: '1000' }),
        createRecipient({ amountBase: '2000' }),
        createRecipient({ amountBase: '3000' }),
      ];
      const input = createPlannerInput({ recipients });
      const result = generatePlan(input);

      expect(result.plan!.totalTokenAmountBase).toBe('6000');
    });

    it('assigns unique batch IDs', () => {
      const input = createPlannerInput({
        recipients: createRecipients(200),
        settings: createSettings({ maxOutputsPerTx: 80 }),
      });
      const result = generatePlan(input);

      const batchIds = result.plan!.batches.map((b) => b.id);
      const uniqueIds = new Set(batchIds);
      expect(uniqueIds.size).toBe(batchIds.length);
    });

    it('estimates size per batch', () => {
      const input = createPlannerInput();
      const result = generatePlan(input);

      for (const batch of result.plan!.batches) {
        expect(batch.estimatedSizeBytes).toBeGreaterThan(0);
        expect(batch.estimatedSizeBytes).toBeLessThan(100000); // <100KB
      }
    });
  });

  describe('generatePlanFromCampaign', () => {
    it('generates plan from campaign object', () => {
      const campaign = createCampaign(50);
      const result = generatePlanFromCampaign(campaign);

      expect(result.success).toBe(true);
      expect(result.plan!.totalRecipients).toBe(50);
    });

    it('uses campaign settings', () => {
      const campaign = createCampaign(100);
      campaign.settings.maxOutputsPerTx = 10;
      const result = generatePlanFromCampaign(campaign);

      // 10 - 2 = 8 per batch, 100/8 = 13 batches
      expect(result.plan!.batches.length).toBe(13);
    });
  });

  describe('quickEstimate', () => {
    it('returns zero for no recipients', () => {
      const estimate = quickEstimate(0, createSettings());

      expect(estimate.recipientCount).toBe(0);
      expect(estimate.batchCount).toBe(0);
      expect(estimate.estimatedTotalFee).toBe(0n);
      expect(estimate.estimatedTotalDust).toBe(0n);
      expect(estimate.estimatedTotalRequired).toBe(0n);
    });

    it('calculates estimates for 100 recipients', () => {
      const estimate = quickEstimate(100, createSettings());

      expect(estimate.recipientCount).toBe(100);
      expect(estimate.recipientsPerBatch).toBe(78);
      expect(estimate.batchCount).toBe(2);
      expect(estimate.estimatedTotalFee).toBeGreaterThan(0n);
      expect(estimate.estimatedTotalDust).toBeGreaterThan(0n);
    });

    it('scales with recipient count', () => {
      const settings = createSettings();
      const est100 = quickEstimate(100, settings);
      const est1000 = quickEstimate(1000, settings);

      expect(est1000.batchCount).toBeGreaterThan(est100.batchCount);
      expect(est1000.estimatedTotalFee).toBeGreaterThan(est100.estimatedTotalFee);
      expect(est1000.estimatedTotalDust).toBeGreaterThan(est100.estimatedTotalDust);
    });

    it('updates with maxOutputsPerTx changes', () => {
      const est80 = quickEstimate(100, createSettings({ maxOutputsPerTx: 80 }));
      const est10 = quickEstimate(100, createSettings({ maxOutputsPerTx: 10 }));

      expect(est10.batchCount).toBeGreaterThan(est80.batchCount);
      expect(est10.recipientsPerBatch).toBeLessThan(est80.recipientsPerBatch);
    });

    it('scales with fee rate', () => {
      const est1 = quickEstimate(100, createSettings({ feeRateSatPerByte: 1 }));
      const est2 = quickEstimate(100, createSettings({ feeRateSatPerByte: 2 }));

      // Fee should roughly double
      const ratio = Number(est2.estimatedTotalFee) / Number(est1.estimatedTotalFee);
      expect(ratio).toBeGreaterThan(1.8);
      expect(ratio).toBeLessThan(2.2);
    });

    it('scales with dust amount', () => {
      const est800 = quickEstimate(100, createSettings({ dustSatPerOutput: 800 }));
      const est1600 = quickEstimate(100, createSettings({ dustSatPerOutput: 1600 }));

      // Dust should roughly double
      const ratio = Number(est1600.estimatedTotalDust) / Number(est800.estimatedTotalDust);
      expect(ratio).toBeGreaterThan(1.8);
      expect(ratio).toBeLessThan(2.2);
    });
  });

  describe('isPlanValid', () => {
    it('returns false when no plan exists', () => {
      const campaign = createCampaign(100);
      expect(isPlanValid(campaign)).toBe(false);
    });

    it('returns true for valid plan', () => {
      const campaign = createCampaign(100);
      const result = generatePlanFromCampaign(campaign);
      campaign.plan = result.plan;

      expect(isPlanValid(campaign)).toBe(true);
    });

    it('returns false when recipient count changed', () => {
      const campaign = createCampaign(100);
      const result = generatePlanFromCampaign(campaign);
      campaign.plan = result.plan;

      // Add a recipient
      campaign.recipients.push(createRecipient());

      expect(isPlanValid(campaign)).toBe(false);
    });

    it('returns false when maxOutputsPerTx changed', () => {
      const campaign = createCampaign(100);
      const result = generatePlanFromCampaign(campaign);
      campaign.plan = result.plan;

      // Change setting
      campaign.settings.maxOutputsPerTx = 10;

      expect(isPlanValid(campaign)).toBe(false);
    });

    it('handles invalid recipients correctly', () => {
      const campaign = createCampaign(100);

      // Mark some as invalid
      campaign.recipients[0].valid = false;
      campaign.recipients[1].valid = false;

      const result = generatePlanFromCampaign(campaign);
      campaign.plan = result.plan;

      expect(isPlanValid(campaign)).toBe(true);

      // Now mark one more as invalid
      campaign.recipients[2].valid = false;
      expect(isPlanValid(campaign)).toBe(false);
    });
  });

  describe('formatSatoshisAsBch', () => {
    it('formats satoshis as BCH', () => {
      expect(formatSatoshisAsBch(100000000n)).toBe('1.00000000');
      expect(formatSatoshisAsBch(50000000n)).toBe('0.50000000');
      expect(formatSatoshisAsBch(1n)).toBe('0.00000001');
      expect(formatSatoshisAsBch(0n)).toBe('0.00000000');
    });

    it('accepts string input', () => {
      expect(formatSatoshisAsBch('100000000')).toBe('1.00000000');
    });
  });

  describe('formatSatoshis', () => {
    it('formats large amounts as BCH', () => {
      expect(formatSatoshis(100000000n)).toBe('1.00000000 BCH');
      expect(formatSatoshis(500000000n)).toBe('5.00000000 BCH');
    });

    it('formats small amounts as sats', () => {
      expect(formatSatoshis(1000n)).toBe('1,000 sats');
      expect(formatSatoshis(50000n)).toBe('50,000 sats');
    });

    it('uses BCH threshold at 1 BCH', () => {
      expect(formatSatoshis(99999999n)).toBe('99,999,999 sats');
      expect(formatSatoshis(100000000n)).toBe('1.00000000 BCH');
    });
  });

  describe('determinism', () => {
    it('produces same plan for same inputs', () => {
      // Use seeded recipients with known IDs
      const recipients = Array.from({ length: 50 }, (_, i) =>
        createRecipient({ id: `recipient-${i}` })
      );
      const settings = createSettings();

      const result1 = generatePlan({ recipients, settings });
      const result2 = generatePlan({ recipients, settings });

      // Batch IDs will differ (uuid), but structure should match
      expect(result1.plan!.totalRecipients).toBe(result2.plan!.totalRecipients);
      expect(result1.plan!.batches.length).toBe(result2.plan!.batches.length);
      expect(result1.plan!.estimated).toEqual(result2.plan!.estimated);

      // Recipients in each batch should be in same order
      for (let i = 0; i < result1.plan!.batches.length; i++) {
        expect(result1.plan!.batches[i].recipients).toEqual(result2.plan!.batches[i].recipients);
      }
    });
  });
});
