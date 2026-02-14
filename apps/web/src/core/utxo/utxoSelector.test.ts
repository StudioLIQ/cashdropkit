/**
 * UTXO Selector Tests
 */
import { describe, expect, it } from 'vitest';

import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';

import type { DistributionRequirements } from './types';
import {
  autoSelectUtxos,
  filterBchUtxos,
  filterTokenUtxos,
  formatBchAmount,
  formatTokenAmount,
  summarizeUtxos,
  validateManualSelection,
} from './utxoSelector';

// ============================================================================
// Test Helpers
// ============================================================================

const TOKEN_CATEGORY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function createBchUtxo(satoshis: bigint, confirmations: number = 6): Utxo {
  return {
    txid: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
    vout: 0,
    satoshis,
    scriptPubKey: '76a914abcdef1234567890abcdef1234567890abcdef1288ac',
    confirmations,
  };
}

function createTokenUtxo(
  tokenAmount: bigint,
  satoshis: bigint = 800n,
  confirmations: number = 6,
  category: string = TOKEN_CATEGORY
): TokenUtxo {
  return {
    txid: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
    vout: 0,
    satoshis,
    scriptPubKey: '76a914abcdef1234567890abcdef1234567890abcdef1288ac',
    confirmations,
    token: {
      category,
      amount: tokenAmount,
    },
  };
}

function createNftUtxo(satoshis: bigint = 800n, category: string = TOKEN_CATEGORY): TokenUtxo {
  return {
    txid: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
    vout: 0,
    satoshis,
    scriptPubKey: '76a914abcdef1234567890abcdef1234567890abcdef1288ac',
    confirmations: 6,
    token: {
      category,
      amount: 0n,
      nftCommitment: 'deadbeef',
      nftCapability: 'none',
    },
  };
}

