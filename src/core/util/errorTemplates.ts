/**
 * Centralized Error Templates
 *
 * Provides precise, actionable error and warning messages.
 * All user-facing messages should come from here for consistency.
 */

// ============================================================================
// Types
// ============================================================================

export type ErrorSeverity = 'error' | 'warning' | 'info' | 'success';

export interface AppMessage {
  severity: ErrorSeverity;
  title: string;
  detail?: string;
}

// ============================================================================
// Token Errors
// ============================================================================

export function tokenShortfall(required: bigint, available: bigint): AppMessage {
  return {
    severity: 'error',
    title: 'Insufficient token balance',
    detail: `Required: ${required} / Available: ${available} / Missing: ${required - available}`,
  };
}

export function tokenNotFound(tokenId: string): AppMessage {
  return {
    severity: 'warning',
    title: 'Token metadata not found',
    detail: `Token ${tokenId.slice(0, 12)}... not found in registries. You can set decimals manually.`,
  };
}

// ============================================================================
// BCH Errors
// ============================================================================

export function bchShortfall(required: bigint, available: bigint): AppMessage {
  return {
    severity: 'error',
    title: 'Insufficient BCH for fees + dust',
    detail: `Estimated required: ${required} sat / Available: ${available} sat / Missing: ${required - available} sat`,
  };
}

// ============================================================================
// UTXO Errors
// ============================================================================

export function noTokenUtxos(): AppMessage {
  return {
    severity: 'error',
    title: 'No token UTXOs found',
    detail: 'The selected wallet has no UTXOs with the specified token.',
  };
}

export function noBchUtxos(): AppMessage {
  return {
    severity: 'error',
    title: 'No BCH UTXOs found',
    detail: 'The selected wallet has no BCH UTXOs to fund transaction fees and dust.',
  };
}

export function tooFragmented(inputCount: number, maxInputs: number): AppMessage {
  return {
    severity: 'error',
    title: 'UTXOs too fragmented',
    detail: `Need ${inputCount} inputs but maximum is ${maxInputs}. Consolidate UTXOs first.`,
  };
}

// ============================================================================
// CSV Errors
// ============================================================================

export function csvInvalidAddress(line: number, address: string, reason: string): AppMessage {
  return {
    severity: 'error',
    title: `Invalid address at line ${line}`,
    detail: `"${address.slice(0, 30)}..." — ${reason}`,
  };
}

export function csvInvalidAmount(line: number, reason: string): AppMessage {
  return {
    severity: 'error',
    title: `Invalid amount at line ${line}`,
    detail: reason,
  };
}

export function csvNetworkMismatch(line: number, expected: string, got: string): AppMessage {
  return {
    severity: 'error',
    title: `Network mismatch at line ${line}`,
    detail: `Expected ${expected} address, got ${got}`,
  };
}

// ============================================================================
// Broadcast Errors
// ============================================================================

export function broadcastFailed(batchId: string, rawError: string): AppMessage {
  return {
    severity: 'error',
    title: `Broadcast failed for batch ${batchId.slice(0, 8)}`,
    detail: rawError,
  };
}

export function broadcastSuccess(txid: string): AppMessage {
  return {
    severity: 'success',
    title: 'Transaction broadcast',
    detail: `txid: ${txid}`,
  };
}

// ============================================================================
// Confirmation Warnings
// ============================================================================

export function txInMempool(txid: string, confirmations: number): AppMessage {
  return {
    severity: 'info',
    title: `Seen in mempool (${confirmations} conf)`,
    detail: `txid: ${txid.slice(0, 16)}...`,
  };
}

export function txDroppedSuspected(txid: string, minutesElapsed: number): AppMessage {
  return {
    severity: 'warning',
    title: 'Transaction may have been dropped',
    detail: `txid: ${txid.slice(0, 16)}... — ${minutesElapsed} minutes since broadcast. Consider retrying with force rebuild.`,
  };
}

// ============================================================================
// Connection Errors
// ============================================================================

export function connectionOffline(adapter: string): AppMessage {
  return {
    severity: 'error',
    title: 'Connection offline',
    detail: `Lost connection to ${adapter}. Operations requiring the network will fail.`,
  };
}

export function connectionDegraded(failureCount: number): AppMessage {
  return {
    severity: 'warning',
    title: 'Connection degraded',
    detail: `${failureCount} consecutive health check failures. Some operations may be slow or fail.`,
  };
}

export function connectionRestored(): AppMessage {
  return {
    severity: 'success',
    title: 'Connection restored',
  };
}

// ============================================================================
// Vesting/Lockbox Errors
// ============================================================================

export function trancheLocked(unlockDate: Date): AppMessage {
  return {
    severity: 'warning',
    title: 'Tranche is still locked',
    detail: `Unlocks ${unlockDate.toLocaleDateString()} ${unlockDate.toLocaleTimeString()}`,
  };
}

export function unlockSuccess(txid: string): AppMessage {
  return {
    severity: 'success',
    title: 'Tokens unlocked',
    detail: `txid: ${txid}`,
  };
}

// ============================================================================
// Execution Errors
// ============================================================================

export function executionPaused(batchIndex: number, totalBatches: number): AppMessage {
  return {
    severity: 'info',
    title: 'Execution paused',
    detail: `Completed ${batchIndex} of ${totalBatches} batches. Resume to continue.`,
  };
}

export function executionCompleted(batches: number, recipients: number): AppMessage {
  return {
    severity: 'success',
    title: 'Execution completed',
    detail: `${batches} batches, ${recipients} recipients processed.`,
  };
}

export function executionFailed(batchId: string, error: string): AppMessage {
  return {
    severity: 'error',
    title: `Execution failed at batch ${batchId.slice(0, 8)}`,
    detail: error,
  };
}
