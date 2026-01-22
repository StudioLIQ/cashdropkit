/**
 * Airdrop Executor Tests
 *
 * Tests for the sequential batch execution with txid persistence-before-broadcast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import type { AirdropCampaign, BatchPlan, DistributionPlan, RecipientRow } from '@/core/db/types';
import type { MnemonicSigner, SigningResult } from '@/core/signer';
import type { UnsignedTransaction } from '@/core/tx/tokenTxBuilder';

import {
  AirdropExecutor,
  type ExecutionProgress,
  type ExecutorConfig,
  createAirdropExecutor,
} from './airdropExecutor';

// ============================================================================
// Mocks
// ============================================================================

// Mock the db repositories
vi.mock('@/core/db', () => ({
  airdropRepo: {
    update: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn(),
  },
  logRepo: {
    log: vi.fn().mockResolvedValue(1),
  },
}));

// Mock tokenTxBuilder
vi.mock('@/core/tx/tokenTxBuilder', () => ({
  buildTokenTransaction: vi.fn().mockReturnValue({
    success: true,
    transaction: {
      version: 2,
      inputs: [],
      outputs: [],
      locktime: 0,
      estimatedSize: 200,
      estimatedFee: 200n,
    } as UnsignedTransaction,
  }),
}));

// Helper to create mock chain adapter
function createMockAdapter(overrides?: Partial<ChainAdapter>): ChainAdapter {
  return {
    name: 'mock',
    network: 'testnet',
    config: { network: 'testnet', timeout: 30000, retries: 3 },
    getUtxos: vi.fn().mockResolvedValue([]),
    getBchUtxos: vi.fn().mockResolvedValue([]),
    getTokenUtxos: vi.fn().mockResolvedValue([]),
    getBalance: vi.fn().mockResolvedValue({ confirmed: 0n, unconfirmed: 0n }),
    getTokenBalances: vi.fn().mockResolvedValue([]),
    broadcast: vi.fn().mockResolvedValue({ success: true, txid: 'mock-txid' }),
    getTxStatus: vi.fn().mockResolvedValue({ confirmed: false }),
    getRawTx: vi.fn().mockResolvedValue(null),
    getChainTip: vi.fn().mockResolvedValue({ height: 800000, hash: 'a'.repeat(64) }),
    getBlock: vi.fn().mockResolvedValue(null),
    getBlockByHash: vi.fn().mockResolvedValue(null),
    isHealthy: vi.fn().mockResolvedValue(true),
    estimateFeeRate: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

// Helper to create mock signer
function createMockSigner(overrides?: Partial<MnemonicSigner>): MnemonicSigner {
  return {
    sign: vi.fn().mockResolvedValue({
      success: true,
      transaction: {
        version: 2,
        inputs: [{ txid: 'a'.repeat(64), vout: 0, scriptSig: 'aa', sequence: 0xfffffffe }],
        outputs: [{ satoshis: 1000n, lockingScript: 'bb' }],
        locktime: 0,
        txHex: 'deadbeef',
        txid: 'signed-txid-' + Math.random().toString(36).substring(7),
      },
    } as SigningResult),
    getPublicKey: vi.fn().mockResolvedValue('02' + 'a'.repeat(64)),
    canSign: vi.fn().mockResolvedValue(true),
    getMnemonic: vi.fn().mockReturnValue('test mnemonic'),
    destroy: vi.fn(),
    ...overrides,
  };
}

// Helper to create mock recipient
function createMockRecipient(id: string, address: string, amount: string): RecipientRow {
  return {
    id,
    address,
    amountBase: amount,
    valid: true,
    status: 'PENDING',
  };
}

// Helper to create mock batch
function createMockBatch(
  id: string,
  recipientIds: string[],
  tokenInputs: { txid: string; vout: number }[] = [],
  bchInputs: { txid: string; vout: number }[] = []
): BatchPlan {
  return {
    id,
    recipients: recipientIds,
    estimatedFeeSat: '200',
    estimatedSizeBytes: 200,
    tokenInputs,
    bchInputs,
    outputsCount: recipientIds.length + 2,
  };
}

// Helper to create mock campaign
function createMockCampaign(batches: BatchPlan[], recipients: RecipientRow[]): AirdropCampaign {
  const plan: DistributionPlan = {
    generatedAt: Date.now(),
    totalRecipients: recipients.length,
    totalTokenAmountBase: recipients.reduce((sum, r) => sum + BigInt(r.amountBase), 0n).toString(),
    estimated: {
      txCount: batches.length,
      totalFeeSat: (batches.length * 200).toString(),
      totalDustSat: (recipients.length * 546).toString(),
      requiredBchSat: (batches.length * 1000).toString(),
    },
    batches,
  };

  return {
    id: 'test-campaign',
    name: 'Test Airdrop',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    network: 'testnet',
    token: { tokenId: 'f'.repeat(64), symbol: 'TEST', decimals: 0 },
    mode: 'FT',
    amountUnit: 'base',
    recipients,
    settings: {
      feeRateSatPerByte: 1,
      dustSatPerOutput: 546,
      maxOutputsPerTx: 80,
      maxInputsPerTx: 20,
      allowMergeDuplicates: false,
      rounding: 'floor',
    },
    funding: {
      sourceWalletId: 'wallet-1',
      tokenUtxoSelection: 'auto',
      bchUtxoSelection: 'auto',
    },
    plan,
  };
}

// Helper to create mock UTXOs
function createMockTokenUtxo(txid: string, vout: number): TokenUtxo {
  return {
    txid,
    vout,
    satoshis: 1000n,
    scriptPubKey: '76a914' + '00'.repeat(20) + '88ac',
    confirmations: 10,
    token: {
      category: 'f'.repeat(64),
      amount: 1000000n,
    },
  };
}

function createMockBchUtxo(txid: string, vout: number): Utxo {
  return {
    txid,
    vout,
    satoshis: 100000n,
    scriptPubKey: '76a914' + '00'.repeat(20) + '88ac',
    confirmations: 10,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('AirdropExecutor', () => {
  let mockAdapter: ChainAdapter;
  let mockSigner: MnemonicSigner;
  let config: ExecutorConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockAdapter();
    mockSigner = createMockSigner();
    config = {
      adapter: mockAdapter,
      signer: mockSigner,
      sourceAddress: 'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9f4cqy2',
      addressDerivations: [
        {
          address: 'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9f4cqy2',
          accountIndex: 0,
          addressIndex: 0,
        },
      ],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createAirdropExecutor', () => {
    it('should create an executor instance', () => {
      const recipients = [createMockRecipient('r1', 'bchtest:qtest1', '1000')];
      const batches = [createMockBatch('b1', ['r1'])];
      const campaign = createMockCampaign(batches, recipients);

      const executor = createAirdropExecutor(config, campaign);

      expect(executor).toBeInstanceOf(AirdropExecutor);
    });
  });

  describe('execute', () => {
    it('should return error when no plan exists', async () => {
      const campaign = createMockCampaign([], []);
      campaign.plan = undefined;

      const executor = createAirdropExecutor(config, campaign);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No distribution plan found');
    });

    it('should execute a single batch successfully', async () => {
      const recipients = [createMockRecipient('r1', 'bchtest:qtest1', '1000')];
      const tokenUtxo = createMockTokenUtxo('token-txid', 0);
      const bchUtxo = createMockBchUtxo('bch-txid', 0);
      const batches = [
        createMockBatch(
          'b1',
          ['r1'],
          [{ txid: 'token-txid', vout: 0 }],
          [{ txid: 'bch-txid', vout: 0 }]
        ),
      ];
      const campaign = createMockCampaign(batches, recipients);

      // Mock getUtxos to return our test UTXOs
      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([tokenUtxo, bchUtxo]);

      const executor = createAirdropExecutor(config, campaign);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.completedBatches).toBe(1);
      expect(result.failedBatches).toBe(0);
    });

    it('should execute multiple batches sequentially', async () => {
      const recipients = [
        createMockRecipient('r1', 'bchtest:qtest1', '1000'),
        createMockRecipient('r2', 'bchtest:qtest2', '2000'),
        createMockRecipient('r3', 'bchtest:qtest3', '3000'),
      ];
      const tokenUtxo = createMockTokenUtxo('token-txid', 0);
      const bchUtxo1 = createMockBchUtxo('bch-txid', 0);
      const bchUtxo2 = createMockBchUtxo('bch-txid', 1);
      const bchUtxo3 = createMockBchUtxo('bch-txid', 2);
      const batches = [
        createMockBatch(
          'b1',
          ['r1'],
          [{ txid: 'token-txid', vout: 0 }],
          [{ txid: 'bch-txid', vout: 0 }]
        ),
        createMockBatch('b2', ['r2'], [], [{ txid: 'bch-txid', vout: 1 }]),
        createMockBatch('b3', ['r3'], [], [{ txid: 'bch-txid', vout: 2 }]),
      ];
      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([
        tokenUtxo,
        bchUtxo1,
        bchUtxo2,
        bchUtxo3,
      ]);

      const executor = createAirdropExecutor(config, campaign);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.completedBatches).toBe(3);
      expect(result.failedBatches).toBe(0);
      // Verify sign was called 3 times (once per batch)
      expect(mockSigner.sign).toHaveBeenCalledTimes(3);
    });

    it('should skip batches with existing txid (resume)', async () => {
      const recipients = [
        createMockRecipient('r1', 'bchtest:qtest1', '1000'),
        createMockRecipient('r2', 'bchtest:qtest2', '2000'),
      ];
      const bchUtxo1 = createMockBchUtxo('bch-txid', 0);
      const bchUtxo2 = createMockBchUtxo('bch-txid', 1);
      const batches = [
        createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }]),
        createMockBatch('b2', ['r2'], [], [{ txid: 'bch-txid', vout: 1 }]),
      ];
      // Mark first batch as already completed
      batches[0].txid = 'already-broadcast-txid';

      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo1, bchUtxo2]);

      const executor = createAirdropExecutor(config, campaign);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.completedBatches).toBe(2);
      expect(result.skippedBatches).toBe(1);
      // Sign should only be called once (for batch 2)
      expect(mockSigner.sign).toHaveBeenCalledTimes(1);
    });

    it('should stop on first failure (fail-closed)', async () => {
      const recipients = [
        createMockRecipient('r1', 'bchtest:qtest1', '1000'),
        createMockRecipient('r2', 'bchtest:qtest2', '2000'),
      ];
      const bchUtxo = createMockBchUtxo('bch-txid', 0);
      const batches = [
        createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }]),
        createMockBatch('b2', ['r2'], [], [{ txid: 'bch-txid', vout: 1 }]),
      ];
      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo]);

      // Make broadcast fail on first call
      (mockAdapter.broadcast as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      const executor = createAirdropExecutor(config, campaign);
      const result = await executor.execute();

      expect(result.success).toBe(false);
      expect(result.completedBatches).toBe(0);
      expect(result.failedBatches).toBe(1);
      expect(result.error).toContain('Network error');
      // Batch 2 should not have been attempted
      expect(mockSigner.sign).toHaveBeenCalledTimes(1);
    });

    it('should abort execution when requested', async () => {
      const recipients = [
        createMockRecipient('r1', 'bchtest:qtest1', '1000'),
        createMockRecipient('r2', 'bchtest:qtest2', '2000'),
      ];
      const bchUtxo = createMockBchUtxo('bch-txid', 0);
      const batches = [
        createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }]),
        createMockBatch('b2', ['r2'], [], [{ txid: 'bch-txid', vout: 1 }]),
      ];
      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo]);

      const executor = createAirdropExecutor(config, campaign);

      // Abort before execution starts
      executor.abort();
      expect(executor.isAborted()).toBe(true);

      await executor.execute();

      // Should have paused state after abort
      expect(campaign.execution?.state).toBe('PAUSED');
    });

    it('should report progress during execution', async () => {
      const recipients = [
        createMockRecipient('r1', 'bchtest:qtest1', '1000'),
        createMockRecipient('r2', 'bchtest:qtest2', '2000'),
      ];
      const bchUtxo1 = createMockBchUtxo('bch-txid', 0);
      const bchUtxo2 = createMockBchUtxo('bch-txid', 1);
      const batches = [
        createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }]),
        createMockBatch('b2', ['r2'], [], [{ txid: 'bch-txid', vout: 1 }]),
      ];
      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo1, bchUtxo2]);

      const progressUpdates: ExecutionProgress[] = [];
      const executor = createAirdropExecutor(config, campaign);
      executor.onProgress((progress) => progressUpdates.push({ ...progress }));

      await executor.execute();

      // Should have progress updates
      expect(progressUpdates.length).toBeGreaterThan(0);
      // Should have final completion progress
      const finalProgress = progressUpdates[progressUpdates.length - 1];
      expect(finalProgress.state).toBe('COMPLETED');
      expect(finalProgress.completedBatches).toBe(2);
    });

    it('should persist txid BEFORE broadcast', async () => {
      const { airdropRepo } = await import('@/core/db');
      const recipients = [createMockRecipient('r1', 'bchtest:qtest1', '1000')];
      const bchUtxo = createMockBchUtxo('bch-txid', 0);
      const batches = [createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }])];
      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo]);

      // Track the order of operations
      const operationOrder: string[] = [];

      (airdropRepo.update as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        operationOrder.push('persist');
      });

      (mockAdapter.broadcast as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        operationOrder.push('broadcast');
        return { success: true, txid: 'broadcast-txid' };
      });

      const executor = createAirdropExecutor(config, campaign);
      await executor.execute();

      // Persist should happen before broadcast
      const persistBeforeBroadcast =
        operationOrder.indexOf('persist') < operationOrder.lastIndexOf('broadcast');
      expect(persistBeforeBroadcast).toBe(true);
    });
  });

  describe('execution state management', () => {
    it('should initialize execution state if not present', async () => {
      const recipients = [createMockRecipient('r1', 'bchtest:qtest1', '1000')];
      const bchUtxo = createMockBchUtxo('bch-txid', 0);
      const batches = [createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }])];
      const campaign = createMockCampaign(batches, recipients);
      // Ensure execution starts as undefined
      delete (campaign as Partial<AirdropCampaign>).execution;

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo]);

      const executor = createAirdropExecutor(config, campaign);
      await executor.execute();

      // After execution, campaign.execution should be defined
      const execution = campaign.execution;
      expect(execution).toBeDefined();
      expect(execution?.state).toBe('COMPLETED');
      expect(execution?.broadcast.adapterName).toBe('mock');
    });

    it('should resume from currentBatchIndex', async () => {
      const recipients = [
        createMockRecipient('r1', 'bchtest:qtest1', '1000'),
        createMockRecipient('r2', 'bchtest:qtest2', '2000'),
        createMockRecipient('r3', 'bchtest:qtest3', '3000'),
      ];
      const bchUtxo1 = createMockBchUtxo('bch-txid', 0);
      const bchUtxo2 = createMockBchUtxo('bch-txid', 1);
      const bchUtxo3 = createMockBchUtxo('bch-txid', 2);
      const batches = [
        createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }]),
        createMockBatch('b2', ['r2'], [], [{ txid: 'bch-txid', vout: 1 }]),
        createMockBatch('b3', ['r3'], [], [{ txid: 'bch-txid', vout: 2 }]),
      ];
      // First batch already done
      batches[0].txid = 'done-txid';

      const campaign = createMockCampaign(batches, recipients);
      // Set execution state to resume from batch 1
      campaign.execution = {
        state: 'PAUSED',
        currentBatchIndex: 1,
        broadcast: { adapterName: 'mock' },
        failures: { batchFailures: [], recipientFailures: [] },
        confirmations: {},
      };

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([
        bchUtxo1,
        bchUtxo2,
        bchUtxo3,
      ]);

      const executor = createAirdropExecutor(config, campaign);
      const result = await executor.execute();

      expect(result.success).toBe(true);
      expect(result.completedBatches).toBe(2); // b2 and b3
      expect(result.skippedBatches).toBe(0); // b1 is before currentBatchIndex
    });

    it('should track batch failures', async () => {
      const recipients = [createMockRecipient('r1', 'bchtest:qtest1', '1000')];
      const bchUtxo = createMockBchUtxo('bch-txid', 0);
      const batches = [createMockBatch('b1', ['r1'], [], [{ txid: 'bch-txid', vout: 0 }])];
      const campaign = createMockCampaign(batches, recipients);

      (mockAdapter.getUtxos as ReturnType<typeof vi.fn>).mockResolvedValue([bchUtxo]);
      (mockAdapter.broadcast as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'Mempool full',
      });

      const executor = createAirdropExecutor(config, campaign);
      await executor.execute();

      expect(campaign.execution?.failures.batchFailures).toHaveLength(1);
      expect(campaign.execution?.failures.batchFailures[0].batchId).toBe('b1');
      expect(campaign.execution?.failures.batchFailures[0].error).toContain('Mempool full');
    });
  });
});
