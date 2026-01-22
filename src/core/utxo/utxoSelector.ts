/**
 * UTXO Selector
 *
 * Handles UTXO selection for token distributions:
 * - Auto selection: chooses largest UTXOs first
 * - Manual selection: validates user-selected UTXOs
 * - Shortage detection with precise error messages
 */
import type { Outpoint, TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import { isNftUtxo, outpointId } from '@/core/adapters/chain/types';

import type {
  AutoSelectInput,
  AutoSelectResult,
  ManualSelectInput,
  SelectedUtxos,
  UtxoShortageError,
  UtxoSummary,
  UtxoValidationResult,
  UtxoWarning,
} from './types';
import {
  createInputLimitExceededError,
  createInsufficientBchError,
  createInsufficientTokensError,
  createNoBchUtxosError,
  createNoTokenUtxosError,
  createTooFragmentedError,
} from './types';

// ============================================================================
// UTXO Filtering and Summarization
// ============================================================================

/**
 * Filter token UTXOs for a specific token category
 *
 * By default excludes NFT-bearing UTXOs for safety.
 * Set includeNfts=true to include them (advanced use).
 */
export function filterTokenUtxos(
  utxos: TokenUtxo[],
  tokenCategory: string,
  includeNfts: boolean = false
): { selected: TokenUtxo[]; excludedNftCount: number } {
  let excludedNftCount = 0;

  const selected = utxos.filter((utxo) => {
    // Must match token category
    if (utxo.token.category !== tokenCategory) {
      return false;
    }

    // Check NFT handling
    const isNft = isNftUtxo(utxo);
    if (isNft && !includeNfts) {
      excludedNftCount++;
      return false;
    }

    // For fungible tokens (non-NFT), must have amount > 0
    // NFTs can have amount = 0 (they represent the NFT itself)
    if (!isNft && utxo.token.amount <= 0n) {
      return false;
    }

    return true;
  });

  return { selected, excludedNftCount };
}

/**
 * Filter BCH-only UTXOs (no tokens attached)
 */
export function filterBchUtxos(utxos: Utxo[]): Utxo[] {
  // Utxo type means no token, but double-check
  return utxos.filter((utxo) => {
    // Exclude dust UTXOs (< 546 sats)
    if (utxo.satoshis < 546n) {
      return false;
    }
    return true;
  });
}

/**
 * Create a summary of available UTXOs for an address
 */
export function summarizeUtxos(
  address: string,
  tokenUtxos: TokenUtxo[],
  bchUtxos: Utxo[],
  tokenCategory: string
): UtxoSummary {
  const { selected: filteredTokenUtxos, excludedNftCount } = filterTokenUtxos(
    tokenUtxos,
    tokenCategory
  );
  const filteredBchUtxos = filterBchUtxos(bchUtxos);

  const totalTokenAmount = filteredTokenUtxos.reduce((sum, u) => sum + u.token.amount, 0n);
  const tokenUtxoBchSatoshis = filteredTokenUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
  const pureBchSatoshis = filteredBchUtxos.reduce((sum, u) => sum + u.satoshis, 0n);

  return {
    address,
    tokenUtxos: filteredTokenUtxos,
    bchUtxos: filteredBchUtxos,
    totalTokenAmount,
    tokenUtxoBchSatoshis,
    pureBchSatoshis,
    totalBchSatoshis: tokenUtxoBchSatoshis + pureBchSatoshis,
    excludedNftCount,
    fetchedAt: Date.now(),
  };
}

// ============================================================================
// Auto Selection
// ============================================================================

/**
 * Sort UTXOs by amount descending (largest first)
 */
function sortTokenUtxosByAmount(utxos: TokenUtxo[]): TokenUtxo[] {
  return [...utxos].sort((a, b) => {
    if (b.token.amount > a.token.amount) return 1;
    if (b.token.amount < a.token.amount) return -1;
    return 0;
  });
}

/**
 * Sort BCH UTXOs by satoshis descending (largest first)
 */
function sortBchUtxosBySatoshis(utxos: Utxo[]): Utxo[] {
  return [...utxos].sort((a, b) => {
    if (b.satoshis > a.satoshis) return 1;
    if (b.satoshis < a.satoshis) return -1;
    return 0;
  });
}

/**
 * Auto-select UTXOs to meet requirements
 *
 * Strategy:
 * 1. Sort token UTXOs by amount (largest first)
 * 2. Select token UTXOs until we have enough tokens
 * 3. Calculate remaining BCH needed (subtract token UTXO satoshis)
 * 4. Sort BCH UTXOs by satoshis (largest first)
 * 5. Select BCH UTXOs until we have enough BCH
 *
 * Returns early errors if impossible to satisfy requirements.
 */
export function autoSelectUtxos(input: AutoSelectInput): AutoSelectResult {
  const { tokenUtxos, bchUtxos, requirements } = input;
  const errors: UtxoShortageError[] = [];
  const warnings: UtxoWarning[] = [];

  // Check if any token UTXOs exist
  if (tokenUtxos.length === 0) {
    return {
      success: false,
      validation: {
        valid: false,
        errors: [createNoTokenUtxosError('')],
        warnings: [],
      },
    };
  }

  // Sort and select token UTXOs
  const sortedTokenUtxos = sortTokenUtxosByAmount(tokenUtxos);
  const selectedTokenUtxos: TokenUtxo[] = [];
  let accumulatedTokens = 0n;
  let accumulatedBchFromTokens = 0n;

  for (const utxo of sortedTokenUtxos) {
    if (accumulatedTokens >= requirements.requiredTokenAmount) {
      break;
    }
    selectedTokenUtxos.push(utxo);
    accumulatedTokens += utxo.token.amount;
    accumulatedBchFromTokens += utxo.satoshis;
  }

  // Check token sufficiency
  if (accumulatedTokens < requirements.requiredTokenAmount) {
    const totalAvailable = tokenUtxos.reduce((sum, u) => sum + u.token.amount, 0n);
    errors.push(createInsufficientTokensError(requirements.requiredTokenAmount, totalAvailable));
  }

  // Check if token UTXOs are too fragmented
  if (selectedTokenUtxos.length > requirements.maxInputsPerTx) {
    const totalAvailable = tokenUtxos.reduce((sum, u) => sum + u.token.amount, 0n);
    errors.push(
      createTooFragmentedError(
        selectedTokenUtxos.length,
        requirements.maxInputsPerTx,
        requirements.requiredTokenAmount,
        totalAvailable
      )
    );
  }

  // Calculate remaining BCH needed
  const remainingBchNeeded =
    requirements.requiredBchSatoshis > accumulatedBchFromTokens
      ? requirements.requiredBchSatoshis - accumulatedBchFromTokens
      : 0n;

  // Select BCH UTXOs
  const sortedBchUtxos = sortBchUtxosBySatoshis(bchUtxos);
  const selectedBchUtxos: Utxo[] = [];
  let accumulatedPureBch = 0n;

  if (remainingBchNeeded > 0n) {
    for (const utxo of sortedBchUtxos) {
      if (accumulatedPureBch >= remainingBchNeeded) {
        break;
      }
      // Check input limit
      if (selectedTokenUtxos.length + selectedBchUtxos.length >= requirements.maxInputsPerTx) {
        break;
      }
      selectedBchUtxos.push(utxo);
      accumulatedPureBch += utxo.satoshis;
    }
  }

  // Calculate total BCH available
  const totalBchAvailable = accumulatedBchFromTokens + accumulatedPureBch;

  // Check BCH sufficiency
  if (totalBchAvailable < requirements.requiredBchSatoshis) {
    const totalPureBch = bchUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const totalAvailableBch = accumulatedBchFromTokens + totalPureBch;

    if (totalAvailableBch < requirements.requiredBchSatoshis) {
      errors.push(createInsufficientBchError(requirements.requiredBchSatoshis, totalAvailableBch));
    } else if (bchUtxos.length === 0 && remainingBchNeeded > 0n) {
      errors.push(createNoBchUtxosError());
    }
  }

  // Check total input count
  const totalInputs = selectedTokenUtxos.length + selectedBchUtxos.length;
  if (totalInputs > requirements.maxInputsPerTx && errors.length === 0) {
    errors.push(createInputLimitExceededError(totalInputs, requirements.maxInputsPerTx));
  }

  // Add warnings
  const unconfirmedTokens = selectedTokenUtxos.filter((u) => u.confirmations === 0);
  const unconfirmedBch = selectedBchUtxos.filter((u) => u.confirmations === 0);
  if (unconfirmedTokens.length > 0 || unconfirmedBch.length > 0) {
    warnings.push({
      type: 'UNCONFIRMED_INPUTS',
      message: `${unconfirmedTokens.length + unconfirmedBch.length} unconfirmed UTXO(s) selected. Transaction may fail if parent tx is dropped.`,
      details: {
        unconfirmedTokenCount: unconfirmedTokens.length,
        unconfirmedBchCount: unconfirmedBch.length,
      },
    });
  }

  if (
    totalInputs > requirements.maxInputsPerTx * 0.7 &&
    totalInputs <= requirements.maxInputsPerTx
  ) {
    warnings.push({
      type: 'MANY_INPUTS',
      message: `Using ${totalInputs} inputs (${Math.round((totalInputs / requirements.maxInputsPerTx) * 100)}% of limit). Transaction may be slower to sign.`,
      details: { inputCount: totalInputs, maxInputs: requirements.maxInputsPerTx },
    });
  }

  // Build result
  if (errors.length > 0) {
    return {
      success: false,
      validation: {
        valid: false,
        errors,
        warnings,
        shortages: {
          tokenShortage:
            accumulatedTokens < requirements.requiredTokenAmount
              ? requirements.requiredTokenAmount - accumulatedTokens
              : undefined,
          bchShortage:
            totalBchAvailable < requirements.requiredBchSatoshis
              ? requirements.requiredBchSatoshis - totalBchAvailable
              : undefined,
        },
      },
    };
  }

  const selection: SelectedUtxos = {
    tokenUtxos: selectedTokenUtxos,
    bchUtxos: selectedBchUtxos,
    totalTokenAmount: accumulatedTokens,
    totalBchSatoshis: totalBchAvailable,
  };

  return {
    success: true,
    selection,
    validation: {
      valid: true,
      errors: [],
      warnings,
    },
  };
}

// ============================================================================
// Manual Selection Validation
// ============================================================================

/**
 * Validate manually selected UTXOs against requirements
 */
export function validateManualSelection(input: ManualSelectInput): UtxoValidationResult {
  const { selectedTokenOutpoints, selectedBchOutpoints, allTokenUtxos, allBchUtxos, requirements } =
    input;

  const errors: UtxoShortageError[] = [];
  const warnings: UtxoWarning[] = [];

  // Map outpoints to UTXOs
  const tokenOutpointSet = new Set(selectedTokenOutpoints.map((o) => outpointId(o)));
  const bchOutpointSet = new Set(selectedBchOutpoints.map((o) => outpointId(o)));

  const selectedTokenUtxos = allTokenUtxos.filter((u) =>
    tokenOutpointSet.has(outpointId({ txid: u.txid, vout: u.vout }))
  );
  const selectedBchUtxos = allBchUtxos.filter((u) =>
    bchOutpointSet.has(outpointId({ txid: u.txid, vout: u.vout }))
  );

  // Calculate totals
  const totalTokenAmount = selectedTokenUtxos.reduce((sum, u) => sum + u.token.amount, 0n);
  const totalBchFromTokens = selectedTokenUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
  const totalPureBch = selectedBchUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
  const totalBchSatoshis = totalBchFromTokens + totalPureBch;

  // Check token sufficiency
  if (totalTokenAmount < requirements.requiredTokenAmount) {
    errors.push(createInsufficientTokensError(requirements.requiredTokenAmount, totalTokenAmount));
  }

  // Check BCH sufficiency
  if (totalBchSatoshis < requirements.requiredBchSatoshis) {
    errors.push(createInsufficientBchError(requirements.requiredBchSatoshis, totalBchSatoshis));
  }

  // Check input limit
  const totalInputs = selectedTokenUtxos.length + selectedBchUtxos.length;
  if (totalInputs > requirements.maxInputsPerTx) {
    errors.push(createInputLimitExceededError(totalInputs, requirements.maxInputsPerTx));
  }

  // Warnings
  const unconfirmedCount =
    selectedTokenUtxos.filter((u) => u.confirmations === 0).length +
    selectedBchUtxos.filter((u) => u.confirmations === 0).length;

  if (unconfirmedCount > 0) {
    warnings.push({
      type: 'UNCONFIRMED_INPUTS',
      message: `${unconfirmedCount} unconfirmed UTXO(s) selected.`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    shortages:
      errors.length > 0
        ? {
            tokenShortage:
              totalTokenAmount < requirements.requiredTokenAmount
                ? requirements.requiredTokenAmount - totalTokenAmount
                : undefined,
            bchShortage:
              totalBchSatoshis < requirements.requiredBchSatoshis
                ? requirements.requiredBchSatoshis - totalBchSatoshis
                : undefined,
          }
        : undefined,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert outpoint array to Set of IDs
 */
export function outpointsToIdSet(outpoints: Outpoint[]): Set<string> {
  return new Set(outpoints.map((o) => outpointId(o)));
}

/**
 * Convert UTXOs to their outpoints
 */
export function utxosToOutpoints(utxos: Array<Utxo | TokenUtxo>): Outpoint[] {
  return utxos.map((u) => ({ txid: u.txid, vout: u.vout }));
}

/**
 * Format token amount with decimals for display
 */
export function formatTokenAmount(amount: bigint, decimals: number = 0): string {
  if (decimals === 0) {
    return amount.toLocaleString();
  }

  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toLocaleString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${integerPart.toLocaleString()}.${fractionalStr}`;
}

/**
 * Format BCH amount (satoshis to BCH string)
 */
export function formatBchAmount(satoshis: bigint): string {
  const bch = Number(satoshis) / 100_000_000;
  return bch.toFixed(8);
}
