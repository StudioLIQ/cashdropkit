/**
 * Airdrop Planner
 *
 * Generates a distribution plan by:
 * 1. Batching recipients based on maxOutputsPerTx
 * 2. Estimating fees and dust for each batch
 * 3. Calculating total BCH required
 *
 * The planner is deterministic - same inputs produce same plan.
 */
import type {
  AirdropCampaign,
  AirdropSettings,
  BatchPlan,
  DistributionPlan,
  RecipientRow,
} from '@/core/db/types';
import {
  DEFAULT_DUST_SATOSHIS,
  MIN_DUST_SATOSHIS,
  type TxSizeParams,
  calculateBatchCount,
  calculateRecipientsPerBatch,
  estimateFee,
  estimateTxSize,
} from '@/core/tx/feeEstimator';

/**
 * Generate a UUID using the built-in crypto API
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Types
// ============================================================================

/**
 * Input for the planner
 */
export interface PlannerInput {
  /** Valid recipients to distribute to */
  recipients: RecipientRow[];
  /** Campaign settings */
  settings: AirdropSettings;
  /** Token ID (for logging/debugging) */
  tokenId?: string;
}

/**
 * Result from the planner
 */
export interface PlannerResult {
  success: boolean;
  plan?: DistributionPlan;
  errors: PlannerError[];
  warnings: PlannerWarning[];
}

/**
 * Planner error types
 */
export type PlannerErrorType =
  | 'NO_RECIPIENTS'
  | 'INVALID_SETTINGS'
  | 'BATCH_OVERFLOW'
  | 'AMOUNT_OVERFLOW';

/**
 * Planner error
 */
export interface PlannerError {
  type: PlannerErrorType;
  message: string;
  details?: unknown;
}

/**
 * Planner warning types
 */
export type PlannerWarningType =
  | 'LOW_DUST'
  | 'HIGH_FEE_RATE'
  | 'MANY_BATCHES'
  | 'LARGE_TOTAL_AMOUNT'
  | 'FEW_RECIPIENTS_PER_BATCH';

/**
 * Planner warning
 */
export interface PlannerWarning {
  type: PlannerWarningType;
  message: string;
  details?: unknown;
}

// ============================================================================
// Plan Generation
// ============================================================================

/**
 * Generate a distribution plan from campaign data
 *
 * This is the main entry point for planning.
 */
export function generatePlan(input: PlannerInput): PlannerResult {
  const errors: PlannerError[] = [];
  const warnings: PlannerWarning[] = [];

  // Validate inputs
  const validRecipients = input.recipients.filter((r) => r.valid);

  if (validRecipients.length === 0) {
    errors.push({
      type: 'NO_RECIPIENTS',
      message: 'No valid recipients to distribute to',
    });
    return { success: false, errors, warnings };
  }

  // Validate settings
  const settingsValidation = validateSettings(input.settings);
  if (!settingsValidation.valid) {
    errors.push({
      type: 'INVALID_SETTINGS',
      message: settingsValidation.error!,
    });
    return { success: false, errors, warnings };
  }
  if (settingsValidation.warnings) {
    warnings.push(...settingsValidation.warnings);
  }

  // Calculate batch sizing
  const recipientsPerBatch = calculateRecipientsPerBatch({
    maxOutputsPerTx: input.settings.maxOutputsPerTx,
    maxInputsPerTx: input.settings.maxInputsPerTx,
    reserveTokenChange: true,
    reserveBchChange: true,
    reserveOpReturn: false,
  });

  const batchCount = calculateBatchCount(validRecipients.length, recipientsPerBatch);

  // Warn if many batches
  if (batchCount > 100) {
    warnings.push({
      type: 'MANY_BATCHES',
      message: `Distribution will require ${batchCount} transactions. Consider increasing maxOutputsPerTx if possible.`,
      details: { batchCount, recipientsPerBatch },
    });
  }

  // Warn if few recipients per batch
  if (recipientsPerBatch < 10 && validRecipients.length > 10) {
    warnings.push({
      type: 'FEW_RECIPIENTS_PER_BATCH',
      message: `Only ${recipientsPerBatch} recipients per transaction. This may result in higher total fees.`,
      details: { recipientsPerBatch },
    });
  }

  // Create batches
  const batches = createBatches(validRecipients, recipientsPerBatch, input.settings);

  // Calculate totals
  const totalTokenAmount = validRecipients.reduce((sum, r) => sum + BigInt(r.amountBase), 0n);

  let totalFeeSat = 0n;
  let totalDustSat = 0n;

  for (const batch of batches) {
    totalFeeSat += BigInt(batch.estimatedFeeSat);
    const dustPerOutput = BigInt(input.settings.dustSatPerOutput);
    // Dust for recipient outputs + token change
    totalDustSat += dustPerOutput * BigInt(batch.outputsCount);
  }

  const requiredBchSat = totalFeeSat + totalDustSat;

  // Build the plan
  const plan: DistributionPlan = {
    generatedAt: Date.now(),
    totalRecipients: validRecipients.length,
    totalTokenAmountBase: totalTokenAmount.toString(),
    estimated: {
      txCount: batches.length,
      totalFeeSat: totalFeeSat.toString(),
      totalDustSat: totalDustSat.toString(),
      requiredBchSat: requiredBchSat.toString(),
    },
    batches,
  };

  return {
    success: true,
    plan,
    errors,
    warnings,
  };
}

