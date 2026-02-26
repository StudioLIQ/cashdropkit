'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAirdropStore, useWalletStore } from '@/stores';
import { useSignTransaction, useWallet } from 'bch-connect';

import type { BatchPlan } from '@/core/db/types';
import type { AddressDerivation } from '@/core/signer';
import { createWalletConnectSigner } from '@/core/signer';

import { BatchDetailModal } from './BatchDetailModal';

/**
 * Execute Step Component
 *
 * Provides:
 * - Start/Pause/Resume/Stop controls
 * - Batch list with status + confirmation tracking
 * - Failure list with raw error messages
 * - Retry with force rebuild option
 * - Confirmation polling with DROPPED suspicion warnings
 */
export function ExecuteStep() {
  const {
    activeCampaign,
    isExecuting,
    executionProgress,
    failedBatches,
    isPolling,
    confirmationStates,
    error,
  } = useAirdropStore();
  const {
    startExecution,
    pauseExecution,
    resumeExecution,
    retryFailedBatches,
    refreshFailedBatches,
    startConfirmationPolling,
    stopConfirmationPolling,
    clearError,
  } = useAirdropStore();
  const { wallets, activeWalletId } = useWalletStore();
  const { signTransaction } = useSignTransaction();
  const {
    address: connectedAddress,
    isConnected: isExtensionConnected,
    connect: connectExtensionWallet,
    connectError,
  } = useWallet();

  // Local UI state
  const [forceRebuild, setForceRebuild] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isConnectingExtension, setIsConnectingExtension] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<{ batch: BatchPlan; index: number } | null>(
    null
  );

  // Get active wallet
  const activeWallet = wallets.find((w) => w.id === activeWalletId);

  const execution = activeCampaign?.execution;
  const plan = activeCampaign?.plan;

  // Calculate batch statuses
  const completedBatches = plan?.batches.filter((b) => b.txid).length ?? 0;
  const totalBatches = plan?.batches.length ?? 0;

  // Determine what actions are available
  const canStart = !isExecuting && plan && (!execution || execution.state === 'READY');
  const canResume =
    !isExecuting && execution && (execution.state === 'PAUSED' || execution.state === 'FAILED');
  const canPause = isExecuting;
  const canRetry = !isExecuting && failedBatches.length > 0;

  // Check for DROPPED transactions
  const droppedTxids = confirmationStates.filter((s) => s.status === 'DROPPED');
  const hasPendingConfirmations = confirmationStates.some(
    (s) => s.status === 'SEEN' || s.status === 'UNKNOWN'
  );

  // Auto-start confirmation polling when execution completes with SENT txids
  useEffect(() => {
    if (
      execution &&
      (execution.state === 'COMPLETED' || execution.state === 'PAUSED') &&
      !isExecuting &&
      !isPolling
    ) {
      const hasSeen = Object.values(execution.confirmations).some(
        (c) => c.status === 'SEEN' || c.status === 'UNKNOWN'
      );
      if (hasSeen) {
        startConfirmationPolling();
      }
    }
  }, [execution?.state, isExecuting, isPolling, startConfirmationPolling, execution]);

  // Clean up poller on unmount
  useEffect(() => {
    return () => {
      stopConfirmationPolling();
    };
  }, [stopConfirmationPolling]);

  // Refresh failed batches when campaign execution state changes
  useEffect(() => {
    refreshFailedBatches();
  }, [execution?.state, refreshFailedBatches]);

  // Execute with extension signer
  const executeWithSigner = useCallback(
    async (action: 'start' | 'resume' | 'retry') => {
      if (!activeWallet) {
        setLocalError('No active wallet selected');
        return;
      }

      setLocalError(null);

      try {
        if (!isExtensionConnected) {
          setIsConnectingExtension(true);
          await connectExtensionWallet();
        }
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to connect extension wallet');
        return;
      } finally {
        setIsConnectingExtension(false);
      }

      const sourceAddress = activeWallet.addresses?.[0] || activeWallet.watchAddress || '';
      if (!sourceAddress) {
        setLocalError('Selected wallet has no source address');
        return;
      }

      if (connectedAddress && sourceAddress !== connectedAddress) {
        setLocalError('Active wallet address and connected extension address do not match');
        return;
      }

      const signer = createWalletConnectSigner(signTransaction);
      const addressDerivations: AddressDerivation[] = [];

      const config = {
        signer,
        sourceAddress,
        addressDerivations,
        batchDelayMs: 1000,
      };

      let result;
      switch (action) {
        case 'start':
          result = await startExecution(config);
          break;
        case 'resume':
          result = await resumeExecution(config);
          break;
        case 'retry':
          result = await retryFailedBatches(config, { forceRebuild });
          break;
      }

      signer.destroy();

      if (result && !result.success) {
        setLocalError(result.error || 'Execution failed');
      }
    },
    [
      activeWallet,
      connectedAddress,
      isExtensionConnected,
      connectExtensionWallet,
      signTransaction,
      forceRebuild,
      startExecution,
      resumeExecution,
      retryFailedBatches,
    ]
  );

  const handleConnectOnly = useCallback(async () => {
    setLocalError(null);
    try {
      setIsConnectingExtension(true);
      await connectExtensionWallet();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to connect extension wallet');
    } finally {
      setIsConnectingExtension(false);
    }
  }, [connectExtensionWallet]);

  if (!activeCampaign) return null;

  // Get status badge color
  const getStatusColor = (state: string | undefined) => {
    switch (state) {
      case 'RUNNING':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300';
      case 'PAUSED':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
      case 'FAILED':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    }
  };

  // Get confirmation badge for a batch txid
  const getConfirmationBadge = (txid: string | undefined) => {
    if (!txid || !execution) return null;
    const conf = execution.confirmations[txid];
    if (!conf) return null;

    switch (conf.status) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            {conf.confirmations ?? 1} conf
          </span>
        );
      case 'SEEN':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            0 conf (mempool)
          </span>
        );
      case 'DROPPED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
            Dropped?
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Execute Distribution
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Run the airdrop with pause/resume support and retry failed batches.
        </p>
      </div>

      {/* Error display */}
      {(error || localError || connectError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-red-700 dark:text-red-300">
                {error || localError || connectError?.message}
              </p>
            </div>
            <button
              onClick={() => {
                clearError();
                setLocalError(null);
              }}
              className="text-red-500 hover:text-red-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* DROPPED transaction warning */}
      {droppedTxids.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {droppedTxids.length} transaction{droppedTxids.length > 1 ? 's' : ''} suspected
                dropped
              </p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                These transactions were not seen in the mempool or confirmed within the expected
                timeframe. They may need to be retried with force rebuild.
              </p>
              <div className="mt-2 space-y-1">
                {droppedTxids.map((tx) => (
                  <p key={tx.txid} className="font-mono text-xs text-amber-600 dark:text-amber-400">
                    {tx.txid.slice(0, 16)}...{tx.batchId ? ` (${tx.batchId})` : ''}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Execution status */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(execution?.state)}`}
              >
                {execution?.state || 'READY'}
              </span>
              {isExecuting && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />}
              {isPolling && hasPendingConfirmations && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"
                  title="Polling for confirmations"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  Polling confirmations
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Progress</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {completedBatches} / {totalBatches}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className={`h-full transition-all ${
                execution?.state === 'COMPLETED'
                  ? 'bg-emerald-500'
                  : execution?.state === 'FAILED'
                    ? 'bg-red-500'
                    : 'bg-emerald-500'
              }`}
              style={{
                width: `${totalBatches ? (completedBatches / totalBatches) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Progress message */}
        {executionProgress?.message && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {executionProgress.message}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
          Extension wallet signing is required
        </p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
          CashDrop now signs via connected BCH wallet extension (WalletConnect). Recovery phrase
          input is not used here.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleConnectOnly}
            disabled={isExtensionConnected || isConnectingExtension}
            className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/30"
          >
            {isConnectingExtension ? 'Connecting...' : 'Connect Extension'}
          </button>
          <span className="text-xs text-blue-700 dark:text-blue-400">
            {isExtensionConnected
              ? `Connected: ${(connectedAddress || '').slice(0, 16)}...`
              : 'Not connected'}
          </span>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex flex-wrap gap-3">
        {canStart && (
          <button
            type="button"
            onClick={() => executeWithSigner('start')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
            </svg>
            Start Execution
          </button>
        )}

        {canResume && (
          <button
            type="button"
            onClick={() => executeWithSigner('resume')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
            </svg>
            Resume Execution
          </button>
        )}

        {canPause && (
          <button
            type="button"
            onClick={pauseExecution}
            className="inline-flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Pause
          </button>
        )}

        {/* Polling toggle */}
        {execution && hasPendingConfirmations && !isExecuting && (
          <button
            type="button"
            onClick={isPolling ? stopConfirmationPolling : startConfirmationPolling}
            className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${
              isPolling
                ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {isPolling ? 'Stop Polling' : 'Poll Confirmations'}
          </button>
        )}
      </div>

      {/* Batch status list */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Batch Status</h3>
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          {plan?.batches && plan.batches.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
                <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      #
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Recipients
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      TXID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Confirmations
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
                  {plan.batches.map((batch, index) => {
                    const isFailed = failedBatches.some((f) => f.batchId === batch.id);
                    const isCompleted = !!batch.txid && !isFailed;
                    const isCurrentBatch = execution?.currentBatchIndex === index && isExecuting;

                    return (
                      <tr
                        key={batch.id}
                        className={`cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${isCurrentBatch ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}
                        onClick={() => setSelectedBatch({ batch, index })}
                      >
                        <td className="whitespace-nowrap px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100">
                          {index + 1}
                          {isCurrentBatch && (
                            <span className="ml-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {batch.recipients.length}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              isCompleted
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                                : isFailed
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                  : isCurrentBatch
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                            }`}
                          >
                            {isCompleted
                              ? 'Completed'
                              : isFailed
                                ? 'Failed'
                                : isCurrentBatch
                                  ? 'Processing'
                                  : 'Pending'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-xs font-mono text-zinc-500 dark:text-zinc-400">
                          {batch.txid ? (
                            <span title={batch.txid}>{batch.txid.slice(0, 12)}...</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          {getConfirmationBadge(batch.txid)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No plan generated yet
            </div>
          )}
        </div>
      </div>

      {/* Failed batches section */}
      {failedBatches.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-red-700 dark:text-red-400">
              Failed Batches ({failedBatches.length})
            </h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={forceRebuild}
                  onChange={(e) => setForceRebuild(e.target.checked)}
                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                Force rebuild (new TXID)
              </label>
              {canRetry && (
                <button
                  type="button"
                  onClick={() => executeWithSigner('retry')}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Retry Failed
                </button>
              )}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {failedBatches.map((failure) => (
              <div
                key={failure.batchId}
                className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-sm font-medium text-red-800 dark:text-red-200">
                      Batch #{failure.batchIndex + 1}
                    </span>
                    <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                      ({failure.recipientCount} recipients)
                    </span>
                  </div>
                  {failure.txid && (
                    <span className="text-xs font-mono text-red-500">
                      txid: {failure.txid.slice(0, 12)}...
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300 font-mono break-all">
                  {failure.error}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch detail modal */}
      {selectedBatch && activeCampaign && (
        <BatchDetailModal
          campaign={activeCampaign}
          batch={selectedBatch.batch}
          batchIndex={selectedBatch.index}
          onClose={() => setSelectedBatch(null)}
        />
      )}
    </div>
  );
}
