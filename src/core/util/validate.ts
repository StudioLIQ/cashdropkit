/**
 * Validation Utilities
 *
 * Provides address validation, amount validation, and recipient row validation
 * for CSV import and campaign creation.
 */
import type { Network } from '../db/types';
import { decodeCashAddr, isValidCashAddr, normalizeCashAddr } from '../wallet/cashaddr';

// ============================================================================
// Address Validation
// ============================================================================

export type AddressValidationError =
  | 'EMPTY'
  | 'INVALID_FORMAT'
  | 'INVALID_CHECKSUM'
  | 'NETWORK_MISMATCH'
  | 'UNKNOWN_PREFIX';

export interface AddressValidationResult {
  valid: boolean;
  normalized?: string;
  network?: Network;
  type?: 'P2PKH' | 'P2SH';
  error?: AddressValidationError;
  errorMessage?: string;
}

/**
 * Validate a BCH CashAddr address
 *
 * @param address - The address to validate
 * @param expectedNetwork - The expected network (mainnet/testnet). If provided, validates network match.
 * @returns Validation result with normalized address or error details
 */
export function validateAddress(
  address: string,
  expectedNetwork?: Network
): AddressValidationResult {
  // Handle empty input
  const trimmed = address?.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'EMPTY',
      errorMessage: 'Address is empty',
    };
  }

  try {
    // Try to decode the address
    const decoded = decodeCashAddr(trimmed);

    // Check network mismatch
    if (expectedNetwork && decoded.network !== expectedNetwork) {
      const expectedPrefix = expectedNetwork === 'mainnet' ? 'bitcoincash' : 'bchtest';
      return {
        valid: false,
        network: decoded.network,
        type: decoded.type,
        error: 'NETWORK_MISMATCH',
        errorMessage: `Address is for ${decoded.network}, expected ${expectedNetwork} (prefix: ${expectedPrefix})`,
      };
    }

    // Normalize the address
    const normalized = normalizeCashAddr(trimmed);

    return {
      valid: true,
      normalized,
      network: decoded.network,
      type: decoded.type,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Classify the error
    if (message.includes('checksum')) {
      return {
        valid: false,
        error: 'INVALID_CHECKSUM',
        errorMessage: 'Invalid address checksum',
      };
    }

    if (message.includes('prefix')) {
      return {
        valid: false,
        error: 'UNKNOWN_PREFIX',
        errorMessage: `Unknown address prefix: ${message}`,
      };
    }

    return {
      valid: false,
      error: 'INVALID_FORMAT',
      errorMessage: `Invalid address format: ${message}`,
    };
  }
}

/**
 * Quick check if an address is valid
 */
export function isValidAddress(address: string, expectedNetwork?: Network): boolean {
  return isValidCashAddr(address, expectedNetwork);
}

/**
 * Normalize an address to canonical form (with prefix, lowercase)
 * Throws if invalid
 */
export function normalizeAddress(address: string): string {
  return normalizeCashAddr(address);
}

/**
 * Get network from an address without full validation
 */
export function getAddressNetwork(address: string): Network | null {
  try {
    const decoded = decodeCashAddr(address);
    return decoded.network;
  } catch {
    return null;
  }
}

/**
 * Check if an address is for the expected network
 */
export function isNetworkMatch(address: string, expectedNetwork: Network): boolean {
  const network = getAddressNetwork(address);
  return network === expectedNetwork;
}

// ============================================================================
// Amount Validation
// ============================================================================

export type AmountValidationError =
  | 'EMPTY'
  | 'NOT_A_NUMBER'
  | 'NEGATIVE'
  | 'ZERO'
  | 'TOO_MANY_DECIMALS'
  | 'OVERFLOW';

export interface AmountValidationResult {
  valid: boolean;
  amountBase?: bigint;
  error?: AmountValidationError;
  errorMessage?: string;
}

/**
 * Validate and parse an amount string to base units (bigint)
 *
 * @param amountStr - Amount string (can be decimal like "1.5" or integer like "100000000")
 * @param decimals - Number of decimal places for the token
 * @param options - Validation options
 * @returns Validation result with parsed amount or error
 */
