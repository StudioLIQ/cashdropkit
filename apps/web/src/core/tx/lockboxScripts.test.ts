/**
 * Lockbox Script Generator Tests
 */
import { describe, expect, it } from 'vitest';

import {
  type LockboxParams,
  buildRedeemScript,
  encodeScriptNumber,
  generateLockbox,
  generateLockboxes,
} from './lockboxScripts';
import { bytesToHex } from './tokenTxBuilder';

describe('lockboxScripts', () => {
  // A known 20-byte pubkey hash for testing
  const testPkh = '89abcdef0123456789abcdef0123456789abcdef';

  describe('encodeScriptNumber', () => {
    it('should encode 0 as empty bytes', () => {
      const result = encodeScriptNumber(0);
      expect(result.length).toBe(0);
    });

    it('should encode small positive numbers correctly', () => {
      // 1 = 0x01
      expect(bytesToHex(encodeScriptNumber(1))).toBe('01');
      // 127 = 0x7f
      expect(bytesToHex(encodeScriptNumber(127))).toBe('7f');
    });

    it('should add sign byte for high-bit values', () => {
      // 128 = 0x80 → needs 0x8000 (little-endian: 80 00)
      expect(bytesToHex(encodeScriptNumber(128))).toBe('8000');
      // 255 = 0xff → needs 0xff00
      expect(bytesToHex(encodeScriptNumber(255))).toBe('ff00');
    });

    it('should encode multi-byte values correctly', () => {
      // 256 = 0x0100 → little-endian: 00 01
      expect(bytesToHex(encodeScriptNumber(256))).toBe('0001');
      // 65535 = 0xffff → little-endian: ff ff 00 (needs sign byte)
      expect(bytesToHex(encodeScriptNumber(65535))).toBe('ffff00');
    });

    it('should encode typical locktime values', () => {
      // Unix timestamp: 1700000000 = 0x6553F900
      // Little-endian: 00 f9 53 65
      const result = encodeScriptNumber(1700000000);
      expect(result.length).toBe(4);
      expect(bytesToHex(result)).toBe('00f15365');
    });

    it('should encode max 32-bit locktime', () => {
      // 0x7FFFFFFF = 2147483647 — fits in 4 bytes
      const result = encodeScriptNumber(0x7fffffff);
      expect(result.length).toBe(4);
    });

    it('should handle values needing 5 bytes', () => {
      // 0x80000000 = 2147483648 — high bit set, needs 5 bytes
      const result = encodeScriptNumber(0x80000000);
      expect(result.length).toBe(5);
      expect(result[4]).toBe(0x00); // Sign byte
    });

    it('should throw for negative values', () => {
      expect(() => encodeScriptNumber(-1)).toThrow('non-negative');
    });
  });

  describe('buildRedeemScript', () => {
    it('should build a valid redeemScript', () => {
      const script = buildRedeemScript(1700000000, testPkh);

      // Should be a non-empty byte array
      expect(script.length).toBeGreaterThan(0);

      // Script should contain OP_CHECKLOCKTIMEVERIFY (0xb1)
      expect(script).toContain(0xb1);
      // Script should contain OP_DROP (0x75)
      expect(script).toContain(0x75);
      // Script should contain OP_DUP (0x76)
      expect(script).toContain(0x76);
      // Script should contain OP_HASH160 (0xa9)
      expect(script).toContain(0xa9);
      // Script should contain OP_EQUALVERIFY (0x88)
      expect(script).toContain(0x88);
      // Script should contain OP_CHECKSIG (0xac)
      expect(script).toContain(0xac);
    });

    it('should be deterministic for same inputs', () => {
      const script1 = buildRedeemScript(1700000000, testPkh);
      const script2 = buildRedeemScript(1700000000, testPkh);

      expect(bytesToHex(script1)).toBe(bytesToHex(script2));
    });

    it('should produce different scripts for different unlock times', () => {
      const script1 = buildRedeemScript(1700000000, testPkh);
      const script2 = buildRedeemScript(1700001000, testPkh);

      expect(bytesToHex(script1)).not.toBe(bytesToHex(script2));
    });

    it('should produce different scripts for different beneficiaries', () => {
      const pkh2 = '0000000000000000000000000000000000000000';
      const script1 = buildRedeemScript(1700000000, testPkh);
      const script2 = buildRedeemScript(1700000000, pkh2);

      expect(bytesToHex(script1)).not.toBe(bytesToHex(script2));
    });

    it('should throw for invalid pkh length', () => {
      expect(() => buildRedeemScript(1700000000, 'aabb')).toThrow('Invalid pubkey hash length');
    });

    it('should throw for non-positive unlock time', () => {
      expect(() => buildRedeemScript(0, testPkh)).toThrow('positive');
      expect(() => buildRedeemScript(-1, testPkh)).toThrow('positive');
    });
  });

  describe('generateLockbox', () => {
    it('should generate a lockbox with address', async () => {
      const params: LockboxParams = {
        unlockTime: 1700000000,
        beneficiaryPkh: testPkh,
        network: 'testnet',
      };

      const result = await generateLockbox(params);

      expect(result.redeemScriptHex).toBeTruthy();
      expect(result.lockAddress).toBeTruthy();
      expect(result.scriptHash).toBeTruthy();
      expect(result.unlockTime).toBe(1700000000);
      expect(result.beneficiaryPkh).toBe(testPkh);
    });

    it('should produce a P2SH address (testnet)', async () => {
      const params: LockboxParams = {
        unlockTime: 1700000000,
        beneficiaryPkh: testPkh,
        network: 'testnet',
      };

      const result = await generateLockbox(params);

      // Testnet P2SH addresses start with bchtest:p
      expect(result.lockAddress).toMatch(/^bchtest:p/);
    });

    it('should produce a P2SH address (mainnet)', async () => {
      const params: LockboxParams = {
        unlockTime: 1700000000,
        beneficiaryPkh: testPkh,
        network: 'mainnet',
      };

      const result = await generateLockbox(params);

      // Mainnet P2SH addresses start with bitcoincash:p
      expect(result.lockAddress).toMatch(/^bitcoincash:p/);
    });

    it('should be deterministic', async () => {
      const params: LockboxParams = {
        unlockTime: 1700000000,
        beneficiaryPkh: testPkh,
        network: 'testnet',
      };

      const result1 = await generateLockbox(params);
      const result2 = await generateLockbox(params);

      expect(result1.redeemScriptHex).toBe(result2.redeemScriptHex);
      expect(result1.lockAddress).toBe(result2.lockAddress);
      expect(result1.scriptHash).toBe(result2.scriptHash);
    });

    it('should produce a 20-byte script hash', async () => {
      const params: LockboxParams = {
        unlockTime: 1700000000,
        beneficiaryPkh: testPkh,
        network: 'testnet',
      };

      const result = await generateLockbox(params);

      // 20 bytes = 40 hex chars
      expect(result.scriptHash.length).toBe(40);
    });
  });

  describe('generateLockboxes', () => {
    it('should generate multiple lockboxes', async () => {
      const unlockTimes = [1700000000, 1702592000, 1705270400];
      const results = await generateLockboxes(testPkh, unlockTimes, 'testnet');

      expect(results).toHaveLength(3);
      // Each should have a different address
      const addresses = new Set(results.map((r) => r.lockAddress));
      expect(addresses.size).toBe(3);
    });

    it('should return empty for empty unlock times', async () => {
      const results = await generateLockboxes(testPkh, [], 'testnet');
      expect(results).toHaveLength(0);
    });
  });
});
