/**
 * Tests for BigInt JSON serialization
 */
import { describe, expect, it } from 'vitest';

import {
  bigintReplacer,
  bigintReviver,
  bigintToString,
  formatBaseToDisplay,
  parseDisplayToBase,
  parseWithBigInt,
  stringToBigint,
  stringifyWithBigInt,
  tryStringToBigint,
} from './bigintJson';

describe('bigintJson', () => {
  describe('bigintReplacer', () => {
    it('converts BigInt to marked string', () => {
      expect(bigintReplacer('key', 123n)).toBe('$bigint:123');
      expect(bigintReplacer('key', 0n)).toBe('$bigint:0');
      expect(bigintReplacer('key', -456n)).toBe('$bigint:-456');
    });

    it('passes through non-BigInt values', () => {
      expect(bigintReplacer('key', 'hello')).toBe('hello');
      expect(bigintReplacer('key', 123)).toBe(123);
      expect(bigintReplacer('key', null)).toBe(null);
      expect(bigintReplacer('key', { a: 1 })).toEqual({ a: 1 });
    });

    it('handles very large BigInt values', () => {
      const largeValue = 123456789012345678901234567890n;
      expect(bigintReplacer('key', largeValue)).toBe('$bigint:123456789012345678901234567890');
    });
  });

  describe('bigintReviver', () => {
    it('converts marked string back to BigInt', () => {
      expect(bigintReviver('key', '$bigint:123')).toBe(123n);
      expect(bigintReviver('key', '$bigint:0')).toBe(0n);
      expect(bigintReviver('key', '$bigint:-456')).toBe(-456n);
    });

    it('passes through non-marked strings', () => {
      expect(bigintReviver('key', 'hello')).toBe('hello');
      expect(bigintReviver('key', '123')).toBe('123');
      expect(bigintReviver('key', '$other:123')).toBe('$other:123');
    });

    it('passes through non-string values', () => {
      expect(bigintReviver('key', 123)).toBe(123);
      expect(bigintReviver('key', null)).toBe(null);
    });

    it('handles invalid BigInt string gracefully', () => {
      // If the string after marker is invalid, return original
      expect(bigintReviver('key', '$bigint:notanumber')).toBe('$bigint:notanumber');
    });
  });

  describe('stringifyWithBigInt / parseWithBigInt round-trip', () => {
    it('round-trips simple object with BigInt', () => {
      const original = { amount: 1000000000000000000n, name: 'test' };
      const json = stringifyWithBigInt(original);
      const restored = parseWithBigInt<typeof original>(json);

      expect(restored.amount).toBe(1000000000000000000n);
      expect(typeof restored.amount).toBe('bigint');
      expect(restored.name).toBe('test');
    });

    it('round-trips nested objects with multiple BigInt values', () => {
      const original = {
        campaign: {
          recipients: [
            { id: '1', amountBase: 123456789012345678901234567890n },
            { id: '2', amountBase: 987654321098765432109876543210n },
          ],
          estimated: {
            totalFeeSat: 1000n,
            totalDustSat: 54600n,
          },
        },
      };

      const json = stringifyWithBigInt(original);
      const restored = parseWithBigInt<typeof original>(json);

      expect(restored.campaign.recipients[0].amountBase).toBe(123456789012345678901234567890n);
      expect(restored.campaign.recipients[1].amountBase).toBe(987654321098765432109876543210n);
      expect(restored.campaign.estimated.totalFeeSat).toBe(1000n);
      expect(restored.campaign.estimated.totalDustSat).toBe(54600n);
    });

    it('round-trips arrays with BigInt', () => {
      const original = [1n, 2n, 3n, 100000000000000000000n];
      const json = stringifyWithBigInt(original);
      const restored = parseWithBigInt<bigint[]>(json);

      expect(restored).toEqual(original);
      restored.forEach((val) => expect(typeof val).toBe('bigint'));
    });

    it('preserves non-BigInt strings that look like numbers', () => {
      const original = { id: '123456789012345678901234567890', amount: 100n };
      const json = stringifyWithBigInt(original);
      const restored = parseWithBigInt<typeof original>(json);

      expect(restored.id).toBe('123456789012345678901234567890');
      expect(typeof restored.id).toBe('string');
      expect(restored.amount).toBe(100n);
    });

    it('handles zero and negative BigInt', () => {
      const original = { zero: 0n, negative: -100n };
      const json = stringifyWithBigInt(original);
      const restored = parseWithBigInt<typeof original>(json);

      expect(restored.zero).toBe(0n);
      expect(restored.negative).toBe(-100n);
    });

    it('supports pretty-printing', () => {
      const original = { amount: 100n };
      const json = stringifyWithBigInt(original, 2);
      expect(json).toContain('\n');
      expect(json).toContain('  '); // 2-space indent
    });
  });

  describe('bigintToString / stringToBigint', () => {
    it('converts BigInt to string', () => {
      expect(bigintToString(123n)).toBe('123');
      expect(bigintToString(0n)).toBe('0');
      expect(bigintToString(-456n)).toBe('-456');
      expect(bigintToString(123456789012345678901234567890n)).toBe(
        '123456789012345678901234567890'
      );
    });

    it('converts string to BigInt', () => {
      expect(stringToBigint('123')).toBe(123n);
      expect(stringToBigint('0')).toBe(0n);
      expect(stringToBigint('-456')).toBe(-456n);
      expect(stringToBigint('123456789012345678901234567890')).toBe(
        123456789012345678901234567890n
      );
    });

    it('throws on invalid string', () => {
      expect(() => stringToBigint('')).toThrow();
      expect(() => stringToBigint('not a number')).toThrow();
    });
  });

  describe('tryStringToBigint', () => {
    it('converts valid strings', () => {
      expect(tryStringToBigint('123')).toBe(123n);
      expect(tryStringToBigint('-456')).toBe(-456n);
    });

    it('returns undefined for invalid input', () => {
      expect(tryStringToBigint('')).toBeUndefined();
      expect(tryStringToBigint(null)).toBeUndefined();
      expect(tryStringToBigint(undefined)).toBeUndefined();
      expect(tryStringToBigint('not a number')).toBeUndefined();
    });
  });

  describe('formatBaseToDisplay', () => {
    it('formats with 8 decimals (BCH-like)', () => {
      expect(formatBaseToDisplay(100000000n, 8)).toBe('1');
      expect(formatBaseToDisplay(150000000n, 8)).toBe('1.5');
      expect(formatBaseToDisplay(123456789n, 8)).toBe('1.23456789');
      expect(formatBaseToDisplay(546n, 8)).toBe('0.00000546');
    });

    it('formats with 0 decimals', () => {
      expect(formatBaseToDisplay(123n, 0)).toBe('123');
      expect(formatBaseToDisplay(0n, 0)).toBe('0');
    });

    it('formats with various decimal places', () => {
      expect(formatBaseToDisplay(1234n, 2)).toBe('12.34');
      expect(formatBaseToDisplay(100n, 2)).toBe('1');
      expect(formatBaseToDisplay(1n, 2)).toBe('0.01');
    });

    it('handles negative values', () => {
      expect(formatBaseToDisplay(-100000000n, 8)).toBe('-1');
      expect(formatBaseToDisplay(-546n, 8)).toBe('-0.00000546');
    });

    it('removes trailing zeros', () => {
      expect(formatBaseToDisplay(10000n, 4)).toBe('1');
      expect(formatBaseToDisplay(12000n, 4)).toBe('1.2');
      expect(formatBaseToDisplay(12300n, 4)).toBe('1.23');
    });
  });

  describe('parseDisplayToBase', () => {
    it('parses with 8 decimals (BCH-like)', () => {
      expect(parseDisplayToBase('1', 8)).toBe(100000000n);
      expect(parseDisplayToBase('1.5', 8)).toBe(150000000n);
      expect(parseDisplayToBase('1.23456789', 8)).toBe(123456789n);
      expect(parseDisplayToBase('0.00000546', 8)).toBe(546n);
    });

    it('parses with 0 decimals', () => {
      expect(parseDisplayToBase('123', 0)).toBe(123n);
      expect(parseDisplayToBase('0', 0)).toBe(0n);
    });

    it('parses with various decimal places', () => {
      expect(parseDisplayToBase('12.34', 2)).toBe(1234n);
      expect(parseDisplayToBase('1', 2)).toBe(100n);
      expect(parseDisplayToBase('0.01', 2)).toBe(1n);
    });

    it('handles negative values', () => {
      expect(parseDisplayToBase('-1', 8)).toBe(-100000000n);
      expect(parseDisplayToBase('-0.00000546', 8)).toBe(-546n);
    });

    it('pads short fractional parts', () => {
      expect(parseDisplayToBase('1.5', 8)).toBe(150000000n);
      expect(parseDisplayToBase('1.05', 8)).toBe(105000000n);
    });

    it('handles excess precision with floor rounding (default)', () => {
      expect(parseDisplayToBase('1.123456789', 8)).toBe(112345678n); // truncates 9
      expect(parseDisplayToBase('1.999999999', 8)).toBe(199999999n); // truncates last 9
    });

    it('handles excess precision with ceil rounding', () => {
      expect(parseDisplayToBase('1.123456789', 8, 'ceil')).toBe(112345679n);
      expect(parseDisplayToBase('-1.123456789', 8, 'ceil')).toBe(-112345678n); // ceil toward zero for negative
    });

    it('handles excess precision with round rounding', () => {
      expect(parseDisplayToBase('1.123456785', 8, 'round')).toBe(112345679n); // 5 rounds up
      expect(parseDisplayToBase('1.123456784', 8, 'round')).toBe(112345678n); // 4 rounds down
    });

    it('throws on invalid input', () => {
      expect(() => parseDisplayToBase('', 8)).toThrow();
      expect(() => parseDisplayToBase('-', 8)).toThrow();
      expect(() => parseDisplayToBase('1.2.3', 8)).toThrow();
      expect(() => parseDisplayToBase('abc', 8)).toThrow();
    });

    it('handles whitespace', () => {
      expect(parseDisplayToBase('  1.5  ', 8)).toBe(150000000n);
    });
  });

  describe('format/parse round-trip', () => {
    it('round-trips various values', () => {
      const testCases = [
        { base: 100000000n, decimals: 8 },
        { base: 123456789n, decimals: 8 },
        { base: 546n, decimals: 8 },
        { base: 1n, decimals: 8 },
        { base: 0n, decimals: 8 },
        { base: 1234n, decimals: 2 },
        { base: 123n, decimals: 0 },
      ];

      for (const { base, decimals } of testCases) {
        const display = formatBaseToDisplay(base, decimals);
        const restored = parseDisplayToBase(display, decimals);
        expect(restored).toBe(base);
      }
    });
  });
});
