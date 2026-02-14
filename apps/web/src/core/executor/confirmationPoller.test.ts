/**
 * Confirmation Poller Tests
 *
 * Tests for tx confirmation polling and DROPPED suspicion heuristic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { TxStatus, TxStatusType } from '@/core/adapters/chain/types';
import type { AirdropCampaign, ConfirmationStatus, ExecutionState } from '@/core/db/types';

import {
  ConfirmationPoller,
  type TxPollingState,
  createConfirmationPoller,
} from './confirmationPoller';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/core/db', () => ({
  airdropRepo: {
    update: vi.fn().mockResolvedValue(undefined),
  },
  logRepo: {
    log: vi.fn().mockResolvedValue(1),
  },
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
    broadcast: vi.fn().mockResolvedValue({ success: true }),
    getTxStatus: vi.fn().mockResolvedValue({
      txid: 'mock-txid',
      status: 'MEMPOOL' as TxStatusType,
      confirmations: 0,
    }),
    getRawTx: vi.fn().mockResolvedValue(null),
    getChainTip: vi.fn().mockResolvedValue({ height: 800000, hash: 'a'.repeat(64) }),
    getBlock: vi.fn().mockResolvedValue(null),
    getBlockByHash: vi.fn().mockResolvedValue(null),
    isHealthy: vi.fn().mockResolvedValue(true),
    estimateFeeRate: vi.fn().mockResolvedValue(1),
    ...overrides,
  };
}

// Helper to create a campaign with execution state and confirmations
function createTestCampaign(
  confirmations: Record<
    string,
    {
      status: ConfirmationStatus;
      confirmations?: number;
      lastCheckedAt: number;
      firstSeenAt?: number;
    }
  >,
  recipients: { id: string; txid?: string; status: string }[] = []
): AirdropCampaign {
  return {
    id: 'test-campaign',
    name: 'Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    network: 'testnet',
    token: { tokenId: 'f'.repeat(64) },
    mode: 'FT',
    amountUnit: 'base',
    recipients: recipients.map((r) => ({
      id: r.id,
      address: 'bchtest:qtest',
      amountBase: '1000',
      valid: true,
      status: r.status as 'SENT' | 'CONFIRMED',
      txid: r.txid,
    })),
    settings: {
      feeRateSatPerByte: 1,
      dustSatPerOutput: 546,
      maxOutputsPerTx: 80,
      maxInputsPerTx: 20,
      allowMergeDuplicates: false,
      rounding: 'floor' as const,
    },
    funding: {
      sourceWalletId: 'w1',
      tokenUtxoSelection: 'auto',
      bchUtxoSelection: 'auto',
    },
    plan: {
      generatedAt: Date.now(),
      totalRecipients: recipients.length,
      totalTokenAmountBase: '1000',
      estimated: {
        txCount: 1,
        totalFeeSat: '200',
        totalDustSat: '546',
        requiredBchSat: '746',
      },
      batches: Object.keys(confirmations).map((txid, i) => ({
        id: `batch-${i}`,
        recipients: recipients.filter((r) => r.txid === txid).map((r) => r.id),
        estimatedFeeSat: '200',
        estimatedSizeBytes: 200,
        tokenInputs: [],
        bchInputs: [],
        outputsCount: 2,
        txid,
      })),
    },
    execution: {
      state: 'COMPLETED',
      currentBatchIndex: Object.keys(confirmations).length,
      broadcast: { adapterName: 'mock', startedAt: Date.now(), lastUpdatedAt: Date.now() },
      failures: { batchFailures: [], recipientFailures: [] },
      confirmations,
    } as ExecutionState,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ConfirmationPoller', () => {
  let mockAdapter: ChainAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAdapter = createMockAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('createConfirmationPoller', () => {
    it('should create a poller instance', () => {
      const campaign = createTestCampaign({});
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);
      expect(poller).toBeInstanceOf(ConfirmationPoller);
    });
  });

  describe('getPendingTxids', () => {
    it('should return txids with SEEN status', () => {
      const campaign = createTestCampaign({
        'txid-1': { status: 'SEEN', lastCheckedAt: Date.now() },
        'txid-2': { status: 'CONFIRMED', confirmations: 3, lastCheckedAt: Date.now() },
        'txid-3': { status: 'SEEN', lastCheckedAt: Date.now() },
      });
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);

      const pending = poller.getPendingTxids();
      expect(pending).toHaveLength(2);
      expect(pending).toContain('txid-1');
      expect(pending).toContain('txid-3');
    });

    it('should return txids with UNKNOWN status', () => {
      const campaign = createTestCampaign({
        'txid-1': { status: 'UNKNOWN', lastCheckedAt: Date.now() },
      });
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);

      const pending = poller.getPendingTxids();
      expect(pending).toHaveLength(1);
      expect(pending).toContain('txid-1');
    });

    it('should not return CONFIRMED or DROPPED txids', () => {
      const campaign = createTestCampaign({
        'txid-1': { status: 'CONFIRMED', confirmations: 1, lastCheckedAt: Date.now() },
        'txid-2': { status: 'DROPPED', lastCheckedAt: Date.now() },
      });
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);

      const pending = poller.getPendingTxids();
      expect(pending).toHaveLength(0);
    });

    it('should return empty when no execution state', () => {
      const campaign = createTestCampaign({});
      campaign.execution = undefined;
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);

      expect(poller.getPendingTxids()).toHaveLength(0);
    });
  });

  describe('poll', () => {
    it('should update SEEN → CONFIRMED when tx has confirmations', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 3,
          blockHeight: 800001,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      const result = await poller.poll();

      expect(result.checked).toBe(1);
      expect(result.confirmed).toBe(1);
      expect(result.dropped).toBe(0);
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('CONFIRMED');
      expect(campaign.execution!.confirmations['txid-1'].confirmations).toBe(3);
    });

    it('should update recipient status to CONFIRMED', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [
          { id: 'r1', txid: 'txid-1', status: 'SENT' },
          { id: 'r2', txid: 'txid-1', status: 'SENT' },
        ]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 1,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      await poller.poll();

      expect(campaign.recipients[0].status).toBe('CONFIRMED');
      expect(campaign.recipients[1].status).toBe('CONFIRMED');
    });

    it('should not change CONFIRMED recipients back', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [
          { id: 'r1', txid: 'txid-1', status: 'CONFIRMED' },
          { id: 'r2', txid: 'txid-1', status: 'SENT' },
        ]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 2,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      await poller.poll();

      // r1 was already CONFIRMED, should stay CONFIRMED
      expect(campaign.recipients[0].status).toBe('CONFIRMED');
      // r2 was SENT, should now be CONFIRMED
      expect(campaign.recipients[1].status).toBe('CONFIRMED');
    });

    it('should keep SEEN status for MEMPOOL tx', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'MEMPOOL' as TxStatusType,
          confirmations: 0,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      const result = await poller.poll();

      expect(result.stillPending).toBe(1);
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('SEEN');
      expect(campaign.recipients[0].status).toBe('SENT');
    });

    it('should suspect DROPPED when UNKNOWN past threshold', async () => {
      const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
      const campaign = createTestCampaign(
        {
          'txid-1': {
            status: 'SEEN',
            lastCheckedAt: thirtyOneMinutesAgo,
            firstSeenAt: thirtyOneMinutesAgo,
          },
        },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'UNKNOWN' as TxStatusType,
          confirmations: 0,
        } as TxStatus),
      });

      const poller = createConfirmationPoller(
        { adapter, droppedThresholdMs: 30 * 60 * 1000 },
        campaign
      );
      const result = await poller.poll();

      expect(result.dropped).toBe(1);
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('DROPPED');
      // Recipient should NOT be changed to FAILED - DROPPED is suspicion
      expect(campaign.recipients[0].status).toBe('SENT');
    });

    it('should NOT suspect DROPPED before threshold', async () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const campaign = createTestCampaign(
        {
          'txid-1': { status: 'SEEN', lastCheckedAt: fiveMinutesAgo, firstSeenAt: fiveMinutesAgo },
        },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'UNKNOWN' as TxStatusType,
          confirmations: 0,
        } as TxStatus),
      });

      const poller = createConfirmationPoller(
        { adapter, droppedThresholdMs: 30 * 60 * 1000 },
        campaign
      );
      const result = await poller.poll();

      // Should keep SEEN status since not past threshold
      expect(result.dropped).toBe(0);
      expect(result.stillPending).toBe(1);
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('SEEN');
    });

    it('should handle provider DROPPED status directly', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'DROPPED' as TxStatusType,
          confirmations: 0,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      const result = await poller.poll();

      expect(result.dropped).toBe(1);
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('DROPPED');
    });

    it('should handle adapter errors gracefully', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockRejectedValue(new Error('Connection failed')),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      const result = await poller.poll();

      expect(result.errors).toBe(1);
      expect(result.confirmed).toBe(0);
      // Status should NOT change on error
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('SEEN');
    });

    it('should poll multiple txids independently', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        {
          'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now },
          'txid-2': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now },
        },
        [
          { id: 'r1', txid: 'txid-1', status: 'SENT' },
          { id: 'r2', txid: 'txid-2', status: 'SENT' },
        ]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi
          .fn()
          .mockResolvedValueOnce({
            txid: 'txid-1',
            status: 'CONFIRMED' as TxStatusType,
            confirmations: 2,
          } as TxStatus)
          .mockResolvedValueOnce({
            txid: 'txid-2',
            status: 'MEMPOOL' as TxStatusType,
            confirmations: 0,
          } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      const result = await poller.poll();

      expect(result.checked).toBe(2);
      expect(result.confirmed).toBe(1);
      expect(result.stillPending).toBe(1);
      expect(campaign.execution!.confirmations['txid-1'].status).toBe('CONFIRMED');
      expect(campaign.execution!.confirmations['txid-2'].status).toBe('SEEN');
    });

    it('should skip poll when no pending txids', async () => {
      const campaign = createTestCampaign({
        'txid-1': { status: 'CONFIRMED', confirmations: 5, lastCheckedAt: Date.now() },
      });

      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);
      const result = await poller.poll();

      expect(result.checked).toBe(0);
      expect(mockAdapter.getTxStatus).not.toHaveBeenCalled();
    });

    it('should persist campaign on state change', async () => {
      const { airdropRepo } = await import('@/core/db');
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 1,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter }, campaign);
      await poller.poll();

      expect(airdropRepo.update).toHaveBeenCalled();
    });

    it('should call progress callback', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 1,
        } as TxStatus),
      });

      const progressStates: TxPollingState[][] = [];
      const poller = createConfirmationPoller({ adapter }, campaign);
      poller.onProgress((states) => progressStates.push([...states]));

      await poller.poll();

      expect(progressStates.length).toBe(1);
      expect(progressStates[0][0].status).toBe('CONFIRMED');
    });
  });

  describe('start/stop', () => {
    it('should be active after start', () => {
      const campaign = createTestCampaign({});
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);

      poller.start();
      expect(poller.isActive()).toBe(true);
      poller.stop();
    });

    it('should not be active after stop', () => {
      const campaign = createTestCampaign({});
      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);

      poller.start();
      poller.stop();
      expect(poller.isActive()).toBe(false);
    });

    it('should auto-stop when all txids resolved', async () => {
      vi.useRealTimers(); // Use real timers for this test to avoid race
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 1,
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter, intervalMs: 60000 }, campaign);

      // Manually poll (simulates what start() does on first call)
      const result = await poller.poll();

      expect(result.confirmed).toBe(1);
      // getPendingTxids should now be empty since txid-1 is confirmed
      expect(poller.getPendingTxids()).toHaveLength(0);
      vi.useFakeTimers(); // Restore fake timers for other tests
    });
  });

  describe('getPollingStates', () => {
    it('should return states for all tracked txids', () => {
      const now = Date.now();
      const campaign = createTestCampaign({
        'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now },
        'txid-2': { status: 'CONFIRMED', confirmations: 5, lastCheckedAt: now },
      });

      const poller = createConfirmationPoller({ adapter: mockAdapter }, campaign);
      const states = poller.getPollingStates();

      expect(states).toHaveLength(2);
      expect(states.find((s) => s.txid === 'txid-1')?.status).toBe('SEEN');
      expect(states.find((s) => s.txid === 'txid-2')?.status).toBe('CONFIRMED');
      expect(states.find((s) => s.txid === 'txid-2')?.confirmations).toBe(5);
    });
  });

  describe('custom minConfirmations', () => {
    it('should require 3 confirmations when configured', async () => {
      const now = Date.now();
      const campaign = createTestCampaign(
        { 'txid-1': { status: 'SEEN', lastCheckedAt: now, firstSeenAt: now } },
        [{ id: 'r1', txid: 'txid-1', status: 'SENT' }]
      );

      const adapter = createMockAdapter({
        getTxStatus: vi.fn().mockResolvedValue({
          txid: 'txid-1',
          status: 'CONFIRMED' as TxStatusType,
          confirmations: 2, // Only 2, but need 3
        } as TxStatus),
      });

      const poller = createConfirmationPoller({ adapter, minConfirmations: 3 }, campaign);
      const result = await poller.poll();

      // Should NOT be confirmed yet (only 2 of 3 required)
      expect(result.confirmed).toBe(0);
      expect(result.stillPending).toBe(1);
    });
  });
});
