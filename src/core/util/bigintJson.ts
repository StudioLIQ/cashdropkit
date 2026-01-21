/**
 * BigInt JSON Serialization
 *
 * Provides a shared serialization layer for BigInt values in JSON.
 * Native JSON.stringify throws on BigInt; this module handles the conversion.
 *
 * Storage format uses a marker prefix to distinguish BigInt from regular strings:
 *   "$bigint:123456789012345678901234567890"
 *
 * Usage:
 *   - stringifyWithBigInt(obj) → JSON string with BigInt markers
 *   - parseWithBigInt(json) → object with BigInt values restored
 */

// Marker prefix for BigInt values in JSON
const BIGINT_PREFIX = '$bigint:';

/**
 * JSON replacer that converts BigInt values to marked strings.
 * Use with JSON.stringify(value, bigintReplacer)
 */
export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return `${BIGINT_PREFIX}${value.toString()}`;
  }
  return value;
}

/**
 * JSON reviver that converts marked strings back to BigInt.
 * Use with JSON.parse(json, bigintReviver)
 */
export function bigintReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.startsWith(BIGINT_PREFIX)) {
    const numStr = value.slice(BIGINT_PREFIX.length);
    try {
      return BigInt(numStr);
    } catch {
      // If parsing fails, return the original string
      return value;
    }
  }
  return value;
}

/**
 * Stringify an object with BigInt support.
 * BigInt values are converted to marked strings that can be revived.
 */
export function stringifyWithBigInt(value: unknown, space?: string | number): string {
  return JSON.stringify(value, bigintReplacer, space);
}

/**
 * Parse a JSON string with BigInt support.
 * Marked BigInt strings are converted back to BigInt.
 */
export function parseWithBigInt<T = unknown>(json: string): T {
  return JSON.parse(json, bigintReviver) as T;
}

// ============================================================================
// Plain string ↔ BigInt conversion (for IndexedDB storage)
// ============================================================================

/**
 * Convert a bigint to string for storage.
 * Safe for IndexedDB which cannot store BigInt directly.
 */
export function bigintToString(value: bigint): string {
  return value.toString();
}

/**
 * Convert a stored string back to bigint.
 * Throws if the string is not a valid integer representation.
 */
export function stringToBigint(value: string): bigint {
  if (value === '' || value === null || value === undefined) {
    throw new Error('Cannot convert empty/null value to BigInt');
  }
  return BigInt(value);
}

/**
 * Safely convert a string to bigint, returning undefined on failure.
 */
export function tryStringToBigint(value: string | null | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

// ============================================================================
// Display formatting helpers
// ============================================================================

/**
 * Format a bigint base amount to a display string with decimals.
 *
 * @param baseAmount - The amount in base units (satoshis, smallest token unit)
 * @param decimals - Number of decimal places
 * @returns Formatted string (e.g., "1234.56789")
 */
export function formatBaseToDisplay(baseAmount: bigint, decimals: number): string {
  if (decimals === 0) {
    return baseAmount.toString();
  }

  const divisor = 10n ** BigInt(decimals);
  const wholePart = baseAmount / divisor;
  const fractionalPart = baseAmount % divisor;

  // Handle negative numbers
  const isNegative = baseAmount < 0n;
  const absFractional = fractionalPart < 0n ? -fractionalPart : fractionalPart;

  // Pad fractional part with leading zeros
  const fractionalStr = absFractional.toString().padStart(decimals, '0');

  // Remove trailing zeros for cleaner display
  const trimmedFractional = fractionalStr.replace(/0+$/, '');

  if (trimmedFractional === '') {
    return wholePart.toString();
  }

  const sign = isNegative && wholePart === 0n ? '-' : '';
  return `${sign}${wholePart}.${trimmedFractional}`;
}

/**
 * Parse a display amount string to base units (bigint).
 *
 * @param displayAmount - The amount as a string (e.g., "1234.56789")
 * @param decimals - Number of decimal places
 * @param rounding - How to handle precision beyond decimals
 * @returns Amount in base units as bigint
 * @throws Error if the string is invalid
 */
export function parseDisplayToBase(
  displayAmount: string,
  decimals: number,
  rounding: 'floor' | 'round' | 'ceil' = 'floor'
): bigint {
  const trimmed = displayAmount.trim();
  if (trimmed === '' || trimmed === '-') {
    throw new Error('Invalid amount: empty string');
  }

  // Handle negative sign
  const isNegative = trimmed.startsWith('-');
  const absStr = isNegative ? trimmed.slice(1) : trimmed;

  // Split into integer and fractional parts
  const parts = absStr.split('.');
  if (parts.length > 2) {
    throw new Error('Invalid amount: multiple decimal points');
  }

  const intPart = parts[0] || '0';
  let fracPart = parts[1] || '';

  // Validate numeric characters
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new Error('Invalid amount: non-numeric characters');
  }

  if (decimals === 0) {
    if (fracPart !== '' && fracPart !== '0'.repeat(fracPart.length)) {
      // Has fractional part but decimals=0
      if (rounding === 'ceil' && !isNegative) {
        return BigInt(intPart) + 1n;
      } else if (rounding === 'ceil' && isNegative) {
        return -BigInt(intPart);
      } else if (rounding === 'round') {
        const firstDigit = parseInt(fracPart[0] || '0', 10);
        if (firstDigit >= 5) {
          return isNegative ? -(BigInt(intPart) + 1n) : BigInt(intPart) + 1n;
        }
      }
    }
    return isNegative ? -BigInt(intPart) : BigInt(intPart);
  }

  // Handle fractional precision
  if (fracPart.length > decimals) {
    const excess = fracPart.slice(decimals);
    const keptFrac = fracPart.slice(0, decimals);
    fracPart = keptFrac;

    // Apply rounding based on excess digits
    const hasExcess = excess.split('').some((c) => c !== '0');
    if (hasExcess) {
      const baseWithoutRounding = BigInt(intPart + fracPart.padEnd(decimals, '0'));
      if (rounding === 'ceil' && !isNegative) {
        const result = baseWithoutRounding + 1n;
        return result;
      } else if (rounding === 'ceil' && isNegative) {
        return -baseWithoutRounding;
      } else if (rounding === 'round') {
        const firstExcessDigit = parseInt(excess[0] || '0', 10);
        if (firstExcessDigit >= 5) {
          const rounded = isNegative ? -(baseWithoutRounding + 1n) : baseWithoutRounding + 1n;
          return rounded;
        }
      }
    }
  }

  // Pad or keep fractional part to exact decimal length
  fracPart = fracPart.padEnd(decimals, '0');

  const combined = intPart + fracPart;
  const result = BigInt(combined);

  return isNegative ? -result : result;
}
