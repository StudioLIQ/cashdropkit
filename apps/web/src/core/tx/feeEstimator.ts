/**
 * Fee Estimator for CashTokens Transactions
 *
 * Provides size estimation and fee calculation for token distribution transactions.
 * Uses conservative estimates with safety margins to prevent execution failures.
 */

// ============================================================================
// Transaction Size Constants (bytes)
// ============================================================================

/**
 * Base transaction overhead (version + locktime)
 * - 4 bytes version
 * - 4 bytes locktime
 */
export const TX_BASE_SIZE = 8;

/**
 * Input size for P2PKH (most common for BCH)
 * - 32 bytes txid
 * - 4 bytes vout
 * - 1 byte script length
 * - ~107 bytes scriptSig (signature + pubkey)
 * - 4 bytes sequence
 */
export const INPUT_SIZE_P2PKH = 148;

/**
 * Input size for token UTXO (P2PKH with prefix byte)
 * Similar to P2PKH but token data is in the output script, not input
 */
export const INPUT_SIZE_TOKEN = 148;

/**
 * Output size for P2PKH (BCH only)
 * - 8 bytes value
 * - 1 byte script length
 * - 25 bytes scriptPubKey (P2PKH)
 */
export const OUTPUT_SIZE_P2PKH = 34;

/**
 * Output size for token output (P2PKH with CashToken prefix)
 * - 8 bytes value
 * - 1 byte script length
 * - 1 byte token prefix (0xef)
 * - 32 bytes category
 * - 1-9 bytes amount (CompactSize + varint)
 * - 25 bytes P2PKH script
 * Average ~67 bytes, use 70 for safety
 */
export const OUTPUT_SIZE_TOKEN_FT = 70;

/**
 * Output size for OP_RETURN (optional memo/tag)
 * - 8 bytes value (0)
 * - 1 byte script length
 * - up to 220 bytes OP_RETURN data
 * Conservative estimate for small memos
 */
export const OUTPUT_SIZE_OP_RETURN = 40;

/**
 * VarInt overhead for input/output counts
 * - 1 byte each for counts < 253
 * - 3 bytes for counts < 65535
 */
export const VARINT_SIZE_SMALL = 1;
export const VARINT_SIZE_MEDIUM = 3;

// ============================================================================
// Fee Calculation
// ============================================================================

/**
 * Minimum fee rate (sat/byte) - most nodes accept 1.0
 */
export const MIN_FEE_RATE = 1.0;

/**
 * Default fee rate with small safety margin
 */
export const DEFAULT_FEE_RATE = 1.0;

/**
 * Fee estimation safety margin (15% extra)
 * Accounts for slight variations in actual vs estimated size
 */
export const FEE_SAFETY_MARGIN = 1.15;

/**
 * Minimum dust threshold for token outputs (in satoshis)
 * Lower values may be rejected by some nodes
 */
export const MIN_DUST_SATOSHIS = 546n;

/**
 * Default dust per output (conservative)
 */
export const DEFAULT_DUST_SATOSHIS = 800n;

// ============================================================================
// Size Estimation
// ============================================================================

/**
 * Get VarInt size for a count
 */
export function getVarIntSize(count: number): number {
  if (count < 253) return VARINT_SIZE_SMALL;
  if (count < 65536) return VARINT_SIZE_MEDIUM;
  return 5; // Very large counts (unlikely)
}

/**
 * Parameters for estimating transaction size
 */
export interface TxSizeParams {
  /** Number of BCH-only inputs (P2PKH) */
  bchInputCount: number;
  /** Number of token inputs */
  tokenInputCount: number;
  /** Number of recipient outputs (token) */
  recipientCount: number;
  /** Include token change output */
  hasTokenChange: boolean;
  /** Include BCH change output */
  hasBchChange: boolean;
  /** Include OP_RETURN output */
  hasOpReturn: boolean;
  /** OP_RETURN data size (if any) */
  opReturnSize?: number;
}

/**
 * Estimate transaction size in bytes
 *
 * Uses conservative estimates to ensure fee is sufficient.
 */
export function estimateTxSize(params: TxSizeParams): number {
  const {
    bchInputCount,
    tokenInputCount,
    recipientCount,
    hasTokenChange,
    hasBchChange,
    hasOpReturn,
    opReturnSize = 20,
  } = params;

  const totalInputs = bchInputCount + tokenInputCount;
  const totalOutputs =
    recipientCount + (hasTokenChange ? 1 : 0) + (hasBchChange ? 1 : 0) + (hasOpReturn ? 1 : 0);

  // Base overhead
  let size = TX_BASE_SIZE;

  // Input/output count varints
  size += getVarIntSize(totalInputs);
  size += getVarIntSize(totalOutputs);

  // Inputs
  size += bchInputCount * INPUT_SIZE_P2PKH;
  size += tokenInputCount * INPUT_SIZE_TOKEN;

  // Outputs
  size += recipientCount * OUTPUT_SIZE_TOKEN_FT; // Recipient token outputs
  if (hasTokenChange) size += OUTPUT_SIZE_TOKEN_FT; // Token change
  if (hasBchChange) size += OUTPUT_SIZE_P2PKH; // BCH change
  if (hasOpReturn) size += 9 + opReturnSize; // OP_RETURN (value + script header + data)

  return size;
}

