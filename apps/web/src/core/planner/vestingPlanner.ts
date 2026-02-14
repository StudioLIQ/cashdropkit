/**
 * Vesting Planner
 *
 * Generates a vesting plan by:
 * 1. Flattening all tranches from all beneficiaries
 * 2. Batching lockbox outputs based on maxOutputsPerTx
 * 3. Estimating fees and dust for each batch
 * 4. Calculating total BCH required
 *
 * The planner is deterministic - same inputs produce same plan.
 */
import type {
  BeneficiaryRow,
  VestingCampaign,
  VestingPlan,
  VestingSettings,
} from '@/core/db/types';
import {
  DEFAULT_DUST_SATOSHIS,
  MIN_DUST_SATOSHIS,
  type TxSizeParams,
  calculateBatchCount,
  estimateFee,
  estimateTxSize,
} from '@/core/tx/feeEstimator';

// ============================================================================
// Types
// ============================================================================

/** Flattened tranche reference for planning */
interface FlatTranche {
  trancheId: string;
  beneficiaryId: string;
  unlockTime: number;
  amountBase: string;
}

/**
 * Input for the vesting planner
 */
export interface VestingPlannerInput {
  /** Valid beneficiaries with tranches */
  beneficiaries: BeneficiaryRow[];
  /** Vesting settings */
  settings: VestingSettings;
  /** Max outputs per transaction (from campaign or default) */
  maxOutputsPerTx: number;
}

/**
 * Result from the vesting planner
 */
export interface VestingPlannerResult {
  success: boolean;
  plan?: VestingPlan;
  errors: VestingPlannerError[];
  warnings: VestingPlannerWarning[];
}

export type VestingPlannerErrorType = 'NO_BENEFICIARIES' | 'NO_TRANCHES' | 'INVALID_SETTINGS';

export interface VestingPlannerError {
  type: VestingPlannerErrorType;
  message: string;
  details?: unknown;
}

export type VestingPlannerWarningType =
  | 'LOW_DUST'
  | 'HIGH_FEE_RATE'
  | 'MANY_BATCHES'
  | 'MANY_LOCKBOXES';

