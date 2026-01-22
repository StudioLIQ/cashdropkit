/**
 * Airdrop Executor
 *
 * Executes airdrop distribution plans with:
 * - Sequential batch processing
 * - txid persistence BEFORE broadcast (idempotent, resume-safe)
 * - Failure handling and recovery
 * - Progress tracking
 *
 * Critical invariant: Once a batch is signed, its txid is persisted
 * BEFORE broadcast. This ensures that even if broadcast fails or app
 * crashes, we know what transaction was attempted and can recover.
 */
import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import { airdropRepo, logRepo } from '@/core/db';
import type {
  AirdropCampaign,
  BatchPlan,
  ExecutionState,
  ExecutionStatus,
  RecipientRow,
} from '@/core/db/types';
import type { AddressDerivation, MnemonicSigner } from '@/core/signer';
import { type TokenTxParams, buildTokenTransaction } from '@/core/tx/tokenTxBuilder';

// ============================================================================
// Types
// ============================================================================

/**
 * Executor configuration
 */
export interface ExecutorConfig {
  /** Chain adapter for broadcasting */
  adapter: ChainAdapter;
  /** Mnemonic signer for signing transactions */
  signer: MnemonicSigner;
  /** Source wallet address for inputs */
  sourceAddress: string;
  /** Address derivations for signing */
  addressDerivations: AddressDerivation[];
  /** Optional: delay between batches (ms) */
  batchDelayMs?: number;
  /** Optional: store raw tx hex in debug */
  storeRawTxHex?: boolean;
}

/**
 * Result of executing a single batch
 */
export interface BatchExecutionResult {
  success: boolean;
  batchId: string;
  txid?: string;
  txHex?: string;
  error?: string;
  broadcastAttempted: boolean;
}

/**
 * Progress callback
 */
export type ExecutionProgressCallback = (progress: ExecutionProgress) => void;

/**
 * Execution progress info
 */
export interface ExecutionProgress {
  state: ExecutionStatus;
  currentBatchIndex: number;
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  currentBatchId?: string;
  lastTxid?: string;
  message?: string;
}

/**
 * Executor result
 */
export interface ExecutorResult {
  success: boolean;
  completedBatches: number;
  failedBatches: number;
  skippedBatches: number;
  error?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Initialize execution state for a campaign
 */
function initializeExecutionState(adapterName: string): ExecutionState {
  return {
    state: 'READY',
    currentBatchIndex: 0,
    broadcast: {
      adapterName,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    },
    failures: {
      batchFailures: [],
      recipientFailures: [],
    },
    confirmations: {},
  };
}

/**
 * Build UTXO sets for a batch from campaign data
 */
function buildUtxoSetsForBatch(
  batch: BatchPlan,
  tokenUtxos: TokenUtxo[],
  bchUtxos: Utxo[]
): { tokenInputs: TokenUtxo[]; bchInputs: Utxo[] } {
  // Map outpoints to UTXOs
  const tokenInputMap = new Map<string, TokenUtxo>();
  for (const utxo of tokenUtxos) {
    tokenInputMap.set(`${utxo.txid}:${utxo.vout}`, utxo);
  }

  const bchInputMap = new Map<string, Utxo>();
  for (const utxo of bchUtxos) {
    bchInputMap.set(`${utxo.txid}:${utxo.vout}`, utxo);
  }

  // Collect inputs for this batch
  const tokenInputs: TokenUtxo[] = [];
  for (const outpoint of batch.tokenInputs) {
    const key = `${outpoint.txid}:${outpoint.vout}`;
    const utxo = tokenInputMap.get(key);
    if (utxo) {
      tokenInputs.push(utxo);
    }
  }

  const bchInputs: Utxo[] = [];
  for (const outpoint of batch.bchInputs) {
    const key = `${outpoint.txid}:${outpoint.vout}`;
    const utxo = bchInputMap.get(key);
    if (utxo) {
      bchInputs.push(utxo);
    }
  }

  return { tokenInputs, bchInputs };
}

/**
 * Get recipients for a batch
 */
function getRecipientsForBatch(batch: BatchPlan, allRecipients: RecipientRow[]): RecipientRow[] {
  const recipientMap = new Map<string, RecipientRow>();
  for (const r of allRecipients) {
    recipientMap.set(r.id, r);
  }

  return batch.recipients
    .map((id) => recipientMap.get(id))
    .filter((r): r is RecipientRow => r !== undefined);
}

// ============================================================================
// Executor Class
// ============================================================================

/**
 * Airdrop Executor
 *
 * Executes distribution plans with resume-safe semantics.
 */
export class AirdropExecutor {
  private config: ExecutorConfig;
  private campaign: AirdropCampaign;
  private tokenUtxos: TokenUtxo[] = [];
  private bchUtxos: Utxo[] = [];
  private progressCallback?: ExecutionProgressCallback;
  private aborted = false;