export function validateAmount(
  amountStr: string,
  decimals: number,
  options: {
    allowZero?: boolean;
    rounding?: 'floor' | 'round' | 'ceil';
    maxAmount?: bigint;
  } = {}
): AmountValidationResult {
  const { allowZero = false, rounding = 'floor', maxAmount } = options;

  // Handle empty input
  const trimmed = amountStr?.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'EMPTY',
      errorMessage: 'Amount is empty',
    };
  }

  // Parse number
  const parsed = parseFloat(trimmed);
  if (isNaN(parsed)) {
    return {
      valid: false,
      error: 'NOT_A_NUMBER',
      errorMessage: `"${trimmed}" is not a valid number`,
    };
  }

  // Check negative
  if (parsed < 0) {
    return {
      valid: false,
      error: 'NEGATIVE',
      errorMessage: 'Amount cannot be negative',
    };
  }

  // Check zero
  if (parsed === 0 && !allowZero) {
    return {
      valid: false,
      error: 'ZERO',
      errorMessage: 'Amount cannot be zero',
    };
  }

  // Check decimal places in input - only reject if significantly more than token decimals
  // This allows some tolerance for user input (e.g., copy-paste), but rounding will handle the rest
  const parts = trimmed.split('.');
  const MAX_DECIMAL_TOLERANCE = 4; // Allow up to 4 extra decimal places that will be rounded
  if (parts.length === 2 && parts[1].length > decimals + MAX_DECIMAL_TOLERANCE) {
    return {
      valid: false,
      error: 'TOO_MANY_DECIMALS',
      errorMessage: `Too many decimal places. Token has ${decimals} decimals, but input has ${parts[1].length}`,
    };
  }

  // Convert to base units
  const multiplier = 10 ** decimals;
  const baseValue = parsed * multiplier;

  let amountBase: bigint;
  switch (rounding) {
    case 'floor':
      amountBase = BigInt(Math.floor(baseValue));
      break;
    case 'ceil':
      amountBase = BigInt(Math.ceil(baseValue));
      break;
    case 'round':
      amountBase = BigInt(Math.round(baseValue));
      break;
  }

  // Check max amount
  if (maxAmount !== undefined && amountBase > maxAmount) {
    return {
      valid: false,
      error: 'OVERFLOW',
      errorMessage: `Amount exceeds maximum allowed (${maxAmount})`,
    };
  }

  // Final zero check after rounding
  if (amountBase === 0n && !allowZero) {
    return {
      valid: false,
      error: 'ZERO',
      errorMessage: 'Amount rounds to zero',
    };
  }

  return {
    valid: true,
    amountBase,
  };
}

// ============================================================================
// Recipient Row Validation
// ============================================================================

export interface RecipientInput {
  address: string;
  amount: string;
  memo?: string;
  lineNumber?: number;
}

export interface RecipientValidationResult {
  valid: boolean;
  normalizedAddress?: string;
  amountBase?: bigint;
  errors: string[];
}

/**
 * Validate a recipient row (address + amount)
 *
 * @param input - Recipient input data
 * @param network - Expected network
 * @param decimals - Token decimals
 * @param options - Validation options
 */
export function validateRecipient(
  input: RecipientInput,
  network: Network,
  decimals: number,
  options: {
    rounding?: 'floor' | 'round' | 'ceil';
  } = {}
): RecipientValidationResult {
  const errors: string[] = [];
  let normalizedAddress: string | undefined;
  let amountBase: bigint | undefined;

  const linePrefix = input.lineNumber !== undefined ? `Line ${input.lineNumber}: ` : '';

  // Validate address
  const addressResult = validateAddress(input.address, network);
  if (!addressResult.valid) {
    errors.push(`${linePrefix}${addressResult.errorMessage}`);
  } else {
    normalizedAddress = addressResult.normalized;
  }

  // Validate amount
  const amountResult = validateAmount(input.amount, decimals, {
    rounding: options.rounding,
  });
  if (!amountResult.valid) {
    errors.push(`${linePrefix}${amountResult.errorMessage}`);
  } else {
    amountBase = amountResult.amountBase;
  }

  return {
    valid: errors.length === 0,
    normalizedAddress,
    amountBase,
    errors,
  };
}

// ============================================================================
// Batch Validation
// ============================================================================

export interface BatchValidationSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  errors: { lineNumber?: number; errors: string[] }[];
  totalAmountBase: bigint;
}

/**
 * Validate a batch of recipients
 *
 * @param inputs - Array of recipient inputs
 * @param network - Expected network
 * @param decimals - Token decimals
 * @param options - Validation options
 */
export function validateRecipientBatch(
  inputs: RecipientInput[],
  network: Network,
  decimals: number,
  options: {
    rounding?: 'floor' | 'round' | 'ceil';
    stopOnFirstError?: boolean;
  } = {}
): BatchValidationSummary {
  const { stopOnFirstError = false } = options;
  const errors: { lineNumber?: number; errors: string[] }[] = [];
  let validRows = 0;
  let totalAmountBase = 0n;

  for (let i = 0; i < inputs.length; i++) {
    const input = {
      ...inputs[i],
      lineNumber: inputs[i].lineNumber ?? i + 1,
    };

    const result = validateRecipient(input, network, decimals, options);

    if (result.valid && result.amountBase !== undefined) {
      validRows++;
      totalAmountBase += result.amountBase;
    } else {
      errors.push({
        lineNumber: input.lineNumber,
        errors: result.errors,
      });

      if (stopOnFirstError) {
        break;
      }
    }
  }

  return {
    totalRows: inputs.length,
    validRows,
    invalidRows: inputs.length - validRows,
    errors,
    totalAmountBase,
  };
}

// ============================================================================
// Error Message Formatting
// ============================================================================

/**
 * Format validation errors for display
 */
export function formatValidationErrors(summary: BatchValidationSummary): string {
  if (summary.invalidRows === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push(`${summary.invalidRows} of ${summary.totalRows} rows have errors:`);

  for (const entry of summary.errors.slice(0, 10)) {
    const prefix = entry.lineNumber !== undefined ? `Line ${entry.lineNumber}: ` : '';
    for (const error of entry.errors) {
      // Avoid duplicate line prefix if error already includes it
      if (error.startsWith('Line ')) {
        lines.push(`  ${error}`);
      } else {
        lines.push(`  ${prefix}${error}`);
      }
    }
  }

  if (summary.errors.length > 10) {
    lines.push(`  ... and ${summary.errors.length - 10} more errors`);
  }

  return lines.join('\n');
}