export interface VestingPlannerWarning {
  type: VestingPlannerWarningType;
  message: string;
  details?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

/** Default max outputs per tx for vesting (lockbox creation) */
const DEFAULT_MAX_OUTPUTS = 80;

/**
 * Reserved outputs per batch:
 * - 1 token change output (except possibly last batch)
 * - 1 BCH change output
 */
const RESERVED_OUTPUTS = 2;

// ============================================================================
// Plan Generation
// ============================================================================

/**
 * Generate a vesting plan from input data.
 */
export function generateVestingPlan(input: VestingPlannerInput): VestingPlannerResult {
  const errors: VestingPlannerError[] = [];
  const warnings: VestingPlannerWarning[] = [];

  // Validate beneficiaries
  const validBeneficiaries = input.beneficiaries.filter((b) => b.valid);
  if (validBeneficiaries.length === 0) {
    errors.push({
      type: 'NO_BENEFICIARIES',
      message: 'No valid beneficiaries to create lockboxes for',
    });
    return { success: false, errors, warnings };
  }

  // Flatten tranches
  const flatTranches = flattenTranches(validBeneficiaries);
  if (flatTranches.length === 0) {
    errors.push({
      type: 'NO_TRANCHES',
      message: 'No tranches found in valid beneficiaries',
    });
    return { success: false, errors, warnings };
  }

  // Validate settings
  const settingsValidation = validateVestingSettings(input.settings);
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
  const maxOutputs = input.maxOutputsPerTx || DEFAULT_MAX_OUTPUTS;
  const lockboxesPerBatch = Math.max(1, maxOutputs - RESERVED_OUTPUTS);
  const batchCount = calculateBatchCount(flatTranches.length, lockboxesPerBatch);

  // Warnings
  if (batchCount > 100) {
    warnings.push({
      type: 'MANY_BATCHES',
      message: `Vesting will require ${batchCount} transactions. Consider increasing maxOutputsPerTx.`,
      details: { batchCount, lockboxesPerBatch },
    });
  }

  if (flatTranches.length > 1000) {
    warnings.push({
      type: 'MANY_LOCKBOXES',
      message: `Creating ${flatTranches.length} lockboxes. This will require significant BCH for dust.`,
      details: { totalLockboxes: flatTranches.length },
    });
  }

  // Create batches
  const dustSat = BigInt(input.settings.dustSatPerOutput);
  const batches = createVestingBatches(
    flatTranches,
    lockboxesPerBatch,
    input.settings.feeRateSatPerByte,
    dustSat
  );

  // Calculate totals
  let totalFeeSat = 0n;
  let totalDustSat = 0n;

  for (const batch of batches) {
    totalFeeSat += BigInt(batch.estimatedFeeSat);
    // Dust for lockbox outputs + token change
    const lockboxCount = batch.trancheIds.length;
    const isLastBatch = batch === batches[batches.length - 1];
    const tokenChangeCount = isLastBatch ? 0 : 1;
    totalDustSat += dustSat * BigInt(lockboxCount + tokenChangeCount);
  }

  const requiredBchSat = totalFeeSat + totalDustSat;

  const plan: VestingPlan = {
    generatedAt: Date.now(),
    totalLockboxes: flatTranches.length,
    estimated: {
      txCount: batches.length,
      totalFeeSat: totalFeeSat.toString(),
      totalDustSat: totalDustSat.toString(),
      requiredBchSat: requiredBchSat.toString(),
    },
    batches,
  };

  return { success: true, plan, errors, warnings };
}

/**
 * Generate a plan directly from a vesting campaign.
 */
export function generateVestingPlanFromCampaign(campaign: VestingCampaign): VestingPlannerResult {
  return generateVestingPlan({
    beneficiaries: campaign.beneficiaries,
    settings: campaign.settings,
    maxOutputsPerTx: DEFAULT_MAX_OUTPUTS,
  });
}

// ============================================================================
// Tranche Flattening
// ============================================================================

/**
 * Flatten all tranches from all beneficiaries into a single ordered list.
 * Order: by beneficiary (array order), then by tranche (array order).
 */
function flattenTranches(beneficiaries: BeneficiaryRow[]): FlatTranche[] {
  const result: FlatTranche[] = [];
  for (const beneficiary of beneficiaries) {
    for (const tranche of beneficiary.tranches) {
      result.push({
        trancheId: tranche.id,
        beneficiaryId: beneficiary.id,
        unlockTime: tranche.unlockTime,
        amountBase: tranche.amountBase,
      });
    }
  }
  return result;
}

// ============================================================================
// Batch Creation
// ============================================================================

function createVestingBatches(
  tranches: FlatTranche[],
  lockboxesPerBatch: number,
  feeRateSatPerByte: number,
  dustSat: bigint
): VestingPlan['batches'] {
  const batches: VestingPlan['batches'] = [];

  for (let i = 0; i < tranches.length; i += lockboxesPerBatch) {
    const batchTranches = tranches.slice(i, i + lockboxesPerBatch);
    const isLastBatch = i + lockboxesPerBatch >= tranches.length;

    // Estimate transaction size
    // Lockbox outputs are token outputs to P2SH addresses (similar size to P2PKH token outputs)
    const sizeParams: TxSizeParams = {
      bchInputCount: 1,
      tokenInputCount: 1,
      recipientCount: batchTranches.length,
      hasTokenChange: !isLastBatch,
      hasBchChange: true,
      hasOpReturn: false,
    };

    const estimate = estimateFee(sizeParams, feeRateSatPerByte, dustSat);

    batches.push({
      id: crypto.randomUUID(),
      trancheIds: batchTranches.map((t) => t.trancheId),
      estimatedFeeSat: estimate.feeWithMargin.toString(),
      estimatedSizeBytes: estimate.sizeBytes,
    });
  }

  return batches;
}

// ============================================================================
// Settings Validation
// ============================================================================

interface SettingsValidation {
  valid: boolean;
  error?: string;
  warnings?: VestingPlannerWarning[];
}

function validateVestingSettings(settings: VestingSettings): SettingsValidation {
  const warnings: VestingPlannerWarning[] = [];

  if (settings.feeRateSatPerByte < 1) {
    return { valid: false, error: 'feeRateSatPerByte must be at least 1' };
  }

  if (settings.feeRateSatPerByte > 100) {
    warnings.push({
      type: 'HIGH_FEE_RATE',
      message: `Fee rate of ${settings.feeRateSatPerByte} sat/byte is unusually high`,
    });
  }

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
// Quick Estimate (for UI)
// ============================================================================

export interface VestingQuickEstimate {
  totalLockboxes: number;
  lockboxesPerBatch: number;
  batchCount: number;
  estimatedTotalFee: bigint;
  estimatedTotalDust: bigint;
  estimatedTotalRequired: bigint;
}

/**
 * Quick estimate for UI updates without full plan generation.
 */
export function vestingQuickEstimate(
  totalTranches: number,
  settings: VestingSettings,
  maxOutputsPerTx: number = DEFAULT_MAX_OUTPUTS
): VestingQuickEstimate {
  if (totalTranches === 0) {
    return {
      totalLockboxes: 0,
      lockboxesPerBatch: 0,
      batchCount: 0,
      estimatedTotalFee: 0n,
      estimatedTotalDust: 0n,
      estimatedTotalRequired: 0n,
    };
  }

  const lockboxesPerBatch = Math.max(1, maxOutputsPerTx - RESERVED_OUTPUTS);
  const batchCount = calculateBatchCount(totalTranches, lockboxesPerBatch);
  const dustSat = BigInt(settings.dustSatPerOutput);

  // Estimate average batch size
  const avgLockboxesPerBatch = Math.ceil(totalTranches / batchCount);

  const singleBatchSize = estimateTxSize({
    bchInputCount: 1,
    tokenInputCount: 1,
    recipientCount: avgLockboxesPerBatch,
    hasTokenChange: true,
    hasBchChange: true,
    hasOpReturn: false,
  });

  const singleBatchFee = BigInt(Math.ceil(singleBatchSize * settings.feeRateSatPerByte * 1.15));

  const estimatedTotalFee = singleBatchFee * BigInt(batchCount);
  const dustPerBatch = dustSat * BigInt(avgLockboxesPerBatch + 1);
  const estimatedTotalDust = dustPerBatch * BigInt(batchCount);
  const estimatedTotalRequired = estimatedTotalFee + estimatedTotalDust;

  return {
    totalLockboxes: totalTranches,
    lockboxesPerBatch,
    batchCount,
    estimatedTotalFee,
    estimatedTotalDust,
    estimatedTotalRequired,
  };
}

// ============================================================================
// Plan Validation
// ============================================================================

/**
 * Check if a vesting plan is still valid for the current campaign state.
 */
export function isVestingPlanValid(campaign: VestingCampaign): boolean {
  if (!campaign.plan) return false;

  const validBeneficiaries = campaign.beneficiaries.filter((b) => b.valid);
  const totalTranches = validBeneficiaries.reduce((sum, b) => sum + b.tranches.length, 0);

  if (campaign.plan.totalLockboxes !== totalTranches) {
    return false;
  }

  return true;
}