  constructor(config: ExecutorConfig, campaign: AirdropCampaign) {
    this.config = config;
    this.campaign = campaign;
  }

  /**
   * Set progress callback
   */
  onProgress(callback: ExecutionProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Abort execution after current batch completes
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Check if execution was aborted
   */
  isAborted(): boolean {
    return this.aborted;
  }

  /**
   * Load UTXOs from adapter
   */
  async loadUtxos(): Promise<void> {
    const allUtxos = await this.config.adapter.getUtxos(this.config.sourceAddress);

    // Separate token and BCH UTXOs
    this.tokenUtxos = [];
    this.bchUtxos = [];

    for (const utxo of allUtxos) {
      if ('token' in utxo && utxo.token) {
        this.tokenUtxos.push(utxo as TokenUtxo);
      } else {
        this.bchUtxos.push(utxo as Utxo);
      }
    }

    await logRepo.log(
      'info',
      'executor',
      `Loaded ${this.tokenUtxos.length} token UTXOs and ${this.bchUtxos.length} BCH UTXOs`,
      { tokenCount: this.tokenUtxos.length, bchCount: this.bchUtxos.length },
      this.campaign.id
    );
  }

  /**
   * Execute all batches in the distribution plan
   */
  async execute(): Promise<ExecutorResult> {
    const plan = this.campaign.plan;
    if (!plan) {
      return {
        success: false,
        completedBatches: 0,
        failedBatches: 0,
        skippedBatches: 0,
        error: 'No distribution plan found',
      };
    }

    // Initialize or resume execution state
    let execution = this.campaign.execution;
    if (!execution) {
      execution = initializeExecutionState(this.config.adapter.name);
      this.campaign.execution = execution;
    }

    // Set state to running
    execution.state = 'RUNNING';
    execution.broadcast.startedAt = execution.broadcast.startedAt || Date.now();
    execution.broadcast.lastUpdatedAt = Date.now();
    if (this.config.storeRawTxHex) {
      execution.debug = { storeRawTxHex: true };
    }

    await this.persistCampaign();
    await logRepo.log('info', 'executor', 'Starting execution', {}, this.campaign.id);

    let completedBatches = 0;
    let failedBatches = 0;
    let skippedBatches = 0;

    // Load UTXOs
    try {
      await this.loadUtxos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading UTXOs';
      execution.state = 'FAILED';
      await this.persistCampaign();
      await logRepo.log(
        'error',
        'executor',
        `Failed to load UTXOs: ${message}`,
        {},
        this.campaign.id
      );
      return {
        success: false,
        completedBatches,
        failedBatches: plan.batches.length,
        skippedBatches,
        error: message,
      };
    }

    // Process batches sequentially
    for (let i = execution.currentBatchIndex; i < plan.batches.length; i++) {
      if (this.aborted) {
        execution.state = 'PAUSED';
        await this.persistCampaign();
        await logRepo.log('info', 'executor', 'Execution paused by user', {}, this.campaign.id);
        break;
      }

      const batch = plan.batches[i];
      execution.currentBatchIndex = i;

      // Report progress
      this.reportProgress({
        state: 'RUNNING',
        currentBatchIndex: i,
        totalBatches: plan.batches.length,
        completedBatches,
        failedBatches,
        currentBatchId: batch.id,
        message: `Processing batch ${i + 1}/${plan.batches.length}`,
      });

      // Check if batch already has txid (resume scenario)
      if (batch.txid) {
        await logRepo.log(
          'info',
          'executor',
          `Skipping batch ${batch.id} - already has txid ${batch.txid}`,
          { batchId: batch.id, txid: batch.txid },
          this.campaign.id,
          batch.id
        );
        skippedBatches++;
        completedBatches++;
        continue;
      }

      // Execute batch
      const result = await this.executeBatch(batch, i);

      if (result.success) {
        completedBatches++;
        await logRepo.log(
          'info',
          'executor',
          `Batch ${batch.id} completed with txid ${result.txid}`,
          { batchId: batch.id, txid: result.txid },
          this.campaign.id,
          batch.id
        );
      } else {
        failedBatches++;
        execution.failures.batchFailures.push({
          batchId: batch.id,
          error: result.error || 'Unknown error',
        });
        await logRepo.log(
          'error',
          'executor',
          `Batch ${batch.id} failed: ${result.error}`,
          { batchId: batch.id, error: result.error },
          this.campaign.id,
          batch.id
        );

        // Stop on first failure (fail-closed)
        execution.state = 'FAILED';
        await this.persistCampaign();
        return {
          success: false,
          completedBatches,
          failedBatches,
          skippedBatches,
          error: result.error,
        };
      }

      // Add delay between batches if configured
      if (this.config.batchDelayMs && i < plan.batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.config.batchDelayMs));
      }
    }

