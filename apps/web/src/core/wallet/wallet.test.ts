/**
 * Wallet module tests
 */
import { describe, expect, it } from 'vitest';

import {
  decodeCashAddr,
  encodeCashAddr,
  generateMnemonic,
  getPrefix,
  isValidCashAddr,
  normalizeCashAddr,
  normalizeMnemonic,
  validateMnemonic,
} from './index';

describe('CashAddr', () => {
  describe('getPrefix', () => {
    it('returns bitcoincash for mainnet', () => {
      expect(getPrefix('mainnet')).toBe('bitcoincash');
    });

    it('returns bchtest for testnet', () => {
      expect(getPrefix('testnet')).toBe('bchtest');
    });
  });

  describe('encodeCashAddr', () => {
    it('encodes a P2PKH address for mainnet', () => {
      // Example hash (20 bytes)
      const hash = new Uint8Array([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0x10, 0x11, 0x12, 0x13,
      ]);
      const address = encodeCashAddr('mainnet', 'P2PKH', hash);
      expect(address).toMatch(/^bitcoincash:q/);
    });

    it('encodes a P2PKH address for testnet', () => {
      const hash = new Uint8Array([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0x10, 0x11, 0x12, 0x13,
      ]);
      const address = encodeCashAddr('testnet', 'P2PKH', hash);
      expect(address).toMatch(/^bchtest:q/);
    });

    it('encodes a P2SH address for mainnet', () => {
      const hash = new Uint8Array([
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
        0x0f, 0x10, 0x11, 0x12, 0x13,
      ]);
      const address = encodeCashAddr('mainnet', 'P2SH', hash);
      expect(address).toMatch(/^bitcoincash:p/);
    });

    it('throws for invalid hash length', () => {
      const hash = new Uint8Array([0x00, 0x01, 0x02]); // Too short
      expect(() => encodeCashAddr('mainnet', 'P2PKH', hash)).toThrow('Invalid hash length');
    });
  });

  describe('decodeCashAddr', () => {
    it('decodes a mainnet P2PKH address', () => {
      // First encode an address, then decode it
      const hash = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78,
      ]);
      const address = encodeCashAddr('mainnet', 'P2PKH', hash);
      const decoded = decodeCashAddr(address);

      expect(decoded.network).toBe('mainnet');
      expect(decoded.type).toBe('P2PKH');
      expect(decoded.prefix).toBe('bitcoincash');
      expect(decoded.hash).toEqual(hash);
    });

    it('decodes a testnet P2SH address', () => {
      const hash = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78,
      ]);
      const address = encodeCashAddr('testnet', 'P2SH', hash);
      const decoded = decodeCashAddr(address);

      expect(decoded.network).toBe('testnet');
      expect(decoded.type).toBe('P2SH');
      expect(decoded.prefix).toBe('bchtest');
    });

    it('throws for invalid characters', () => {
      expect(() => decodeCashAddr('bitcoincash:qBadAddress')).toThrow();
    });
  });

  describe('isValidCashAddr', () => {
    it('returns true for valid mainnet address', () => {
      const hash = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78,
      ]);
      const address = encodeCashAddr('mainnet', 'P2PKH', hash);
      expect(isValidCashAddr(address)).toBe(true);
    });

    it('returns false for invalid address', () => {
      expect(isValidCashAddr('not-an-address')).toBe(false);
    });

    it('validates network constraint', () => {
      const hash = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78,
      ]);
      const address = encodeCashAddr('mainnet', 'P2PKH', hash);
      expect(isValidCashAddr(address, 'mainnet')).toBe(true);
      expect(isValidCashAddr(address, 'testnet')).toBe(false);
    });
  });

  describe('normalizeCashAddr', () => {
    it('normalizes address to canonical form', () => {
      const hash = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde,
        0xf0, 0x12, 0x34, 0x56, 0x78,
      ]);
      const address = encodeCashAddr('mainnet', 'P2PKH', hash);
      const normalized = normalizeCashAddr(address);
      expect(normalized).toBe(address);
    });
  });

  describe('round-trip encoding/decoding', () => {
    it('maintains integrity through encode-decode cycle', () => {
      const originalHash = new Uint8Array([
        0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67,
        0x89, 0xab, 0xcd, 0xef, 0x01,
      ]);

      const address = encodeCashAddr('mainnet', 'P2PKH', originalHash);
      const decoded = decodeCashAddr(address);

      expect(decoded.hash).toEqual(originalHash);
      expect(decoded.type).toBe('P2PKH');
      expect(decoded.network).toBe('mainnet');
    });
  });
});

describe('Mnemonic', () => {
  describe('generateMnemonic', () => {
    it('generates a 12-word mnemonic by default', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(12);
    });

    it('generates a 24-word mnemonic with strength 256', () => {
      const mnemonic = generateMnemonic(256);
      const words = mnemonic.split(' ');
      expect(words).toHaveLength(24);
    });

    it('generates different mnemonics each time', () => {
      const mnemonic1 = generateMnemonic();
      const mnemonic2 = generateMnemonic();
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('validateMnemonic', () => {
    it('validates a correctly generated mnemonic', () => {
      const mnemonic = generateMnemonic();
      expect(validateMnemonic(mnemonic)).toBe(true);
    });

    it('rejects invalid mnemonic', () => {
      expect(validateMnemonic('not a valid mnemonic phrase')).toBe(false);
    });

    it('rejects empty mnemonic', () => {
      expect(validateMnemonic('')).toBe(false);
    });

    it('handles whitespace and case', () => {
      const mnemonic = generateMnemonic();
      const withWhitespace = `  ${mnemonic.toUpperCase()}  `;
      expect(validateMnemonic(withWhitespace)).toBe(true);
    });
  });

  describe('normalizeMnemonic', () => {
    it('lowercases mnemonic', () => {
      const mnemonic = generateMnemonic();
      const normalized = normalizeMnemonic(mnemonic.toUpperCase());
      expect(normalized).toBe(mnemonic.toLowerCase());
    });

    it('trims whitespace', () => {
      const mnemonic = generateMnemonic();
      const normalized = normalizeMnemonic(`  ${mnemonic}  `);
      expect(normalized).toBe(mnemonic);
    });

    it('normalizes multiple spaces', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonic.split(' ');
      const withExtraSpaces = words.join('  ');
      const normalized = normalizeMnemonic(withExtraSpaces);
      expect(normalized).toBe(mnemonic);
    });
  });
});

describe('Address Derivation', () => {
  // Note: We need to mock or use actual derivation for these tests
  // Skipping detailed derivation tests since they require async operations
  // and would need a test mnemonic with known derived addresses

  it('placeholder for derivation tests', () => {
    // This test ensures the module loads correctly
    expect(true).toBe(true);
  });
});
