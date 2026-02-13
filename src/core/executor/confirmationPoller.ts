/**
 * Confirmation Poller
 *
 * Polls transaction statuses for broadcast transactions and updates
 * confirmation state. Detects DROPPED transactions via time-based heuristic.
 *
 * Key behaviors:
 * - Polls all SEEN/UNKNOWN txids periodically
 * - Updates SEEN → CONFIRMED when confirmations >= 1
 * - Suspects DROPPED if tx is not found or not in mempool after threshold
 * - Updates recipient statuses accordingly
 * - Persists all state changes to IndexedDB
 */
import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { TxStatus } from '@/core/adapters/chain/types';
import { airdropRepo, logRepo } from '@/core/db';
import type { AirdropCampaign, ConfirmationStatus } from '@/core/db/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Poller configuration
 */
export interface ConfirmationPollerConfig {
  /** Chain adapter for querying tx status */
  adapter: ChainAdapter;
  /** Polling interval in milliseconds (default: 30000 = 30s) */
  intervalMs?: number;
  /** Time threshold in ms to suspect DROPPED (default: 1800000 = 30 min) */
  droppedThresholdMs?: number;
  /** Minimum confirmations to consider CONFIRMED (default: 1) */
  minConfirmations?: number;
}

/**
 * Per-txid polling state
 */
export interface TxPollingState {
  txid: string;
  status: ConfirmationStatus;
  confirmations: number;
  firstSeenAt: number;
  lastCheckedAt: number;
  batchId?: string;
  error?: string;
}

/**
 * Polling progress callback
 */
export type PollingProgressCallback = (states: TxPollingState[]) => void;

/**
 * Polling result summary
 */
export interface PollingResult {
  checked: number;
  confirmed: number;
  dropped: number;
  errors: number;
  stillPending: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_INTERVAL_MS = 30_000; // 30 seconds
const DEFAULT_DROPPED_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MIN_CONFIRMATIONS = 1;

// ============================================================================
// ConfirmationPoller Class
// ============================================================================

/**
 * Polls tx confirmations and updates campaign state.
 */
export class ConfirmationPoller {
  private config: Required<ConfirmationPollerConfig>;
  private campaign: AirdropCampaign;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private stopped = false;
  private progressCallback?: PollingProgressCallback;

  constructor(config: ConfirmationPollerConfig, campaign: AirdropCampaign) {
    this.config = {
      adapter: config.adapter,
      intervalMs: config.intervalMs ?? DEFAULT_INTERVAL_MS,
      droppedThresholdMs: config.droppedThresholdMs ?? DEFAULT_DROPPED_THRESHOLD_MS,
      minConfirmations: config.minConfirmations ?? DEFAULT_MIN_CONFIRMATIONS,
    };
    this.campaign = campaign;
  }

