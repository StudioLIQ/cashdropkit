/**
 * Token Transaction Builder Tests
 */
import { describe, expect, it } from 'vitest';

import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import { encodeCashAddr } from '@/core/wallet/cashaddr';

import { MIN_DUST_SATOSHIS } from './feeEstimator';
import {
  addressToPubkeyHash,
  buildOpReturnScript,
  buildP2PKHScript,
  buildTokenP2PKHScript,
  buildTokenPrefix,
  buildTokenTransaction,
  bytesToHex,
  encodeCompactSize,
  encodeTokenAmount,
  hexToBytes,
  verifyBchBalance,
  verifyTokenBalance,
} from './tokenTxBuilder';

// ============================================================================
// Test Helpers
// ============================================================================

const TOKEN_CATEGORY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

// Generate valid test addresses using known hash
const TEST_HASH_1 = new Uint8Array([
  0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
  0x12, 0x34, 0x56, 0x78,
]);
const TEST_HASH_2 = new Uint8Array([
  0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89,
  0xab, 0xcd, 0xef, 0x01,
]);
const MAINNET_ADDRESS = encodeCashAddr('mainnet', 'P2PKH', TEST_HASH_1);
const MAINNET_ADDRESS_2 = encodeCashAddr('mainnet', 'P2PKH', TEST_HASH_2);

function createTokenUtxo(
  tokenAmount: bigint,
  satoshis: bigint = 800n,
  category: string = TOKEN_CATEGORY
): TokenUtxo {
  return {
    txid: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
    vout: 0,
    satoshis,
    scriptPubKey: '76a914abcdef1234567890abcdef1234567890abcdef1288ac',
    confirmations: 6,
    token: {
      category,
      amount: tokenAmount,
    },
  };
}

