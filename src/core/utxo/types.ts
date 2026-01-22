/**
 * UTXO Selection Types
 *
 * Types for UTXO selection, validation, and shortage errors.
 */
import type { Outpoint, TokenUtxo, Utxo } from '@/core/adapters/chain/types';

// ============================================================================
// Selection State
// ============================================================================

/**
 * UTXO selection mode
 */
export type UtxoSelectionMode = 'auto' | 'manual';

/**
 * Selected UTXOs for a distribution
 */
export interface SelectedUtxos {
  /** Selected token UTXOs (for distributing tokens) */
  tokenUtxos: TokenUtxo[];
  /** Selected BCH UTXOs (for fees and dust) */
  bchUtxos: Utxo[];

  /** Total token amount available from selected UTXOs */
  totalTokenAmount: bigint;
  /** Total BCH available from selected UTXOs (including token UTXO satoshis) */
  totalBchSatoshis: bigint;
}

/**
 * UTXO availability summary for an address
 */
export interface UtxoSummary {
  /** Address being summarized */
  address: string;

  /** All token UTXOs for the target token */
  tokenUtxos: TokenUtxo[];
  /** All BCH-only UTXOs (no tokens) */
  bchUtxos: Utxo[];

  /** Total fungible token amount available */
  totalTokenAmount: bigint;
  /** Total BCH in token UTXOs */
  tokenUtxoBchSatoshis: bigint;
  /** Total BCH in pure BCH UTXOs */
  pureBchSatoshis: bigint;
  /** Grand total BCH (both token and pure BCH UTXOs) */
  totalBchSatoshis: bigint;

  /** Number of NFT UTXOs excluded (safety) */
  excludedNftCount: number;

  /** Last fetched timestamp */
  fetchedAt: number;
}

// ============================================================================
// Requirements
// ============================================================================

/**
 * Requirements for a distribution
 */
export interface DistributionRequirements {
  /** Total tokens needed for all recipients */
  requiredTokenAmount: bigint;
  /** Estimated BCH needed (fees + dust) */
  requiredBchSatoshis: bigint;
  /** Maximum inputs allowed per transaction */
  maxInputsPerTx: number;
}

// ============================================================================
// Validation Result
// ============================================================================

/**
 * Result of validating UTXO selection against requirements
 */
export interface UtxoValidationResult {
  /** Whether selection meets requirements */
  valid: boolean;

  /** Errors that prevent execution */
  errors: UtxoShortageError[];

  /** Warnings that don't prevent execution but should be shown */
  warnings: UtxoWarning[];

  /** Detailed shortage information if applicable */
  shortages?: {
    tokenShortage?: bigint;
    bchShortage?: bigint;
  };
}

// ============================================================================
// Shortage Errors
// ============================================================================

/**
 * Types of UTXO-related errors
 */
export type UtxoErrorType =
  | 'INSUFFICIENT_TOKENS'
  | 'INSUFFICIENT_BCH'
  | 'NO_TOKEN_UTXOS'
  | 'NO_BCH_UTXOS'
  | 'TOO_FRAGMENTED'
  | 'INPUT_LIMIT_EXCEEDED'
  | 'FETCH_FAILED';

/**
 * Structured error for UTXO shortages
 */
export interface UtxoShortageError {
  type: UtxoErrorType;
  message: string;
  details: {
    required?: string; // bigint as string for display
    available?: string;
    shortage?: string;
    inputCount?: number;
    maxInputs?: number;
  };
}

/**
 * Warning types
 */
export type UtxoWarningType =
  | 'LOW_CONFIRMATIONS'
  | 'MANY_INPUTS'
  | 'NFTS_EXCLUDED'
  | 'UNCONFIRMED_INPUTS';

/**
 * UTXO selection warning
 */
