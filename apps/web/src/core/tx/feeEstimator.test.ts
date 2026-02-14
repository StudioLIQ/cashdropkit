/**
 * Fee Estimator Tests
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DUST_SATOSHIS,
  FEE_SAFETY_MARGIN,
  INPUT_SIZE_P2PKH,
  MIN_DUST_SATOSHIS,
  MIN_FEE_RATE,
  OUTPUT_SIZE_P2PKH,
  OUTPUT_SIZE_TOKEN_FT,
  TX_BASE_SIZE,
  calculateBatchCount,
  calculateRecipientsPerBatch,
  estimateFee,
  estimateTxSize,
  getVarIntSize,
  validateDust,
  validateFeeRate,
} from './feeEstimator';

describe('feeEstimator', () => {
  describe('getVarIntSize', () => {
    it('returns 1 for small counts (<253)', () => {
      expect(getVarIntSize(0)).toBe(1);
      expect(getVarIntSize(1)).toBe(1);
      expect(getVarIntSize(100)).toBe(1);
      expect(getVarIntSize(252)).toBe(1);
    });

    it('returns 3 for medium counts (253-65535)', () => {
      expect(getVarIntSize(253)).toBe(3);
      expect(getVarIntSize(1000)).toBe(3);
      expect(getVarIntSize(65535)).toBe(3);
    });

    it('returns 5 for large counts (>65535)', () => {
      expect(getVarIntSize(65536)).toBe(5);
      expect(getVarIntSize(1000000)).toBe(5);
    });
  });

  describe('estimateTxSize', () => {
    it('estimates basic transaction size correctly', () => {
      const size = estimateTxSize({
        bchInputCount: 1,
        tokenInputCount: 1,
        recipientCount: 10,
        hasTokenChange: true,
        hasBchChange: true,
        hasOpReturn: false,
      });

      // Base: 8
      // VarInt inputs: 1 (2 inputs)
      // VarInt outputs: 1 (12 outputs: 10 recipients + token change + bch change)
      // Inputs: 2 * 148 = 296
      // Outputs: 10 * 70 (recipients) + 70 (token change) + 34 (bch change) = 804
      // Total: 8 + 1 + 1 + 296 + 804 = 1110
      expect(size).toBe(1110);
    });

    it('estimates with only BCH inputs', () => {
      const size = estimateTxSize({
        bchInputCount: 3,
        tokenInputCount: 0,
        recipientCount: 5,
        hasTokenChange: false,
        hasBchChange: true,
        hasOpReturn: false,
      });

      // Base: 8
      // VarInt: 1 + 1 = 2
      // Inputs: 3 * 148 = 444
      // Outputs: 5 * 70 + 34 = 384
      // Total: 8 + 2 + 444 + 384 = 838
      expect(size).toBe(838);
    });

    it('includes OP_RETURN in size calculation', () => {
      const sizeWithout = estimateTxSize({
        bchInputCount: 1,
        tokenInputCount: 1,
        recipientCount: 5,
        hasTokenChange: true,
        hasBchChange: true,
        hasOpReturn: false,
      });

      const sizeWith = estimateTxSize({
        bchInputCount: 1,
        tokenInputCount: 1,
        recipientCount: 5,
        hasTokenChange: true,
        hasBchChange: true,
        hasOpReturn: true,
        opReturnSize: 20,
      });

      // OP_RETURN adds: 9 (header) + 20 (data) = 29
      expect(sizeWith - sizeWithout).toBe(29);
    });

    it('handles single recipient transaction', () => {
      const size = estimateTxSize({
        bchInputCount: 1,
        tokenInputCount: 1,
        recipientCount: 1,
        hasTokenChange: true,
        hasBchChange: true,
        hasOpReturn: false,
      });

      // Should be valid and positive
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(1000); // Single recipient tx should be <1KB
    });

    it('handles large batch (80 recipients)', () => {
      const size = estimateTxSize({
        bchInputCount: 2,
        tokenInputCount: 1,
        recipientCount: 80,
        hasTokenChange: true,
        hasBchChange: true,
        hasOpReturn: false,
      });

      // Should be well under 100KB limit
      expect(size).toBeGreaterThan(5000);
      expect(size).toBeLessThan(10000);
    });
  });

  describe('estimateFee', () => {
    const defaultParams = {
      bchInputCount: 1,
      tokenInputCount: 1,
      recipientCount: 10,
      hasTokenChange: true,
      hasBchChange: true,
      hasOpReturn: false,
    };

    it('calculates base fee correctly', () => {
      const estimate = estimateFee(defaultParams, 1.0, 800n);

      // Size should be 1110 (from previous test)
      expect(estimate.sizeBytes).toBe(1110);
      expect(estimate.baseFee).toBe(1110n);
    });

    it('applies safety margin to fee', () => {
      const estimate = estimateFee(defaultParams, 1.0, 800n);

      // Fee with margin = baseFee * 1.15 (rounded up)
      const expected = BigInt(Math.ceil(Number(estimate.baseFee) * FEE_SAFETY_MARGIN));
      expect(estimate.feeWithMargin).toBe(expected);
    });

    it('calculates dust for all token outputs', () => {
      const estimate = estimateFee(defaultParams, 1.0, 800n);

      // 10 recipients + 1 token change = 11 outputs
      // Dust = 11 * 800 = 8800
      expect(estimate.totalDust).toBe(8800n);
    });

    it('calculates total required BCH', () => {
      const estimate = estimateFee(defaultParams, 1.0, 800n);

      expect(estimate.totalRequired).toBe(estimate.feeWithMargin + estimate.totalDust);
    });

    it('scales with fee rate', () => {
      const estimate1 = estimateFee(defaultParams, 1.0, 800n);
      const estimate2 = estimateFee(defaultParams, 2.0, 800n);

      // Fee should roughly double (before margin)
      expect(estimate2.baseFee).toBe(estimate1.baseFee * 2n);
    });

    it('scales with dust amount', () => {
      const estimate1 = estimateFee(defaultParams, 1.0, 800n);
      const estimate2 = estimateFee(defaultParams, 1.0, 1600n);

      expect(estimate2.totalDust).toBe(estimate1.totalDust * 2n);
    });
  });

  describe('calculateRecipientsPerBatch', () => {
    it('reserves outputs for change', () => {
      const result = calculateRecipientsPerBatch({
        maxOutputsPerTx: 80,
        maxInputsPerTx: 50,
        reserveTokenChange: true,
        reserveBchChange: true,
        reserveOpReturn: false,
      });

      // 80 - 2 (changes) = 78
      expect(result).toBe(78);
    });

    it('reserves OP_RETURN when enabled', () => {
      const result = calculateRecipientsPerBatch({
        maxOutputsPerTx: 80,
        maxInputsPerTx: 50,
        reserveTokenChange: true,
        reserveBchChange: true,
        reserveOpReturn: true,
      });

      // 80 - 3 = 77
      expect(result).toBe(77);
    });

    it('returns at least 1 recipient', () => {
      const result = calculateRecipientsPerBatch({
        maxOutputsPerTx: 2, // Very small
        maxInputsPerTx: 50,
        reserveTokenChange: true,
        reserveBchChange: true,
        reserveOpReturn: false,
      });

      // Even though 2 - 2 = 0, minimum is 1
      expect(result).toBe(1);
    });

    it('handles no reserved outputs', () => {
      const result = calculateRecipientsPerBatch({
        maxOutputsPerTx: 80,
        maxInputsPerTx: 50,
        reserveTokenChange: false,
        reserveBchChange: false,
        reserveOpReturn: false,
      });

      expect(result).toBe(80);
    });
  });

  describe('calculateBatchCount', () => {
    it('calculates correct batch count', () => {
      expect(calculateBatchCount(100, 78)).toBe(2); // 78 + 22
      expect(calculateBatchCount(78, 78)).toBe(1); // Exactly 1 batch
      expect(calculateBatchCount(79, 78)).toBe(2); // Need 2 batches
      expect(calculateBatchCount(156, 78)).toBe(2); // Exactly 2 batches
    });

    it('returns 0 for no recipients', () => {
      expect(calculateBatchCount(0, 78)).toBe(0);
    });

    it('handles small batches', () => {
      expect(calculateBatchCount(10, 1)).toBe(10);
      expect(calculateBatchCount(10, 3)).toBe(4); // 3 + 3 + 3 + 1
    });
  });

  describe('validateFeeRate', () => {
    it('accepts valid fee rates', () => {
      expect(validateFeeRate(1.0).valid).toBe(true);
      expect(validateFeeRate(2.0).valid).toBe(true);
      expect(validateFeeRate(10.0).valid).toBe(true);
    });

    it('rejects fee rate below minimum', () => {
      const result = validateFeeRate(0.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(MIN_FEE_RATE.toString());
    });

    it('rejects unusually high fee rate', () => {
      const result = validateFeeRate(1001);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('1000');
    });
  });

  describe('validateDust', () => {
    it('accepts valid dust amounts', () => {
      expect(validateDust(800n).valid).toBe(true);
      expect(validateDust(1000n).valid).toBe(true);
      expect(validateDust(5000n).valid).toBe(true);
    });

    it('rejects dust below minimum', () => {
      const result = validateDust(500n);
      expect(result.valid).toBe(false);
      expect(result.error).toContain(MIN_DUST_SATOSHIS.toString());
    });

    it('warns about low dust', () => {
      const result = validateDust(600n);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain(DEFAULT_DUST_SATOSHIS.toString());
    });

    it('warns about high dust', () => {
      const result = validateDust(15000n);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('10000');
    });
  });

  describe('constants', () => {
    it('has sensible default values', () => {
      expect(TX_BASE_SIZE).toBe(8);
      expect(INPUT_SIZE_P2PKH).toBe(148);
      expect(OUTPUT_SIZE_P2PKH).toBe(34);
      expect(OUTPUT_SIZE_TOKEN_FT).toBe(70);
      expect(MIN_FEE_RATE).toBe(1.0);
      expect(MIN_DUST_SATOSHIS).toBe(546n);
      expect(DEFAULT_DUST_SATOSHIS).toBe(800n);
      expect(FEE_SAFETY_MARGIN).toBe(1.15);
    });
  });
});