/**
 * Generate a plan directly from a campaign
 */
export function generatePlanFromCampaign(campaign: AirdropCampaign): PlannerResult {
  return generatePlan({
    recipients: campaign.recipients,
    settings: campaign.settings,
    tokenId: campaign.token.tokenId,
  });
}

// ============================================================================
// Batch Creation
// ============================================================================

/**
 * Create batches from recipients
 *
 * Recipients are batched in order (deterministic).
 * Each batch gets a unique ID and estimated costs.
 */
function createBatches(
  recipients: RecipientRow[],
  recipientsPerBatch: number,
  settings: AirdropSettings
): BatchPlan[] {
  const batches: BatchPlan[] = [];
  const dustSat = BigInt(settings.dustSatPerOutput);

  for (let i = 0; i < recipients.length; i += recipientsPerBatch) {
    const batchRecipients = recipients.slice(i, i + recipientsPerBatch);
    const isLastBatch = i + recipientsPerBatch >= recipients.length;

    // Estimate transaction size
    const sizeParams: TxSizeParams = {
      bchInputCount: 1, // Conservative: at least 1 BCH input for fees
      tokenInputCount: 1, // Conservative: at least 1 token input
      recipientCount: batchRecipients.length,
      hasTokenChange: !isLastBatch, // Last batch may not need token change
      hasBchChange: true, // Usually have BCH change
      hasOpReturn: false,
    };

    const estimate = estimateFee(sizeParams, settings.feeRateSatPerByte, dustSat);

    const batch: BatchPlan = {
      id: generateId(),
      recipients: batchRecipients.map((r) => r.id),
      estimatedFeeSat: estimate.feeWithMargin.toString(),
      estimatedSizeBytes: estimate.sizeBytes,
      tokenInputs: [], // Will be filled during execution
      bchInputs: [], // Will be filled during execution
      outputsCount: batchRecipients.length + (sizeParams.hasTokenChange ? 1 : 0),
    };

    batches.push(batch);
  }

  return batches;
}

// ============================================================================
// Settings Validation
// ============================================================================

interface SettingsValidation {
  valid: boolean;
  error?: string;
  warnings?: PlannerWarning[];
}