  /**
   * Set progress callback
   */
  onProgress(callback: PollingProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Start periodic polling
   */
  start(): void {
    if (this.intervalHandle) return; // Already running
    this.stopped = false;

    // Run immediately, then on interval
    void this.poll();

    this.intervalHandle = setInterval(() => {
      if (!this.stopped) {
        void this.poll();
      }
    }, this.config.intervalMs);
  }

  /**
   * Stop periodic polling
   */
  stop(): void {
    this.stopped = true;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Check if poller is active
   */
  isActive(): boolean {
    return this.intervalHandle !== null && !this.stopped;
  }

  /**
   * Get current campaign reference
   */
  getCampaign(): AirdropCampaign {
    return this.campaign;
  }

  /**
   * Update campaign reference (e.g. after external state changes)
   */
  setCampaign(campaign: AirdropCampaign): void {
    this.campaign = campaign;
  }

  /**
   * Get all txids that need polling
   */
  getPendingTxids(): string[] {
    const execution = this.campaign.execution;
    if (!execution) return [];

    return Object.entries(execution.confirmations)
      .filter(([, state]) => state.status === 'SEEN' || state.status === 'UNKNOWN')
      .map(([txid]) => txid);
  }

  /**
   * Get current polling states for all tracked txids
   */
  getPollingStates(): TxPollingState[] {
    const execution = this.campaign.execution;
    if (!execution) return [];

    const plan = this.campaign.plan;

    return Object.entries(execution.confirmations).map(([txid, state]) => {
      const batch = plan?.batches.find((b) => b.txid === txid);
      return {
        txid,
        status: state.status,
        confirmations: state.confirmations ?? 0,
        firstSeenAt: state.firstSeenAt ?? state.lastCheckedAt,
        lastCheckedAt: state.lastCheckedAt,
        batchId: batch?.id,
      };
    });
  }

  /**
   * Run a single polling cycle
   */
  async poll(): Promise<PollingResult> {
    if (this.isPolling) {
      return { checked: 0, confirmed: 0, dropped: 0, errors: 0, stillPending: 0 };
    }

    this.isPolling = true;

    const result: PollingResult = {
      checked: 0,
      confirmed: 0,
      dropped: 0,
      errors: 0,
      stillPending: 0,
    };

    try {
      const execution = this.campaign.execution;
      if (!execution) return result;

      const pendingTxids = this.getPendingTxids();
      if (pendingTxids.length === 0) return result;

      const now = Date.now();
      let stateChanged = false;

      for (const txid of pendingTxids) {
        if (this.stopped) break;

        result.checked++;
        const confirmState = execution.confirmations[txid];
        if (!confirmState) continue;

        try {
          const txStatus = await this.config.adapter.getTxStatus(txid);
          const newState = this.evaluateTxStatus(txStatus, confirmState, now);

          if (
            newState.status !== confirmState.status ||
            newState.confirmations !== confirmState.confirmations
          ) {
            execution.confirmations[txid] = newState;
            stateChanged = true;

            // Update recipient statuses based on new confirmation state
            if (newState.status === 'CONFIRMED') {
              result.confirmed++;
              this.updateRecipientsForTxid(txid, 'CONFIRMED');
            } else if (newState.status === 'DROPPED') {
              result.dropped++;
              // Don't change recipient status to FAILED automatically -
              // DROPPED is suspicion, not certainty. Just log a warning.
              await logRepo.log(
                'warn',
                'confirmationPoller',
                `Transaction ${txid} suspected DROPPED (not seen for ${Math.round((now - (confirmState.firstSeenAt ?? confirmState.lastCheckedAt)) / 60000)} minutes)`,
                { txid },
                this.campaign.id
              );
            } else {
              result.stillPending++;
            }
          } else {
            // Status unchanged, update lastCheckedAt
            confirmState.lastCheckedAt = now;
            result.stillPending++;
          }
        } catch (error) {
          result.errors++;
          const message = error instanceof Error ? error.message : 'Unknown error';
          // Don't fail the whole poll on individual tx errors
          confirmState.lastCheckedAt = now;
          await logRepo.log(
            'warn',
            'confirmationPoller',
            `Failed to check tx status for ${txid}: ${message}`,
            { txid, error: message },
            this.campaign.id
          );
        }
      }

      // Persist if anything changed
      if (stateChanged) {
        await this.persistCampaign();
      }

      // Report progress
      this.reportProgress();

      // If all txids are confirmed or dropped, auto-stop
      const remaining = this.getPendingTxids();
      if (remaining.length === 0 && pendingTxids.length > 0) {
        this.stop();
        await logRepo.log(
          'info',
          'confirmationPoller',
          'All transactions resolved, stopping poller',
          { confirmed: result.confirmed, dropped: result.dropped },
          this.campaign.id
        );
      }
    } finally {
      this.isPolling = false;
    }

    return result;
  }

  /**
   * Evaluate a tx status response and determine new confirmation state
   */
  private evaluateTxStatus(
    txStatus: TxStatus,
    currentState: {
      status: ConfirmationStatus;
      confirmations?: number;
      lastCheckedAt: number;
      firstSeenAt?: number;
    },
    now: number
  ): {
    status: ConfirmationStatus;
    confirmations: number;
    lastCheckedAt: number;
    firstSeenAt: number;
  } {
    const firstSeenAt = currentState.firstSeenAt ?? currentState.lastCheckedAt;

    // CONFIRMED: has enough confirmations
    if (txStatus.status === 'CONFIRMED' && txStatus.confirmations >= this.config.minConfirmations) {
      return {
        status: 'CONFIRMED',
        confirmations: txStatus.confirmations,
        lastCheckedAt: now,
        firstSeenAt,
      };
    }

    // MEMPOOL: still in mempool, update confirmation count
    if (txStatus.status === 'MEMPOOL') {
      return {
        status: 'SEEN',
        confirmations: 0,
        lastCheckedAt: now,
        firstSeenAt,
      };
    }

    // DROPPED: provider says dropped
    if (txStatus.status === 'DROPPED') {
      return {
        status: 'DROPPED',
        confirmations: 0,
        lastCheckedAt: now,
        firstSeenAt,
      };
    }

    // UNKNOWN: tx not found. Apply time-based DROPPED heuristic
    if (txStatus.status === 'UNKNOWN') {
      const elapsed = now - firstSeenAt;
      if (elapsed >= this.config.droppedThresholdMs) {
        return {
          status: 'DROPPED',
          confirmations: 0,
          lastCheckedAt: now,
          firstSeenAt,
        };
      }

      // Not yet past threshold - keep current status
      return {
        status: currentState.status,
        confirmations: 0,
        lastCheckedAt: now,
        firstSeenAt,
      };
    }

    // Default: keep current status
    return {
      status: currentState.status,
      confirmations: txStatus.confirmations,
      lastCheckedAt: now,
      firstSeenAt,
    };
  }

  /**
   * Update recipient statuses for a given txid
   */
  private updateRecipientsForTxid(txid: string, status: 'CONFIRMED'): void {
    for (const recipient of this.campaign.recipients) {
      if (recipient.txid === txid && recipient.status === 'SENT') {
        recipient.status = status;
      }
    }
  }

  /**
   * Persist campaign to database
   */
  private async persistCampaign(): Promise<void> {
    this.campaign.updatedAt = Date.now();
    await airdropRepo.update(this.campaign);
  }

  /**
   * Report progress to callback
   */
  private reportProgress(): void {
    if (this.progressCallback) {
      this.progressCallback(this.getPollingStates());
    }
  }
}

/**
 * Create a confirmation poller
 */
export function createConfirmationPoller(
  config: ConfirmationPollerConfig,
  campaign: AirdropCampaign
): ConfirmationPoller {
  return new ConfirmationPoller(config, campaign);
}