    // Mark as completed if all batches processed
    if (!this.aborted && execution.currentBatchIndex >= plan.batches.length - 1) {
      execution.state = 'COMPLETED';
      execution.currentBatchIndex = plan.batches.length;
    }

    execution.broadcast.lastUpdatedAt = Date.now();
    await this.persistCampaign();

    this.reportProgress({
      state: execution.state,
      currentBatchIndex: execution.currentBatchIndex,
      totalBatches: plan.batches.length,
      completedBatches,
      failedBatches,
      message: execution.state === 'COMPLETED' ? 'Execution completed' : 'Execution paused',
    });

    await logRepo.log(
      'info',
      'executor',
      `Execution finished: ${completedBatches} completed, ${failedBatches} failed, ${skippedBatches} skipped`,
      { completedBatches, failedBatches, skippedBatches },
      this.campaign.id
    );

    return {
      success: failedBatches === 0,
      completedBatches,
      failedBatches,
      skippedBatches,
    };
  }

  /**
   * Execute a single batch
   */
  private async executeBatch(batch: BatchPlan, _batchIndex: number): Promise<BatchExecutionResult> {
    const result: BatchExecutionResult = {
      success: false,
      batchId: batch.id,
      broadcastAttempted: false,
    };

    try {
      // 1. Build UTXO sets for this batch
      const { tokenInputs, bchInputs } = buildUtxoSetsForBatch(
        batch,
        this.tokenUtxos,
        this.bchUtxos
      );

      if (tokenInputs.length === 0 && bchInputs.length === 0) {
        result.error = 'No UTXOs available for batch';
        return result;
      }

      // 2. Get recipients for this batch
      const recipients = getRecipientsForBatch(batch, this.campaign.recipients);
      if (recipients.length === 0) {
        result.error = 'No recipients for batch';
        return result;
      }

      // 3. Build unsigned transaction
      const txParams: TokenTxParams = {
        network: this.campaign.network,
        tokenCategory: this.campaign.token.tokenId,
        tokenInputs,
        bchInputs,
        recipients: recipients.map((r) => ({
          address: r.address,
          tokenAmount: BigInt(r.amountBase),
          memo: r.memo,
        })),
        tokenChangeAddress: this.config.sourceAddress,
        bchChangeAddress: this.config.sourceAddress,
        feeRateSatPerByte: this.campaign.settings.feeRateSatPerByte,
        dustSatPerOutput: BigInt(this.campaign.settings.dustSatPerOutput),
      };

      const txResult = buildTokenTransaction(txParams);
      if (!txResult.success || !txResult.transaction) {
        result.error = txResult.error || 'Failed to build transaction';
        return result;
      }

      // 4. Sign transaction
      const signResult = await this.config.signer.sign(
        txResult.transaction,
        this.config.addressDerivations
      );

      if (!signResult.success || !signResult.transaction) {
        result.error = signResult.error || 'Failed to sign transaction';
        return result;
      }

      const signedTx = signResult.transaction;
      result.txid = signedTx.txid;
      result.txHex = signedTx.txHex;

      // 5. CRITICAL: Persist txid BEFORE broadcast
      // This ensures we never lose track of a transaction
      await this.persistBatchTxid(batch.id, signedTx.txid, recipients);
      await logRepo.log(
        'info',
        'executor',
        `Batch ${batch.id} signed, txid ${signedTx.txid} persisted before broadcast`,
        { batchId: batch.id, txid: signedTx.txid },
        this.campaign.id,
        batch.id
      );

      // 6. Broadcast transaction
      result.broadcastAttempted = true;
      const broadcastResult = await this.config.adapter.broadcast(signedTx.txHex);

      if (!broadcastResult.success) {
        // Broadcast failed, but txid is already persisted
        // The transaction may or may not have been accepted by other nodes
        result.error = `Broadcast failed: ${broadcastResult.error}. txid: ${signedTx.txid}`;
        // Mark recipients as FAILED but keep txid for potential retry
        await this.updateRecipientStatuses(recipients, 'FAILED', batch.id, result.error);
        return result;
      }

      // 7. Update recipient statuses to SENT
      await this.updateRecipientStatuses(recipients, 'SENT', batch.id, undefined, signedTx.txid);

      // 8. Track confirmation status
      const execution = this.campaign.execution;
      if (execution) {
        execution.confirmations[signedTx.txid] = {
          status: 'SEEN',
          lastCheckedAt: Date.now(),
        };
      }

      result.success = true;
      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Persist batch txid to database (before broadcast)
   */
  private async persistBatchTxid(
    batchId: string,
    txid: string,
    recipients: RecipientRow[]
  ): Promise<void> {
    // Update batch in plan
    const plan = this.campaign.plan;
    if (plan) {
      const batch = plan.batches.find((b) => b.id === batchId);
      if (batch) {
        batch.txid = txid;
      }
    }

    // Update recipients to PLANNED with txid
    for (const recipient of recipients) {
      recipient.status = 'PLANNED';
      recipient.batchId = batchId;
      recipient.txid = txid;
    }

    await this.persistCampaign();
  }

  /**
   * Update recipient statuses
   */
  private async updateRecipientStatuses(
    recipients: RecipientRow[],
    status: 'SENT' | 'CONFIRMED' | 'FAILED',
    batchId: string,
    error?: string,
    txid?: string
  ): Promise<void> {
    for (const recipient of recipients) {
      recipient.status = status;
      recipient.batchId = batchId;
      if (txid) {
        recipient.txid = txid;
      }
      if (error) {
        recipient.error = error;
      }
    }

    await this.persistCampaign();
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
  private reportProgress(progress: ExecutionProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}

/**
 * Create an airdrop executor
 */
export function createAirdropExecutor(
  config: ExecutorConfig,
  campaign: AirdropCampaign
): AirdropExecutor {
  return new AirdropExecutor(config, campaign);
}

/**
 * Resume execution of a paused campaign
 */
export async function resumeExecution(
  config: ExecutorConfig,
  campaignId: string
): Promise<ExecutorResult> {
  const campaign = await airdropRepo.getById(campaignId);
  if (!campaign) {
    return {
      success: false,
      completedBatches: 0,
      failedBatches: 0,
      skippedBatches: 0,
      error: 'Campaign not found',
    };
  }

  if (!campaign.plan) {
    return {
      success: false,
      completedBatches: 0,
      failedBatches: 0,
      skippedBatches: 0,
      error: 'No distribution plan found',
    };
  }

  const executor = createAirdropExecutor(config, campaign);
  return executor.execute();
}
