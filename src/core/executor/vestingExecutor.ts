/**
 * Vesting Executor
 *
 * Creates lockbox outputs for vesting tranches:
 * - Generates lockbox scripts (P2SH_CLTV_P2PKH) per tranche
 * - Builds transactions sending tokens to P2SH lockbox addresses
 * - Persists outpoints and redeemScriptHex per tranche
 * - txid persistence BEFORE broadcast (resume-safe)
 * - Sequential batch processing with pause/resume
 *
 * Critical invariant: After signing, persist txid and outpoints before broadcast.
 */
import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import { logRepo, vestingRepo } from '@/core/db';
import type {
  BeneficiaryRow,
  ExecutionState,
  ExecutionStatus,
  TrancheRow,
  VestingCampaign,
} from '@/core/db/types';
import type { AddressDerivation, MnemonicSigner } from '@/core/signer';
import { MIN_DUST_SATOSHIS, estimateFee } from '@/core/tx/feeEstimator';
import { generateLockbox } from '@/core/tx/lockboxScripts';
import type { TxInput, TxOutput, UnsignedTransaction } from '@/core/tx/tokenTxBuilder';
import {
  buildP2PKHScript,
  buildTokenP2SHScript,
  buildTokenPrefix,
  bytesToHex,
  hexToBytes,
} from '@/core/tx/tokenTxBuilder';
import { decodeCashAddr } from '@/core/wallet/cashaddr';

// ============================================================================
// Types
// ============================================================================

export interface VestingExecutorConfig {
  adapter: ChainAdapter;
  signer: MnemonicSigner;
  sourceAddress: string;
  addressDerivations: AddressDerivation[];
  batchDelayMs?: number;
}

export interface VestingBatchResult {
  success: boolean;
  batchId: string;
  txid?: string;
  error?: string;
  broadcastAttempted: boolean;
  /** Outpoint mappings: trancheId → vout */
  outpoints?: Map<string, number>;
}

export type VestingProgressCallback = (progress: VestingProgress) => void;

export interface VestingProgress {
  state: ExecutionStatus;
  currentBatchIndex: number;
  totalBatches: number;
  completedBatches: number;
  failedBatches: number;
  currentBatchId?: string;
  lastTxid?: string;
  message?: string;
}

export interface VestingExecutorResult {
  success: boolean;
  completedBatches: number;
  failedBatches: number;
  skippedBatches: number;
  error?: string;
}

/** Flattened tranche with beneficiary info for tx building */
interface ResolvedTranche {
  tranche: TrancheRow;
  beneficiary: BeneficiaryRow;
  lockAddress: string;
  redeemScriptHex: string;
  scriptHash: string;
}

// ============================================================================
// Executor
// ============================================================================

export class VestingExecutor {
  private config: VestingExecutorConfig;
  private campaign: VestingCampaign;
  private tokenUtxos: TokenUtxo[] = [];
  private bchUtxos: Utxo[] = [];
  private progressCallback?: VestingProgressCallback;
  private aborted = false;

  constructor(config: VestingExecutorConfig, campaign: VestingCampaign) {
    this.config = config;
    this.campaign = campaign;
  }

  onProgress(callback: VestingProgressCallback): void {
    this.progressCallback = callback;
  }

  abort(): void {
    this.aborted = true;
  }

  isAborted(): boolean {
    return this.aborted;
  }

  resetAbort(): void {
    this.aborted = false;
  }

  getCampaign(): VestingCampaign {
    return this.campaign;
  }