function createRequirements(
  requiredTokenAmount: bigint,
  requiredBchSatoshis: bigint,
  maxInputsPerTx: number = 50
): DistributionRequirements {
  return {
    requiredTokenAmount,
    requiredBchSatoshis,
    maxInputsPerTx,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('utxoSelector', () => {
  describe('filterTokenUtxos', () => {
    it('filters by token category', () => {
      const utxos = [
        createTokenUtxo(1000n, 800n, 6, TOKEN_CATEGORY),
        createTokenUtxo(2000n, 800n, 6, 'other-category'.padEnd(64, '0')),
        createTokenUtxo(3000n, 800n, 6, TOKEN_CATEGORY),
      ];

      const { selected } = filterTokenUtxos(utxos, TOKEN_CATEGORY);
      expect(selected).toHaveLength(2);
      expect(selected.every((u) => u.token.category === TOKEN_CATEGORY)).toBe(true);
    });

    it('excludes NFTs by default', () => {
      const utxos = [createTokenUtxo(1000n), createNftUtxo(), createTokenUtxo(2000n)];

      const { selected, excludedNftCount } = filterTokenUtxos(utxos, TOKEN_CATEGORY);
      expect(selected).toHaveLength(2);
      expect(excludedNftCount).toBe(1);
    });

    it('includes NFTs when flag is true', () => {
      const utxos = [createTokenUtxo(1000n), createNftUtxo(), createTokenUtxo(2000n)];

      const { selected, excludedNftCount } = filterTokenUtxos(utxos, TOKEN_CATEGORY, true);
      expect(selected).toHaveLength(3);
      expect(excludedNftCount).toBe(0);
    });

    it('excludes zero-amount token UTXOs', () => {
      const utxos = [createTokenUtxo(1000n), createTokenUtxo(0n), createTokenUtxo(2000n)];

      const { selected } = filterTokenUtxos(utxos, TOKEN_CATEGORY);
      expect(selected).toHaveLength(2);
    });
  });

  describe('filterBchUtxos', () => {
    it('excludes dust UTXOs (< 546 sats)', () => {
      const utxos = [
        createBchUtxo(1000n),
        createBchUtxo(500n), // dust
        createBchUtxo(2000n),
        createBchUtxo(100n), // dust
      ];

      const filtered = filterBchUtxos(utxos);
      expect(filtered).toHaveLength(2);
      expect(filtered.every((u) => u.satoshis >= 546n)).toBe(true);
    });

    it('keeps UTXOs at exactly 546 sats', () => {
      const utxos = [createBchUtxo(546n)];
      const filtered = filterBchUtxos(utxos);
      expect(filtered).toHaveLength(1);
    });
  });

  describe('summarizeUtxos', () => {
    it('summarizes available UTXOs correctly', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 800n), createTokenUtxo(2000n, 1000n)];
      const bchUtxos = [createBchUtxo(5000n), createBchUtxo(3000n)];

      const summary = summarizeUtxos('address', tokenUtxos, bchUtxos, TOKEN_CATEGORY);

      expect(summary.totalTokenAmount).toBe(3000n);
      expect(summary.tokenUtxoBchSatoshis).toBe(1800n);
      expect(summary.pureBchSatoshis).toBe(8000n);
      expect(summary.totalBchSatoshis).toBe(9800n);
      expect(summary.excludedNftCount).toBe(0);
    });

    it('counts excluded NFTs', () => {
      const tokenUtxos = [createTokenUtxo(1000n), createNftUtxo(), createNftUtxo()];
      const bchUtxos: Utxo[] = [];

      const summary = summarizeUtxos('address', tokenUtxos, bchUtxos, TOKEN_CATEGORY);

      expect(summary.tokenUtxos).toHaveLength(1);
      expect(summary.excludedNftCount).toBe(2);
    });
  });

  describe('autoSelectUtxos', () => {
    it('selects largest token UTXOs first', () => {
      const tokenUtxos = [createTokenUtxo(100n), createTokenUtxo(500n), createTokenUtxo(200n)];
      const bchUtxos = [createBchUtxo(10000n)];
      const requirements = createRequirements(600n, 1000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(true);
      expect(result.selection!.tokenUtxos).toHaveLength(2);
      // Should have selected 500 + 200 = 700 (smallest needed to reach 600)
      expect(result.selection!.totalTokenAmount).toBeGreaterThanOrEqual(600n);
    });

    it('selects largest BCH UTXOs first', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 100n)];
      const bchUtxos = [createBchUtxo(500n), createBchUtxo(1000n), createBchUtxo(2000n)];
      const requirements = createRequirements(1000n, 2500n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(true);
      // Should select 2000 + 1000 BCH UTXOs (largest first)
      expect(result.selection!.bchUtxos[0].satoshis).toBe(2000n);
    });

    it('fails when insufficient tokens', () => {
      const tokenUtxos = [createTokenUtxo(500n)];
      const bchUtxos = [createBchUtxo(10000n)];
      const requirements = createRequirements(1000n, 1000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(false);
      expect(result.validation.errors.some((e) => e.type === 'INSUFFICIENT_TOKENS')).toBe(true);
    });

    it('fails when insufficient BCH', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 100n)];
      const bchUtxos = [createBchUtxo(500n)];
      const requirements = createRequirements(1000n, 10000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(false);
      expect(result.validation.errors.some((e) => e.type === 'INSUFFICIENT_BCH')).toBe(true);
    });

    it('fails when no token UTXOs', () => {
      const tokenUtxos: TokenUtxo[] = [];
      const bchUtxos = [createBchUtxo(10000n)];
      const requirements = createRequirements(1000n, 1000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(false);
      expect(result.validation.errors.some((e) => e.type === 'NO_TOKEN_UTXOS')).toBe(true);
    });

    it('fails when token UTXOs are too fragmented', () => {
      // Create 10 small token UTXOs
      const tokenUtxos = Array.from({ length: 10 }, () => createTokenUtxo(100n));
      const bchUtxos = [createBchUtxo(10000n)];
      const requirements = createRequirements(1000n, 1000n, 5); // Max 5 inputs

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(false);
      expect(result.validation.errors.some((e) => e.type === 'TOO_FRAGMENTED')).toBe(true);
    });

    it('uses BCH from token UTXOs first', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 5000n)]; // 5000 sats in token UTXO
      const bchUtxos = [createBchUtxo(10000n)];
      const requirements = createRequirements(1000n, 3000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(true);
      // Should not need any pure BCH UTXOs since token UTXO has 5000 sats
      expect(result.selection!.bchUtxos).toHaveLength(0);
    });

    it('warns about unconfirmed UTXOs', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 800n, 0)]; // 0 confirmations
      const bchUtxos = [createBchUtxo(10000n, 6)];
      const requirements = createRequirements(1000n, 1000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      expect(result.success).toBe(true);
      expect(result.validation.warnings.some((w) => w.type === 'UNCONFIRMED_INPUTS')).toBe(true);
    });

    it('respects input limit', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 100n)];
      const bchUtxos = [
        createBchUtxo(100n),
        createBchUtxo(100n),
        createBchUtxo(100n),
        createBchUtxo(100n),
      ];
      const requirements = createRequirements(1000n, 500n, 3); // Max 3 inputs

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });

      // Should only select 2 BCH UTXOs (1 token + 2 BCH = 3)
      expect(
        result.selection!.tokenUtxos.length + result.selection!.bchUtxos.length
      ).toBeLessThanOrEqual(3);
    });
  });

  describe('validateManualSelection', () => {
    it('validates sufficient selection', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(5000n);
      const requirements = createRequirements(1000n, 3000n);

      const result = validateManualSelection({
        selectedTokenOutpoints: [{ txid: tokenUtxo.txid, vout: tokenUtxo.vout }],
        selectedBchOutpoints: [{ txid: bchUtxo.txid, vout: bchUtxo.vout }],
        allTokenUtxos: [tokenUtxo],
        allBchUtxos: [bchUtxo],
        requirements,
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when insufficient tokens selected', () => {
      const tokenUtxo = createTokenUtxo(500n, 800n);
      const bchUtxo = createBchUtxo(5000n);
      const requirements = createRequirements(1000n, 3000n);

      const result = validateManualSelection({
        selectedTokenOutpoints: [{ txid: tokenUtxo.txid, vout: tokenUtxo.vout }],
        selectedBchOutpoints: [{ txid: bchUtxo.txid, vout: bchUtxo.vout }],
        allTokenUtxos: [tokenUtxo],
        allBchUtxos: [bchUtxo],
        requirements,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'INSUFFICIENT_TOKENS')).toBe(true);
      expect(result.shortages?.tokenShortage).toBe(500n);
    });

    it('fails when insufficient BCH selected', () => {
      const tokenUtxo = createTokenUtxo(1000n, 100n);
      const bchUtxo = createBchUtxo(500n);
      const requirements = createRequirements(1000n, 3000n);

      const result = validateManualSelection({
        selectedTokenOutpoints: [{ txid: tokenUtxo.txid, vout: tokenUtxo.vout }],
        selectedBchOutpoints: [{ txid: bchUtxo.txid, vout: bchUtxo.vout }],
        allTokenUtxos: [tokenUtxo],
        allBchUtxos: [bchUtxo],
        requirements,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'INSUFFICIENT_BCH')).toBe(true);
    });

    it('fails when input limit exceeded', () => {
      const tokenUtxos = Array.from({ length: 5 }, () => createTokenUtxo(200n));
      const bchUtxos = Array.from({ length: 5 }, () => createBchUtxo(1000n));
      const requirements = createRequirements(1000n, 5000n, 5); // Max 5 inputs

      const result = validateManualSelection({
        selectedTokenOutpoints: tokenUtxos.map((u) => ({ txid: u.txid, vout: u.vout })),
        selectedBchOutpoints: bchUtxos.map((u) => ({ txid: u.txid, vout: u.vout })),
        allTokenUtxos: tokenUtxos,
        allBchUtxos: bchUtxos,
        requirements,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'INPUT_LIMIT_EXCEEDED')).toBe(true);
    });
  });

  describe('formatTokenAmount', () => {
    it('formats without decimals', () => {
      expect(formatTokenAmount(1000n, 0)).toBe('1,000');
      expect(formatTokenAmount(1000000n, 0)).toBe('1,000,000');
    });

    it('formats with decimals', () => {
      expect(formatTokenAmount(100000000n, 8)).toBe('1');
      expect(formatTokenAmount(150000000n, 8)).toBe('1.5');
      expect(formatTokenAmount(123456789n, 8)).toBe('1.23456789');
    });

    it('handles fractional amounts', () => {
      expect(formatTokenAmount(1n, 8)).toBe('0.00000001');
      expect(formatTokenAmount(10n, 8)).toBe('0.0000001');
    });

    it('trims trailing zeros', () => {
      expect(formatTokenAmount(100000000n, 8)).toBe('1');
      expect(formatTokenAmount(110000000n, 8)).toBe('1.1');
    });
  });

  describe('formatBchAmount', () => {
    it('formats satoshis as BCH', () => {
      expect(formatBchAmount(100000000n)).toBe('1.00000000');
      expect(formatBchAmount(50000000n)).toBe('0.50000000');
      expect(formatBchAmount(1n)).toBe('0.00000001');
      expect(formatBchAmount(0n)).toBe('0.00000000');
    });
  });

  describe('error messages', () => {
    it('creates detailed insufficient tokens error', () => {
      const tokenUtxos = [createTokenUtxo(500n)];
      const bchUtxos = [createBchUtxo(10000n)];
      const requirements = createRequirements(1000n, 1000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });
      const error = result.validation.errors.find((e) => e.type === 'INSUFFICIENT_TOKENS');

      expect(error).toBeDefined();
      expect(error!.message).toContain('Required');
      expect(error!.message).toContain('Available');
      expect(error!.message).toContain('Missing');
      expect(error!.details.required).toBe('1000');
      expect(error!.details.available).toBe('500');
      expect(error!.details.shortage).toBe('500');
    });

    it('creates detailed insufficient BCH error', () => {
      const tokenUtxos = [createTokenUtxo(1000n, 100n)];
      const bchUtxos = [createBchUtxo(500n)];
      const requirements = createRequirements(1000n, 10000n);

      const result = autoSelectUtxos({ tokenUtxos, bchUtxos, requirements });
      const error = result.validation.errors.find((e) => e.type === 'INSUFFICIENT_BCH');

      expect(error).toBeDefined();
      expect(error!.message).toContain('BCH');
      expect(error!.message).toContain('Required');
      expect(error!.message).toContain('Missing');
    });
  });
});
