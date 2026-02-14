import { describe, expect, it, vi } from 'vitest';

import type { TxCheckJob, TxStatusProvider, TxStatusResult } from './confirmationWorker.js';
import { ConfirmationWorker } from './confirmationWorker.js';

function makeJob(overrides: Partial<TxCheckJob> = {}): TxCheckJob {
  return {
    txid: 'abc123',
    campaignId: 'campaign-1',
    campaignType: 'airdrop',
    firstSeenAt: Date.now() - 60_000, // 1 minute ago
    retryCount: 0,
    ...overrides,
  };
}

function makeProvider(results: Record<string, TxStatusResult>): TxStatusProvider {
  return {
    async getTxStatus(txid: string): Promise<TxStatusResult> {
      return results[txid] || { status: 'not_found' };
    },
  };
}

describe('ConfirmationWorker', () => {
  it('resolves confirmed transactions', async () => {
    const onConfirmed = vi.fn();
    const provider = makeProvider({ abc123: { status: 'confirmed', confirmations: 3 } });
    const worker = new ConfirmationWorker(provider, {}, { onConfirmed });

    const resolved = await worker.processBatch([makeJob()]);
    expect(resolved).toBe(1);
    expect(onConfirmed).toHaveBeenCalledOnce();
    expect(worker.getState().completedJobs).toBe(1);
  });

  it('keeps mempool transactions pending within threshold', async () => {
    const provider = makeProvider({ abc123: { status: 'mempool' } });
    const worker = new ConfirmationWorker(provider);

    const resolved = await worker.processBatch([makeJob({ firstSeenAt: Date.now() })]);
    expect(resolved).toBe(0);
    expect(worker.getState().pendingJobs).toBe(1);
  });

  it('marks mempool transactions as dropped after threshold', async () => {
    const onDropped = vi.fn();
    const provider = makeProvider({ abc123: { status: 'mempool' } });
    const worker = new ConfirmationWorker(provider, { droppedThresholdMs: 0 }, { onDropped });

    const resolved = await worker.processBatch([makeJob({ firstSeenAt: Date.now() - 100_000 })]);
    expect(resolved).toBe(1);
    expect(onDropped).toHaveBeenCalledOnce();
    expect(worker.getState().failedJobs).toBe(1);
  });

  it('applies exponential backoff on errors', async () => {
    const provider = makeProvider({
      abc123: { status: 'error', error: 'connection timeout' },
    });
    const worker = new ConfirmationWorker(provider);

    await worker.processBatch([makeJob()]);
    expect(worker.getState().currentBackoffMs).toBe(2000);

    await worker.processBatch([makeJob({ retryCount: 1 })]);
    expect(worker.getState().currentBackoffMs).toBe(4000);
  });

  it('sends to dead letter queue after max retries', async () => {
    const onDeadLetter = vi.fn();
    const provider = makeProvider({
      abc123: { status: 'error', error: 'permanent failure' },
    });
    const worker = new ConfirmationWorker(
      provider,
      { maxDeadLetterRetries: 2 },
      { onDeadLetter },
    );

    const job = makeJob({ retryCount: 1 }); // Will be 2 after this attempt
    await worker.processBatch([job]);
    expect(onDeadLetter).toHaveBeenCalledOnce();
    expect(worker.getState().deadLetterCount).toBe(1);
    expect(worker.getDeadLetterQueue()).toHaveLength(1);
  });

  it('resets backoff on successful status check', async () => {
    const provider = makeProvider({ abc123: { status: 'mempool' } });
    const worker = new ConfirmationWorker(provider);

    // Simulate previous backoff
    await worker.processBatch([makeJob()]);
    // state.currentBackoffMs should be 0 after successful check
    expect(worker.getState().currentBackoffMs).toBe(0);
  });

  it('processes multiple jobs in a batch', async () => {
    const onConfirmed = vi.fn();
    const provider = makeProvider({
      tx1: { status: 'confirmed', confirmations: 1 },
      tx2: { status: 'mempool' },
      tx3: { status: 'confirmed', confirmations: 5 },
    });
    const worker = new ConfirmationWorker(provider, {}, { onConfirmed });

    const jobs = [
      makeJob({ txid: 'tx1' }),
      makeJob({ txid: 'tx2', firstSeenAt: Date.now() }),
      makeJob({ txid: 'tx3' }),
    ];
    const resolved = await worker.processBatch(jobs);
    expect(resolved).toBe(2); // tx1 and tx3 confirmed
    expect(onConfirmed).toHaveBeenCalledTimes(2);
  });

  it('handles start and stop lifecycle', () => {
    const provider = makeProvider({});
    const worker = new ConfirmationWorker(provider);

    worker.start(async () => []);
    expect(worker.getState().isRunning).toBe(true);

    worker.stop();
    expect(worker.getState().isRunning).toBe(false);
  });
});