function validateSettings(settings: AirdropSettings): SettingsValidation {
  const warnings: PlannerWarning[] = [];

  // Validate maxOutputsPerTx
  if (settings.maxOutputsPerTx < 3) {
    return {
      valid: false,
      error: 'maxOutputsPerTx must be at least 3 (1 recipient + change outputs)',
    };
  }

  if (settings.maxOutputsPerTx > 200) {
    return {
      valid: false,
      error: 'maxOutputsPerTx must be at most 200 (transaction size limits)',
    };
  }

  // Validate maxInputsPerTx
  if (settings.maxInputsPerTx < 1) {
    return {
      valid: false,
      error: 'maxInputsPerTx must be at least 1',
    };
  }

  // Validate feeRateSatPerByte
  if (settings.feeRateSatPerByte < 1) {
    return {
      valid: false,
      error: 'feeRateSatPerByte must be at least 1',
    };
  }

  if (settings.feeRateSatPerByte > 100) {
    warnings.push({
      type: 'HIGH_FEE_RATE',
      message: `Fee rate of ${settings.feeRateSatPerByte} sat/byte is unusually high`,
    });
  }

  // Validate dustSatPerOutput
  const dustBigInt = BigInt(settings.dustSatPerOutput);
  if (dustBigInt < MIN_DUST_SATOSHIS) {
    return {
      valid: false,
      error: `dustSatPerOutput must be at least ${MIN_DUST_SATOSHIS} satoshis`,
    };
  }

  if (dustBigInt < DEFAULT_DUST_SATOSHIS) {
    warnings.push({
      type: 'LOW_DUST',
      message: `Dust of ${settings.dustSatPerOutput} satoshis may be rejected by some nodes`,
    });
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

// ============================================================================
// Plan Recalculation (for settings changes)
// ============================================================================

/**
 * Quick recalculation when settings change
 *
 * Returns summary without generating full BatchPlan objects.
 * Use this for instant UI updates when slider values change.
 */
export interface QuickEstimate {
  recipientCount: number;
  recipientsPerBatch: number;
  batchCount: number;
  estimatedTotalFee: bigint;
  estimatedTotalDust: bigint;
  estimatedTotalRequired: bigint;
}

export function quickEstimate(recipientCount: number, settings: AirdropSettings): QuickEstimate {
  if (recipientCount === 0) {
    return {
      recipientCount: 0,
      recipientsPerBatch: 0,
      batchCount: 0,
      estimatedTotalFee: 0n,
      estimatedTotalDust: 0n,
      estimatedTotalRequired: 0n,
    };
  }

  const recipientsPerBatch = calculateRecipientsPerBatch({
    maxOutputsPerTx: settings.maxOutputsPerTx,
    maxInputsPerTx: settings.maxInputsPerTx,
    reserveTokenChange: true,
    reserveBchChange: true,
    reserveOpReturn: false,
  });

  const batchCount = calculateBatchCount(recipientCount, recipientsPerBatch);
  const dustSat = BigInt(settings.dustSatPerOutput);

  // Estimate average batch size
  const avgRecipientsPerBatch = Math.ceil(recipientCount / batchCount);

  // Estimate single batch
  const singleBatchSize = estimateTxSize({
    bchInputCount: 1,
    tokenInputCount: 1,
    recipientCount: avgRecipientsPerBatch,
    hasTokenChange: true,
    hasBchChange: true,
    hasOpReturn: false,
  });

  const singleBatchFee = BigInt(Math.ceil(singleBatchSize * settings.feeRateSatPerByte * 1.15));

  // Total estimates
  const estimatedTotalFee = singleBatchFee * BigInt(batchCount);
  // Dust per batch: recipients + token change
  const dustPerBatch = dustSat * BigInt(avgRecipientsPerBatch + 1);
  const estimatedTotalDust = dustPerBatch * BigInt(batchCount);
  const estimatedTotalRequired = estimatedTotalFee + estimatedTotalDust;

  return {
    recipientCount,
    recipientsPerBatch,
    batchCount,
    estimatedTotalFee,
    estimatedTotalDust,
    estimatedTotalRequired,
  };
}

// ============================================================================
// Plan Comparison
// ============================================================================

/**
 * Check if a plan is still valid for the current campaign state
 *
 * A plan becomes invalid when:
 * - Recipients changed
 * - Settings changed significantly
 */
export function isPlanValid(campaign: AirdropCampaign): boolean {
  if (!campaign.plan) return false;

  const validRecipients = campaign.recipients.filter((r) => r.valid);

  // Check recipient count
  if (campaign.plan.totalRecipients !== validRecipients.length) {
    return false;
  }

  // Check batch count matches expected
  const recipientsPerBatch = calculateRecipientsPerBatch({
    maxOutputsPerTx: campaign.settings.maxOutputsPerTx,
    maxInputsPerTx: campaign.settings.maxInputsPerTx,
    reserveTokenChange: true,
    reserveBchChange: true,
    reserveOpReturn: false,
  });

  const expectedBatchCount = calculateBatchCount(validRecipients.length, recipientsPerBatch);
  if (campaign.plan.batches.length !== expectedBatchCount) {
    return false;
  }

  return true;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format satoshis as BCH string
 */
export function formatSatoshisAsBch(satoshis: bigint | string): string {
  const sat = typeof satoshis === 'string' ? BigInt(satoshis) : satoshis;
  const bch = Number(sat) / 100_000_000;
  return bch.toFixed(8);
}

/**
 * Format satoshis as compact string
 */
export function formatSatoshis(satoshis: bigint | string): string {
  const sat = typeof satoshis === 'string' ? BigInt(satoshis) : satoshis;
  if (sat >= 100_000_000n) {
    return `${formatSatoshisAsBch(sat)} BCH`;
  }
  return `${sat.toLocaleString()} sats`;
}
