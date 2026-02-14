/**
 * Confirmation Worker
 *
 * Polls tx status for all campaigns with SENT (unconfirmed) transactions.
 * Runs as a background service on Railway.
 *
 * Responsibilities:
 * - Poll Electrum/provider for tx status
 * - Update SENT → CONFIRMED when confirmations >= 1
 * - Mark DROPPED after configurable timeout
 * - Exponential backoff on provider failures
 * - Dead-letter tracking for permanently failed txids
 */

export interface WorkerConfig {
  pollIntervalMs: number; // How often to poll (default: 30s)
  droppedThresholdMs: number; // When to suspect DROPPED (default: 30min)
  maxBackoffMs: number; // Maximum backoff on failure (default: 5min)
  minConfirmations: number; // Confirmations required (default: 1)
  maxDeadLetterRetries: number; // Max retries before dead-letter (default: 10)
}

export interface TxCheckJob {
  txid: string;
  campaignId: string;
  campaignType: 'airdrop' | 'vesting';
  firstSeenAt: number;
  retryCount: number;
  lastError?: string;
}

export interface WorkerState {
  isRunning: boolean;
  lastPollAt: number;
  currentBackoffMs: number;
  pendingJobs: number;
  completedJobs: number;
  failedJobs: number;
  deadLetterCount: number;
}

export type TxStatusResult =
  | { status: 'confirmed'; confirmations: number }
  | { status: 'mempool' }
  | { status: 'not_found' }
  | { status: 'error'; error: string };

/** Provider interface for the worker (decoupled from Electrum directly) */
export interface TxStatusProvider {
  getTxStatus(txid: string): Promise<TxStatusResult>;
}

const DEFAULT_CONFIG: WorkerConfig = {
  pollIntervalMs: 30_000,
  droppedThresholdMs: 30 * 60 * 1000, // 30 minutes
  maxBackoffMs: 5 * 60 * 1000, // 5 minutes
  minConfirmations: 1,
  maxDeadLetterRetries: 10,
};

export class ConfirmationWorker {
  private config: WorkerConfig;
  private state: WorkerState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private provider: TxStatusProvider;
  private deadLetter: TxCheckJob[] = [];

  // Callbacks for persistence
  private onConfirmed?: (job: TxCheckJob, confirmations: number) => Promise<void>;
  private onDropped?: (job: TxCheckJob) => Promise<void>;
  private onDeadLetter?: (job: TxCheckJob) => Promise<void>;

  constructor(
    provider: TxStatusProvider,
    config: Partial<WorkerConfig> = {},
    callbacks?: {
      onConfirmed?: (job: TxCheckJob, confirmations: number) => Promise<void>;
      onDropped?: (job: TxCheckJob) => Promise<void>;
      onDeadLetter?: (job: TxCheckJob) => Promise<void>;
    },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = provider;
    this.onConfirmed = callbacks?.onConfirmed;
    this.onDropped = callbacks?.onDropped;
    this.onDeadLetter = callbacks?.onDeadLetter;
    this.state = {
      isRunning: false,
      lastPollAt: 0,
      currentBackoffMs: 0,
      pendingJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      deadLetterCount: 0,
    };
  }

  getState(): Readonly<WorkerState> {
    return { ...this.state };
  }

  getDeadLetterQueue(): ReadonlyArray<TxCheckJob> {
    return [...this.deadLetter];
  }

  /**
   * Process a single batch of tx check jobs.
   * Returns the number of resolved (confirmed or dropped) txids.
   */
  async processBatch(jobs: TxCheckJob[]): Promise<number> {
    const now = Date.now();
    let resolved = 0;

    for (const job of jobs) {
      try {
        const result = await this.provider.getTxStatus(job.txid);

        switch (result.status) {
          case 'confirmed':
            if (result.confirmations >= this.config.minConfirmations) {
              await this.onConfirmed?.(job, result.confirmations);
              this.state.completedJobs++;
              resolved++;
            }
            // Reset backoff on success
            this.state.currentBackoffMs = 0;
            break;

          case 'mempool':
            // Still pending — check if DROPPED threshold exceeded
            if (now - job.firstSeenAt > this.config.droppedThresholdMs) {
              await this.onDropped?.(job);
              this.state.failedJobs++;
              resolved++;
            }
            this.state.currentBackoffMs = 0;
            break;

          case 'not_found':
            // TX not found — might be dropped or never broadcast
            if (now - job.firstSeenAt > this.config.droppedThresholdMs) {
              await this.onDropped?.(job);
              this.state.failedJobs++;
              resolved++;
            }
            break;

          case 'error':
            job.retryCount++;
            job.lastError = result.error;

            if (job.retryCount >= this.config.maxDeadLetterRetries) {
              this.deadLetter.push(job);
              this.state.deadLetterCount++;
              await this.onDeadLetter?.(job);
              resolved++; // Remove from active queue
            }

            // Exponential backoff
            this.state.currentBackoffMs = Math.min(
              this.config.maxBackoffMs,
              (this.state.currentBackoffMs || 1000) * 2,
            );
            break;
        }
      } catch (err) {
        job.retryCount++;
        job.lastError = err instanceof Error ? err.message : String(err);

        if (job.retryCount >= this.config.maxDeadLetterRetries) {
          this.deadLetter.push(job);
          this.state.deadLetterCount++;
          await this.onDeadLetter?.(job);
          resolved++;
        }
      }
    }

    this.state.lastPollAt = now;
    this.state.pendingJobs = jobs.length - resolved;
    return resolved;
  }

  /**
   * Start the worker polling loop.
   */
  start(getJobs: () => Promise<TxCheckJob[]>): void {
    if (this.state.isRunning) return;
    this.state.isRunning = true;

    const poll = async () => {
      if (!this.state.isRunning) return;

      try {
        const jobs = await getJobs();
        if (jobs.length > 0) {
          await this.processBatch(jobs);
        }
      } catch (err) {
        console.error('Worker poll error:', err);
      }

      if (this.state.isRunning) {
        const delay = this.config.pollIntervalMs + this.state.currentBackoffMs;
        this.timer = setTimeout(poll, delay);
      }
    };

    poll();
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    this.state.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
