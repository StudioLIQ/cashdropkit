/**
 * Tests for validation utilities
 */
import { describe, expect, it } from 'vitest';

import { encodeCashAddr } from '../wallet/cashaddr';
import {
  formatValidationErrors,
  getAddressNetwork,
  isNetworkMatch,
  isValidAddress,
  normalizeAddress,
  validateAddress,
  validateAmount,
  validateRecipient,
  validateRecipientBatch,
} from './validate';

// Generate a valid test address
function makeTestAddress(network: 'mainnet' | 'testnet'): string {
  const hash = new Uint8Array([
    0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
    0x12, 0x34, 0x56, 0x78,
  ]);
  return encodeCashAddr(network, 'P2PKH', hash);
}

const MAINNET_ADDRESS = makeTestAddress('mainnet');
const TESTNET_ADDRESS = makeTestAddress('testnet');

describe('validateAddress', () => {
  describe('valid addresses', () => {
    it('validates mainnet address without network check', () => {
      const result = validateAddress(MAINNET_ADDRESS);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(MAINNET_ADDRESS);
      expect(result.network).toBe('mainnet');
      expect(result.type).toBe('P2PKH');
    });

    it('validates testnet address without network check', () => {
      const result = validateAddress(TESTNET_ADDRESS);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(TESTNET_ADDRESS);
      expect(result.network).toBe('testnet');
    });

    it('validates mainnet address with expected network', () => {
      const result = validateAddress(MAINNET_ADDRESS, 'mainnet');
      expect(result.valid).toBe(true);
    });

    it('validates testnet address with expected network', () => {
      const result = validateAddress(TESTNET_ADDRESS, 'testnet');
      expect(result.valid).toBe(true);
    });
  });

  describe('network mismatch', () => {
    it('rejects mainnet address when testnet expected', () => {
      const result = validateAddress(MAINNET_ADDRESS, 'testnet');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NETWORK_MISMATCH');
      expect(result.errorMessage).toContain('mainnet');
      expect(result.errorMessage).toContain('testnet');
    });

    it('rejects testnet address when mainnet expected', () => {
      const result = validateAddress(TESTNET_ADDRESS, 'mainnet');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NETWORK_MISMATCH');
    });
  });

  describe('invalid addresses', () => {
    it('rejects empty string', () => {
      const result = validateAddress('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EMPTY');
    });

    it('rejects whitespace only', () => {
      const result = validateAddress('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EMPTY');
    });

    it('rejects undefined/null', () => {
      const result = validateAddress(undefined as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EMPTY');
    });

    it('rejects invalid format', () => {
      const result = validateAddress('not-an-address');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_FORMAT');
    });

    it('rejects invalid checksum', () => {
      // Modify last character to corrupt checksum
      const corrupted = MAINNET_ADDRESS.slice(0, -1) + 'x';
      const result = validateAddress(corrupted);
      expect(result.valid).toBe(false);
      // Either INVALID_CHECKSUM or INVALID_FORMAT depending on how it's detected
      expect(['INVALID_CHECKSUM', 'INVALID_FORMAT']).toContain(result.error);
    });
  });

  describe('normalization', () => {
    it('handles mixed case input', () => {
      const result = validateAddress(MAINNET_ADDRESS.toUpperCase());
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(MAINNET_ADDRESS);
    });

    it('trims whitespace', () => {
      const result = validateAddress(`  ${MAINNET_ADDRESS}  `);
      expect(result.valid).toBe(true);
      expect(result.normalized).toBe(MAINNET_ADDRESS);
    });
  });
});

describe('isValidAddress', () => {
  it('returns true for valid address', () => {
    expect(isValidAddress(MAINNET_ADDRESS)).toBe(true);
  });

  it('returns false for invalid address', () => {
    expect(isValidAddress('invalid')).toBe(false);
  });

  it('checks network when provided', () => {
    expect(isValidAddress(MAINNET_ADDRESS, 'mainnet')).toBe(true);
    expect(isValidAddress(MAINNET_ADDRESS, 'testnet')).toBe(false);
  });
});

describe('normalizeAddress', () => {
  it('normalizes valid address', () => {
    const normalized = normalizeAddress(MAINNET_ADDRESS);
    expect(normalized).toBe(MAINNET_ADDRESS);
  });

  it('throws for invalid address', () => {
    expect(() => normalizeAddress('invalid')).toThrow();
  });
});

describe('getAddressNetwork', () => {
  it('returns mainnet for mainnet address', () => {
    expect(getAddressNetwork(MAINNET_ADDRESS)).toBe('mainnet');
  });

  it('returns testnet for testnet address', () => {
    expect(getAddressNetwork(TESTNET_ADDRESS)).toBe('testnet');
  });

  it('returns null for invalid address', () => {
    expect(getAddressNetwork('invalid')).toBeNull();
  });
});

describe('isNetworkMatch', () => {
  it('returns true when networks match', () => {
    expect(isNetworkMatch(MAINNET_ADDRESS, 'mainnet')).toBe(true);
    expect(isNetworkMatch(TESTNET_ADDRESS, 'testnet')).toBe(true);
  });

  it('returns false when networks differ', () => {
    expect(isNetworkMatch(MAINNET_ADDRESS, 'testnet')).toBe(false);
    expect(isNetworkMatch(TESTNET_ADDRESS, 'mainnet')).toBe(false);
  });

  it('returns false for invalid address', () => {
    expect(isNetworkMatch('invalid', 'mainnet')).toBe(false);
  });
});

describe('validateAmount', () => {
  describe('valid amounts', () => {
    it('parses integer amount', () => {
      const result = validateAmount('100', 8);
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(10000000000n);
    });

    it('parses decimal amount', () => {
      const result = validateAmount('1.5', 8);
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(150000000n);
    });

    it('parses small decimal', () => {
      const result = validateAmount('0.00000001', 8);
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(1n);
    });

    it('parses amount with no decimals token', () => {
      const result = validateAmount('42', 0);
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(42n);
    });
  });

  describe('rounding modes', () => {
    it('floors by default', () => {
      const result = validateAmount('1.999', 2);
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(199n);
    });

    it('rounds with round option', () => {
      const result = validateAmount('1.995', 2, { rounding: 'round' });
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(200n);
    });

    it('ceils with ceil option', () => {
      const result = validateAmount('1.991', 2, { rounding: 'ceil' });
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(200n);
    });
  });

  describe('invalid amounts', () => {
    it('rejects empty string', () => {
      const result = validateAmount('', 8);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('EMPTY');
    });

    it('rejects non-numeric string', () => {
      const result = validateAmount('abc', 8);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NOT_A_NUMBER');
    });

    it('rejects negative amount', () => {
      const result = validateAmount('-5', 8);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('NEGATIVE');
    });

    it('rejects zero by default', () => {
      const result = validateAmount('0', 8);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('ZERO');
    });

    it('allows zero when option set', () => {
      const result = validateAmount('0', 8, { allowZero: true });
      expect(result.valid).toBe(true);
      expect(result.amountBase).toBe(0n);
    });

    it('rejects too many decimals', () => {
      // Token has 8 decimals, we allow 4 extra for rounding tolerance (12 total)
      // 14 decimals should be rejected
      const result = validateAmount('1.12345678901234', 8);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TOO_MANY_DECIMALS');
    });

    it('rejects overflow', () => {
      const result = validateAmount('1000', 8, { maxAmount: 100n });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('OVERFLOW');
    });
  });
});

describe('validateRecipient', () => {
  it('validates valid recipient', () => {
    const result = validateRecipient({ address: MAINNET_ADDRESS, amount: '100' }, 'mainnet', 8);
    expect(result.valid).toBe(true);
    expect(result.normalizedAddress).toBe(MAINNET_ADDRESS);
    expect(result.amountBase).toBe(10000000000n);
    expect(result.errors).toHaveLength(0);
  });

  it('returns multiple errors', () => {
    const result = validateRecipient({ address: 'invalid', amount: '-5' }, 'mainnet', 8);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('includes line number in errors', () => {
    const result = validateRecipient(
      { address: 'invalid', amount: '100', lineNumber: 5 },
      'mainnet',
      8
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Line 5');
  });

  it('detects network mismatch', () => {
    const result = validateRecipient({ address: TESTNET_ADDRESS, amount: '100' }, 'mainnet', 8);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('testnet');
  });
});

describe('validateRecipientBatch', () => {
  it('validates batch of recipients', () => {
    const inputs = [
      { address: MAINNET_ADDRESS, amount: '100' },
      { address: MAINNET_ADDRESS, amount: '200' },
    ];
    const result = validateRecipientBatch(inputs, 'mainnet', 8);

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.totalAmountBase).toBe(30000000000n);
  });

  it('counts invalid rows', () => {
    const inputs = [
      { address: MAINNET_ADDRESS, amount: '100' },
      { address: 'invalid', amount: '200' },
      { address: MAINNET_ADDRESS, amount: '-5' },
    ];
    const result = validateRecipientBatch(inputs, 'mainnet', 8);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it('stops on first error when option set', () => {
    const inputs = [
      { address: 'invalid1', amount: '100' },
      { address: 'invalid2', amount: '200' },
    ];
    const result = validateRecipientBatch(inputs, 'mainnet', 8, {
      stopOnFirstError: true,
    });

    expect(result.errors).toHaveLength(1);
  });

  it('calculates total amount from valid rows only', () => {
    const inputs = [
      { address: MAINNET_ADDRESS, amount: '100' },
      { address: 'invalid', amount: '200' },
      { address: MAINNET_ADDRESS, amount: '50' },
    ];
    const result = validateRecipientBatch(inputs, 'mainnet', 8);

    expect(result.totalAmountBase).toBe(15000000000n); // 100 + 50 = 150 in base units
  });
});

describe('formatValidationErrors', () => {
  it('returns empty string for no errors', () => {
    const summary = {
      totalRows: 10,
      validRows: 10,
      invalidRows: 0,
      errors: [],
      totalAmountBase: 1000n,
    };
    expect(formatValidationErrors(summary)).toBe('');
  });

  it('formats errors with line numbers', () => {
    const summary = {
      totalRows: 3,
      validRows: 1,
      invalidRows: 2,
      errors: [
        { lineNumber: 2, errors: ['Invalid address'] },
        { lineNumber: 3, errors: ['Negative amount'] },
      ],
      totalAmountBase: 100n,
    };
    const formatted = formatValidationErrors(summary);
    expect(formatted).toContain('2 of 3 rows have errors');
    expect(formatted).toContain('Line 2');
    expect(formatted).toContain('Line 3');
  });

  it('truncates long error lists', () => {
    const errors = Array.from({ length: 15 }, (_, i) => ({
      lineNumber: i + 1,
      errors: ['Error'],
    }));
    const summary = {
      totalRows: 15,
      validRows: 0,
      invalidRows: 15,
      errors,
      totalAmountBase: 0n,
    };
    const formatted = formatValidationErrors(summary);
    expect(formatted).toContain('and 5 more errors');
  });
});