function createBchUtxo(satoshis: bigint): Utxo {
  return {
    txid: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
    vout: 0,
    satoshis,
    scriptPubKey: '76a914abcdef1234567890abcdef1234567890abcdef1288ac',
    confirmations: 6,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('tokenTxBuilder', () => {
  describe('hexToBytes / bytesToHex', () => {
    it('converts hex to bytes correctly', () => {
      const hex = 'deadbeef';
      const bytes = hexToBytes(hex);
      expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    });

    it('converts bytes to hex correctly', () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const hex = bytesToHex(bytes);
      expect(hex).toBe('deadbeef');
    });

    it('round-trips correctly', () => {
      const original = 'abcdef0123456789';
      expect(bytesToHex(hexToBytes(original))).toBe(original);
    });
  });

  describe('encodeCompactSize', () => {
    it('encodes values < 253 as single byte', () => {
      expect(encodeCompactSize(0n)).toEqual(new Uint8Array([0]));
      expect(encodeCompactSize(100n)).toEqual(new Uint8Array([100]));
      expect(encodeCompactSize(252n)).toEqual(new Uint8Array([252]));
    });

    it('encodes values 253-65535 as 3 bytes', () => {
      const result = encodeCompactSize(253n);
      expect(result.length).toBe(3);
      expect(result[0]).toBe(253);
    });

    it('encodes larger values as 5 bytes', () => {
      const result = encodeCompactSize(70000n);
      expect(result.length).toBe(5);
      expect(result[0]).toBe(254);
    });
  });

  describe('encodeTokenAmount', () => {
    it('encodes small amounts correctly', () => {
      expect(encodeTokenAmount(0n)).toEqual(new Uint8Array([0]));
      expect(encodeTokenAmount(1n)).toEqual(new Uint8Array([1]));
      expect(encodeTokenAmount(127n)).toEqual(new Uint8Array([127]));
    });

    it('encodes amounts >= 128 with continuation bit', () => {
      // 128 = 0x80 = 10000000 in binary
      // varint: 0x80 | 0x80, 0x01 = 10000000 00000001
      const result = encodeTokenAmount(128n);
      expect(result[0] & 0x80).toBe(0x80); // continuation bit set
      expect(result.length).toBe(2);
    });

    it('encodes large amounts correctly', () => {
      // 1000000 tokens
      const result = encodeTokenAmount(1000000n);
      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe('buildP2PKHScript', () => {
    it('builds correct P2PKH script', () => {
      const hash = new Uint8Array(20).fill(0xab);
      const script = buildP2PKHScript(hash);

      expect(script.length).toBe(25);
      expect(script[0]).toBe(0x76); // OP_DUP
      expect(script[1]).toBe(0xa9); // OP_HASH160
      expect(script[2]).toBe(0x14); // Push 20 bytes
      expect(script[23]).toBe(0x88); // OP_EQUALVERIFY
      expect(script[24]).toBe(0xac); // OP_CHECKSIG
    });
  });

  describe('buildTokenPrefix', () => {
    it('builds correct token prefix for fungible tokens', () => {
      const prefix = buildTokenPrefix(TOKEN_CATEGORY, 1000n);

      // Should start with 0xef
      expect(prefix[0]).toBe(0xef);

      // Category should be 32 bytes (reversed)
      expect(prefix.slice(1, 33).length).toBe(32);

      // Bitfield should have HAS_AMOUNT flag
      expect(prefix[33] & 0x10).toBe(0x10);
    });

    it('throws for invalid category length', () => {
      expect(() => buildTokenPrefix('aabbcc', 1000n)).toThrow('must be 32 bytes');
    });
  });

  describe('buildTokenP2PKHScript', () => {
    it('builds token prefix + P2PKH script', () => {
      const hash = new Uint8Array(20).fill(0xab);
      const script = buildTokenP2PKHScript(hash, TOKEN_CATEGORY, 1000n);

      // Should be token prefix (35+ bytes) + P2PKH (25 bytes)
      expect(script.length).toBeGreaterThan(60);

      // Should start with token prefix byte
      expect(script[0]).toBe(0xef);
    });
  });

  describe('buildOpReturnScript', () => {
    it('builds OP_RETURN script for small data', () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      const script = buildOpReturnScript(data);

      expect(script[0]).toBe(0x6a); // OP_RETURN
      expect(script[1]).toBe(3); // push 3 bytes
    });

    it('uses OP_PUSHDATA1 for larger data', () => {
      const data = new Uint8Array(100).fill(0xab);
      const script = buildOpReturnScript(data);

      expect(script[0]).toBe(0x6a); // OP_RETURN
      expect(script[1]).toBe(0x4c); // OP_PUSHDATA1
      expect(script[2]).toBe(100); // length
    });

    it('throws for data > 220 bytes', () => {
      const data = new Uint8Array(221);
      expect(() => buildOpReturnScript(data)).toThrow('too large');
    });
  });

  describe('addressToPubkeyHash', () => {
    it('extracts pubkey hash from mainnet address', () => {
      const hash = addressToPubkeyHash(MAINNET_ADDRESS);
      expect(hash.length).toBe(20);
    });

    it('extracts pubkey hash from different mainnet address', () => {
      const hash = addressToPubkeyHash(MAINNET_ADDRESS_2);
      expect(hash.length).toBe(20);
    });
  });

  describe('buildTokenTransaction', () => {
    it('builds transaction for single recipient', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(true);
      expect(result.transaction).toBeDefined();
      expect(result.transaction!.inputs.length).toBe(2);
      expect(result.transaction!.outputs.length).toBeGreaterThanOrEqual(2); // recipient + change(s)
    });

    it('builds transaction for multiple recipients', () => {
      const tokenUtxo = createTokenUtxo(10000n, 1000n);
      const bchUtxo = createBchUtxo(50000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [
          { address: MAINNET_ADDRESS, tokenAmount: 100n },
          { address: MAINNET_ADDRESS, tokenAmount: 200n },
          { address: MAINNET_ADDRESS, tokenAmount: 300n },
        ],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(true);
      expect(result.transaction!.outputs.length).toBeGreaterThanOrEqual(4); // 3 recipients + token change + bch change
    });

    it('enforces dust minimum', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 100n, // Below minimum
      });

      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('increased');

      // All token outputs should have at least MIN_DUST_SATOSHIS
      const tokenOutputs = result.transaction!.outputs.filter((o) => o.token);
      for (const output of tokenOutputs) {
        expect(output.satoshis).toBeGreaterThanOrEqual(MIN_DUST_SATOSHIS);
      }
    });

    it('fails when no token inputs', () => {
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No token inputs');
    });

    it('fails when no recipients', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No recipients');
    });

    it('fails when insufficient tokens', () => {
      const tokenUtxo = createTokenUtxo(100n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient tokens');
    });

    it('fails when insufficient BCH', () => {
      const tokenUtxo = createTokenUtxo(1000n, 100n);
      const bchUtxo = createBchUtxo(100n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient BCH');
    });

    it('fails when token category mismatch', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n, 'bbbbbbbb'.repeat(8));
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('category mismatch');
    });

    it('includes OP_RETURN output when data provided', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
        opReturnData: new Uint8Array([0x01, 0x02, 0x03]),
      });

      expect(result.success).toBe(true);

      // Find OP_RETURN output (0 satoshis)
      const opReturnOutput = result.transaction!.outputs.find((o) => o.satoshis === 0n);
      expect(opReturnOutput).toBeDefined();
      expect(opReturnOutput!.lockingScript.startsWith('6a')).toBe(true); // OP_RETURN
    });

    it('creates token change when not all tokens spent', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 300n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(true);

      // Find token change output (has token data with remaining amount)
      const tokenOutputs = result.transaction!.outputs.filter((o) => o.token);
      const changeOutput = tokenOutputs.find((o) => o.token!.amount === 700n);
      expect(changeOutput).toBeDefined();
    });
  });

  describe('verifyTokenBalance', () => {
    it('validates correct token balance', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(true);

      const verification = verifyTokenBalance(result.transaction!);
      expect(verification.valid).toBe(true);
      expect(verification.tokenInputSum).toBe(1000n);
      expect(verification.tokenOutputSum).toBe(1000n); // 500 + 500 change
    });
  });

  describe('verifyBchBalance', () => {
    it('validates correct BCH balance', () => {
      const tokenUtxo = createTokenUtxo(1000n, 800n);
      const bchUtxo = createBchUtxo(10000n);

      const result = buildTokenTransaction({
        network: 'mainnet',
        tokenCategory: TOKEN_CATEGORY,
        tokenInputs: [tokenUtxo],
        bchInputs: [bchUtxo],
        recipients: [{ address: MAINNET_ADDRESS, tokenAmount: 500n }],
        tokenChangeAddress: MAINNET_ADDRESS,
        bchChangeAddress: MAINNET_ADDRESS,
        feeRateSatPerByte: 1.0,
        dustSatPerOutput: 800n,
      });

      expect(result.success).toBe(true);

      const verification = verifyBchBalance(result.transaction!);
      expect(verification.valid).toBe(true);
      expect(verification.bchInputSum).toBe(10800n); // 800 + 10000
      expect(verification.impliedFee).toBeGreaterThan(0n);
    });
  });
});