export interface UtxoWarning {
  type: UtxoWarningType;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Selection Input/Output
// ============================================================================

/**
 * Input for auto-selection
 */
export interface AutoSelectInput {
  /** Available token UTXOs */
  tokenUtxos: TokenUtxo[];
  /** Available BCH UTXOs */
  bchUtxos: Utxo[];
  /** Requirements to satisfy */
  requirements: DistributionRequirements;
}

/**
 * Result of auto-selection
 */
export interface AutoSelectResult {
  success: boolean;
  selection?: SelectedUtxos;
  validation: UtxoValidationResult;
}

/**
 * Input for manual selection validation
 */
export interface ManualSelectInput {
  /** Manually selected token UTXO outpoints */
  selectedTokenOutpoints: Outpoint[];
  /** Manually selected BCH UTXO outpoints */
  selectedBchOutpoints: Outpoint[];
  /** All available token UTXOs */
  allTokenUtxos: TokenUtxo[];
  /** All available BCH UTXOs */
  allBchUtxos: Utxo[];
  /** Requirements to satisfy */
  requirements: DistributionRequirements;
}

// ============================================================================
// Error Message Templates
// ============================================================================

/**
 * Create insufficient tokens error
 */
export function createInsufficientTokensError(
  required: bigint,
  available: bigint,
  tokenSymbol?: string
): UtxoShortageError {
  const shortage = required - available;
  const symbol = tokenSymbol || 'tokens';
  return {
    type: 'INSUFFICIENT_TOKENS',
    message: `Insufficient ${symbol}. Required: ${required.toLocaleString()}, Available: ${available.toLocaleString()}, Missing: ${shortage.toLocaleString()}`,
    details: {
      required: required.toString(),
      available: available.toString(),
      shortage: shortage.toString(),
    },
  };
}

/**
 * Create insufficient BCH error
 */
export function createInsufficientBchError(required: bigint, available: bigint): UtxoShortageError {
  const shortage = required - available;
  const requiredBch = (Number(required) / 1e8).toFixed(8);
  const availableBch = (Number(available) / 1e8).toFixed(8);
  const shortageBch = (Number(shortage) / 1e8).toFixed(8);
  return {
    type: 'INSUFFICIENT_BCH',
    message: `Insufficient BCH for fees and dust. Required: ${requiredBch} BCH, Available: ${availableBch} BCH, Missing: ${shortageBch} BCH`,
    details: {
      required: required.toString(),
      available: available.toString(),
      shortage: shortage.toString(),
    },
  };
}

/**
 * Create no token UTXOs error
 */
export function createNoTokenUtxosError(tokenId: string): UtxoShortageError {
  return {
    type: 'NO_TOKEN_UTXOS',
    message: `No UTXOs found containing token ${tokenId.slice(0, 8)}...${tokenId.slice(-8)}`,
    details: {},
  };
}

/**
 * Create no BCH UTXOs error
 */
export function createNoBchUtxosError(): UtxoShortageError {
  return {
    type: 'NO_BCH_UTXOS',
    message: 'No BCH UTXOs available for fees. The wallet has no spendable BCH.',
    details: {},
  };
}

/**
 * Create too fragmented error
 */
export function createTooFragmentedError(
  inputCount: number,
  maxInputs: number,
  requiredAmount: bigint,
  availableAmount: bigint
): UtxoShortageError {
  return {
    type: 'TOO_FRAGMENTED',
    message: `UTXOs are too fragmented. Would need ${inputCount} inputs but max is ${maxInputs} per transaction. Consider consolidating UTXOs first.`,
    details: {
      required: requiredAmount.toString(),
      available: availableAmount.toString(),
      inputCount,
      maxInputs,
    },
  };
}

/**
 * Create input limit exceeded error
 */
export function createInputLimitExceededError(
  inputCount: number,
  maxInputs: number
): UtxoShortageError {
  return {
    type: 'INPUT_LIMIT_EXCEEDED',
    message: `Selected ${inputCount} inputs but maximum allowed is ${maxInputs} per transaction.`,
    details: {
      inputCount,
      maxInputs,
    },
  };
}

/**
 * Create fetch failed error
 */
export function createFetchFailedError(errorMessage: string): UtxoShortageError {
  return {
    type: 'FETCH_FAILED',
    message: `Failed to fetch UTXOs: ${errorMessage}`,
    details: {},
  };
}