  async loadUtxos(): Promise<void> {
    const allUtxos = await this.config.adapter.getUtxos(this.config.sourceAddress);

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
      'vesting-executor',
      `Loaded ${this.tokenUtxos.length} token UTXOs and ${this.bchUtxos.length} BCH UTXOs`,
      { tokenCount: this.tokenUtxos.length, bchCount: this.bchUtxos.length },
      this.campaign.id
    );
  }

  /**
   * Execute all batches in the vesting plan
   */
  async execute(): Promise<VestingExecutorResult> {
    const plan = this.campaign.plan;
    if (!plan) {
      return {
        success: false,
        completedBatches: 0,
        failedBatches: 0,
        skippedBatches: 0,
        error: 'No vesting plan found',
      };
    }

    // Initialize or resume execution state
    let execution = this.campaign.execution;
    if (!execution) {
      execution = initializeExecutionState(this.config.adapter.name);
      this.campaign.execution = execution;
    }

    execution.state = 'RUNNING';
    execution.broadcast.startedAt = execution.broadcast.startedAt || Date.now();
    execution.broadcast.lastUpdatedAt = Date.now();

    await this.persistCampaign();
    await logRepo.log(
      'info',
      'vesting-executor',
      'Starting lockbox creation',
      {},
      this.campaign.id
    );

    // Load UTXOs
    try {
      await this.loadUtxos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error loading UTXOs';
      execution.state = 'FAILED';
      await this.persistCampaign();
      return {
        success: false,
        completedBatches: 0,
        failedBatches: plan.batches.length,
        skippedBatches: 0,
        error: message,
      };
    }

    let completedBatches = 0;
    let failedBatches = 0;
    let skippedBatches = 0;

    for (let i = execution.currentBatchIndex; i < plan.batches.length; i++) {
      if (this.aborted) {
        execution.state = 'PAUSED';
        await this.persistCampaign();
        break;
      }

      const batch = plan.batches[i];
      execution.currentBatchIndex = i;

      this.reportProgress({
        state: 'RUNNING',
        currentBatchIndex: i,
        totalBatches: plan.batches.length,
        completedBatches,
        failedBatches,
        currentBatchId: batch.id,
        message: `Creating lockboxes: batch ${i + 1}/${plan.batches.length}`,
      });

      // Check if batch already processed (resume)
      const batchTranches = this.getTranchesForBatch(batch.trancheIds);
      const allCreated = batchTranches.every(
        (t) => t.tranche.lockbox.status === 'CREATED' || t.tranche.lockbox.status === 'CONFIRMED'
      );
      if (allCreated && batchTranches.length > 0) {
        skippedBatches++;
        completedBatches++;
        continue;
      }

      const result = await this.executeBatch(batch.id, batch.trancheIds);

      if (result.success) {
        completedBatches++;
        await logRepo.log(
          'info',
          'vesting-executor',
          `Batch ${batch.id} completed with txid ${result.txid}`,
          { batchId: batch.id, txid: result.txid },
          this.campaign.id
        );
      } else {
        failedBatches++;
        execution.failures.batchFailures.push({
          batchId: batch.id,
          error: result.error || 'Unknown error',
        });

        // Fail-closed: stop on first failure
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

      if (this.config.batchDelayMs && i < plan.batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.config.batchDelayMs));
      }
    }

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
      message: execution.state === 'COMPLETED' ? 'All lockboxes created' : 'Execution paused',
    });

    return {
      success: failedBatches === 0,
      completedBatches,
      failedBatches,
      skippedBatches,
    };
  }

  // ============================================================================
  // Batch Execution
  // ============================================================================

  private async executeBatch(batchId: string, trancheIds: string[]): Promise<VestingBatchResult> {
    const result: VestingBatchResult = {
      success: false,
      batchId,
      broadcastAttempted: false,
    };

    try {
      // 1. Resolve tranches and generate lockbox addresses
      const resolved = await this.resolveTranches(trancheIds);
      if (resolved.length === 0) {
        result.error = 'No tranches found for batch';
        return result;
      }

      // 2. Build unsigned transaction
      const tx = this.buildLockboxTransaction(resolved);
      if (!tx) {
        result.error = 'Failed to build lockbox transaction';
        return result;
      }

      // 3. Sign transaction
      const signResult = await this.config.signer.sign(tx, this.config.addressDerivations);
      if (!signResult.success || !signResult.transaction) {
        result.error = signResult.error || 'Failed to sign transaction';
        return result;
      }

      const signedTx = signResult.transaction;
      result.txid = signedTx.txid;

      // 4. CRITICAL: Persist txid + outpoints BEFORE broadcast
      const outpointMap = this.mapTranchesToOutputIndices(resolved);
      result.outpoints = outpointMap;

      await this.persistLockboxOutpoints(signedTx.txid, resolved, outpointMap);

      // 5. Broadcast
      result.broadcastAttempted = true;
      const broadcastResult = await this.config.adapter.broadcast(signedTx.txHex);

      if (!broadcastResult.success) {
        result.error = `Broadcast failed: ${broadcastResult.error}. txid: ${signedTx.txid}`;
        // Mark tranches as failed but keep outpoints for potential retry
        for (const r of resolved) {
          r.tranche.lockbox.status = 'PLANNED';
        }
        await this.persistCampaign();
        return result;
      }

      // 6. Mark tranches as CREATED
      for (const r of resolved) {
        r.tranche.lockbox.status = 'CREATED';
      }

      // 7. Track confirmation
      const execution = this.campaign.execution;
      if (execution) {
        const now = Date.now();
        execution.confirmations[signedTx.txid] = {
          status: 'SEEN',
          lastCheckedAt: now,
          firstSeenAt: now,
        };
      }

      await this.persistCampaign();
      result.success = true;
      return result;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  // ============================================================================
  // Lockbox Resolution
  // ============================================================================

  private getTranchesForBatch(
    trancheIds: string[]
  ): { tranche: TrancheRow; beneficiary: BeneficiaryRow }[] {
    const results: { tranche: TrancheRow; beneficiary: BeneficiaryRow }[] = [];
    const idSet = new Set(trancheIds);

    for (const beneficiary of this.campaign.beneficiaries) {
      for (const tranche of beneficiary.tranches) {
        if (idSet.has(tranche.id)) {
          results.push({ tranche, beneficiary });
        }
      }
    }
    return results;
  }

  private async resolveTranches(trancheIds: string[]): Promise<ResolvedTranche[]> {
    const results: ResolvedTranche[] = [];
    const raw = this.getTranchesForBatch(trancheIds);

    for (const { tranche, beneficiary } of raw) {
      // Derive beneficiary's pubkey hash from their address
      const decoded = decodeCashAddr(beneficiary.address);
      const beneficiaryPkh = bytesToHex(decoded.hash);

      // Generate lockbox
      const lockbox = await generateLockbox({
        unlockTime: tranche.unlockTime,
        beneficiaryPkh,
        network: this.campaign.network,
      });

      // Persist lockbox address and redeemScript
      tranche.lockbox.lockAddress = lockbox.lockAddress;
      tranche.lockbox.redeemScriptHex = lockbox.redeemScriptHex;

      results.push({
        tranche,
        beneficiary,
        lockAddress: lockbox.lockAddress,
        redeemScriptHex: lockbox.redeemScriptHex,
        scriptHash: lockbox.scriptHash,
      });
    }

    return results;
  }

  // ============================================================================
  // Transaction Building
  // ============================================================================

  private buildLockboxTransaction(resolved: ResolvedTranche[]): UnsignedTransaction | null {
    const tokenCategory = this.campaign.token.tokenId;
    const dustSat = BigInt(this.campaign.settings.dustSatPerOutput);
    const effectiveDust = dustSat < MIN_DUST_SATOSHIS ? MIN_DUST_SATOSHIS : dustSat;

    // Calculate token totals
    const totalTokenIn = this.tokenUtxos.reduce((sum, u) => sum + u.token.amount, 0n);
    const totalTokenOut = resolved.reduce((sum, r) => sum + BigInt(r.tranche.amountBase), 0n);

    if (totalTokenOut > totalTokenIn) {
      return null;
    }

    const tokenChange = totalTokenIn - totalTokenOut;
    const hasTokenChange = tokenChange > 0n;

    // Calculate BCH totals
    const totalBchFromTokenInputs = this.tokenUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const totalBchFromBchInputs = this.bchUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const totalBchIn = totalBchFromTokenInputs + totalBchFromBchInputs;

    // Fee estimate
    const feeEstimate = estimateFee(
      {
        bchInputCount: this.bchUtxos.length,
        tokenInputCount: this.tokenUtxos.length,
        recipientCount: resolved.length,
        hasTokenChange,
        hasBchChange: true,
        hasOpReturn: false,
      },
      this.campaign.settings.feeRateSatPerByte,
      effectiveDust
    );

    const dustForLockboxes = effectiveDust * BigInt(resolved.length);
    const dustForTokenChange = hasTokenChange ? effectiveDust : 0n;
    const totalBchNeeded = dustForLockboxes + dustForTokenChange + feeEstimate.feeWithMargin;

    if (totalBchIn < totalBchNeeded) {
      return null;
    }

    const bchChange = totalBchIn - totalBchNeeded;
    const hasBchChange = bchChange >= MIN_DUST_SATOSHIS;
    const finalFee = hasBchChange
      ? feeEstimate.feeWithMargin
      : feeEstimate.feeWithMargin + bchChange;

    // Build inputs
    const inputs: TxInput[] = [
      ...this.tokenUtxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        satoshis: u.satoshis,
        scriptPubKey: u.scriptPubKey,
        token: {
          category: u.token.category,
          amount: u.token.amount,
          nftCommitment: u.token.nftCommitment,
          nftCapability: u.token.nftCapability,
        },
      })),
      ...this.bchUtxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        satoshis: u.satoshis,
        scriptPubKey: u.scriptPubKey,
      })),
    ];

    // Build outputs
    const outputs: TxOutput[] = [];

    // 1. Lockbox token outputs (P2SH)
    for (const r of resolved) {
      const scriptHashBytes = hexToBytes(r.scriptHash);
      const lockingScript = buildTokenP2SHScript(
        scriptHashBytes,
        tokenCategory,
        BigInt(r.tranche.amountBase)
      );

      outputs.push({
        satoshis: effectiveDust,
        lockingScript: bytesToHex(lockingScript),
        token: {
          category: tokenCategory,
          amount: BigInt(r.tranche.amountBase),
        },
      });
    }

    // 2. Token change output (P2PKH, back to source)
    if (hasTokenChange) {
      const decoded = decodeCashAddr(this.config.sourceAddress);
      const changeHash = decoded.hash;

      const tokenPrefix = buildTokenPrefix(tokenCategory, tokenChange);
      const p2pkhScript = buildP2PKHScript(changeHash);

      const lockingScript = new Uint8Array(tokenPrefix.length + p2pkhScript.length);
      lockingScript.set(tokenPrefix, 0);
      lockingScript.set(p2pkhScript, tokenPrefix.length);

      outputs.push({
        satoshis: effectiveDust,
        lockingScript: bytesToHex(lockingScript),
        token: {
          category: tokenCategory,
          amount: tokenChange,
        },
      });
    }

    // 3. BCH change output
    if (hasBchChange) {
      const decoded = decodeCashAddr(this.config.sourceAddress);
      const bchChangeScript = buildP2PKHScript(decoded.hash);

      outputs.push({
        satoshis: bchChange,
        lockingScript: bytesToHex(bchChangeScript),
      });
    }

    return {
      version: 2,
      inputs,
      outputs,
      locktime: 0,
      estimatedSize: feeEstimate.sizeBytes,
      estimatedFee: finalFee,
    };
  }

  // ============================================================================
  // Outpoint Mapping
  // ============================================================================

  /**
   * Map tranches to output indices in the transaction.
   * Lockbox outputs are first, in resolved order → vout index = array index.
   */
  private mapTranchesToOutputIndices(resolved: ResolvedTranche[]): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < resolved.length; i++) {
      map.set(resolved[i].tranche.id, i);
    }
    return map;
  }

  /**
   * Persist lockbox outpoints to campaign data BEFORE broadcast
   */
  private async persistLockboxOutpoints(
    txid: string,
    resolved: ResolvedTranche[],
    outpointMap: Map<string, number>
  ): Promise<void> {
    for (const r of resolved) {
      const vout = outpointMap.get(r.tranche.id);
      if (vout !== undefined) {
        r.tranche.lockbox.outpoint = { txid, vout };
        r.tranche.lockbox.txid = txid;
      }
    }
    await this.persistCampaign();
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private async persistCampaign(): Promise<void> {
    this.campaign.updatedAt = Date.now();
    await vestingRepo.update(this.campaign);
  }

  private reportProgress(progress: VestingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}

// ============================================================================
// Helper
// ============================================================================

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

export function createVestingExecutor(
  config: VestingExecutorConfig,
  campaign: VestingCampaign
): VestingExecutor {
  return new VestingExecutor(config, campaign);
}