/**
 * Result of fee estimation
 */
export interface FeeEstimate {
  /** Estimated transaction size in bytes */
  sizeBytes: number;
  /** Base fee (size * rate) */
  baseFee: bigint;
  /** Fee with safety margin */
  feeWithMargin: bigint;
  /** Total dust required for outputs */
  totalDust: bigint;
  /** Total BCH required (fee + dust) */
  totalRequired: bigint;
}

/**
 * Estimate fee for a transaction
 */
export function estimateFee(
  sizeParams: TxSizeParams,
  feeRateSatPerByte: number,
  dustSatPerOutput: bigint
): FeeEstimate {
  const sizeBytes = estimateTxSize(sizeParams);

  // Calculate base fee
  const baseFee = BigInt(Math.ceil(sizeBytes * feeRateSatPerByte));

  // Apply safety margin
  const feeWithMargin = BigInt(Math.ceil(Number(baseFee) * FEE_SAFETY_MARGIN));

  // Calculate dust: recipient outputs + token change (BCH change doesn't need dust)
  const dustOutputCount = sizeParams.recipientCount + (sizeParams.hasTokenChange ? 1 : 0);
  const totalDust = dustSatPerOutput * BigInt(dustOutputCount);

  // Total required BCH
  const totalRequired = feeWithMargin + totalDust;

  return {
    sizeBytes,
    baseFee,
    feeWithMargin,
    totalDust,
    totalRequired,
  };
}

// ============================================================================
// Batch Size Calculation
// ============================================================================

/**
 * Parameters for calculating recipients per batch
 */
export interface BatchSizeParams {
  /** Maximum outputs per transaction */
  maxOutputsPerTx: number;
  /** Maximum inputs per transaction */
  maxInputsPerTx: number;
  /** Include token change output in count */
  reserveTokenChange: boolean;
  /** Include BCH change output in count */
  reserveBchChange: boolean;
  /** Include OP_RETURN output in count */
  reserveOpReturn: boolean;
}

/**
 * Default batch size parameters
 */
export const DEFAULT_BATCH_PARAMS: BatchSizeParams = {
  maxOutputsPerTx: 80,
  maxInputsPerTx: 50,
  reserveTokenChange: true,
  reserveBchChange: true,
  reserveOpReturn: false,
};

/**
 * Calculate maximum recipients per batch
 *
 * Subtracts reserved outputs (change, OP_RETURN) from maxOutputsPerTx
 */
export function calculateRecipientsPerBatch(params: BatchSizeParams): number {
  let reserved = 0;

  if (params.reserveTokenChange) reserved += 1;
  if (params.reserveBchChange) reserved += 1;
  if (params.reserveOpReturn) reserved += 1;

  const available = params.maxOutputsPerTx - reserved;

  // Minimum 1 recipient per batch
  return Math.max(1, available);
}

/**
 * Calculate number of batches needed for recipients
 */
export function calculateBatchCount(recipientCount: number, recipientsPerBatch: number): number {
  if (recipientCount === 0) return 0;
  return Math.ceil(recipientCount / recipientsPerBatch);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate fee rate
 */
export function validateFeeRate(feeRate: number): { valid: boolean; error?: string } {
  if (feeRate < MIN_FEE_RATE) {
    return { valid: false, error: `Fee rate must be at least ${MIN_FEE_RATE} sat/byte` };
  }
  if (feeRate > 1000) {
    return { valid: false, error: 'Fee rate is unusually high (>1000 sat/byte)' };
  }
  return { valid: true };
}

/**
 * Validate dust amount
 */
export function validateDust(dust: bigint): { valid: boolean; error?: string; warning?: string } {
  if (dust < MIN_DUST_SATOSHIS) {
    return {
      valid: false,
      error: `Dust must be at least ${MIN_DUST_SATOSHIS} satoshis to avoid relay rejection`,
    };
  }
  if (dust < DEFAULT_DUST_SATOSHIS) {
    return {
      valid: true,
      warning: `Dust below ${DEFAULT_DUST_SATOSHIS} satoshis may be rejected by some nodes`,
    };
  }
  if (dust > 10000n) {
    return {
      valid: true,
      warning: 'Dust above 10000 satoshis is unusually high',
    };
  }
  return { valid: true };
}
