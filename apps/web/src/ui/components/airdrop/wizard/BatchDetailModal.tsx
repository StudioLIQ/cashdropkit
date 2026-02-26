'use client';

import type { AirdropCampaign, BatchPlan, ConfirmationStatus, RecipientRow } from '@/core/db/types';

import { ModalLayer } from '@/ui/components/common/ModalLayer';

// ============================================================================
// Types
// ============================================================================

interface BatchDetailModalProps {
  campaign: AirdropCampaign;
  batch: BatchPlan;
  batchIndex: number;
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Batch Detail Modal
 *
 * Shows debug-grade batch information:
 * - Batch summary (index, recipients, size, fee)
 * - Inputs breakdown (token + BCH outpoints)
 * - Outputs breakdown (recipients in this batch)
 * - Confirmation status
 * - Raw tx hex (optional toggle)
 * - Failure details if any
 */
export function BatchDetailModal({ campaign, batch, batchIndex, onClose }: BatchDetailModalProps) {
  const execution = campaign.execution;
  const confirmation = batch.txid && execution?.confirmations[batch.txid];
  const failure = execution?.failures.batchFailures.find((f) => f.batchId === batch.id);

  // Get recipients for this batch
  const recipientMap = new Map<string, RecipientRow>();
  for (const r of campaign.recipients) {
    recipientMap.set(r.id, r);
  }
  const batchRecipients = batch.recipients
    .map((id) => recipientMap.get(id))
    .filter((r): r is RecipientRow => r !== undefined);

  // Confirmation status display
  const getConfirmationLabel = (status: ConfirmationStatus | undefined): string => {
    switch (status) {
      case 'CONFIRMED':
        return 'Confirmed';
      case 'SEEN':
        return 'In mempool (0 conf)';
      case 'DROPPED':
        return 'Suspected dropped';
      case 'UNKNOWN':
        return 'Unknown';
      default:
        return 'Not tracked';
    }
  };

  const getConfirmationColor = (status: ConfirmationStatus | undefined): string => {
    switch (status) {
      case 'CONFIRMED':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'SEEN':
        return 'text-blue-600 dark:text-blue-400';
      case 'DROPPED':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-zinc-500 dark:text-zinc-400';
    }
  };

  return (
    <ModalLayer isOpen={true} onClose={onClose} panelClassName="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Batch #{batchIndex + 1} Details
        </h3>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="mt-4 space-y-5">
        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Recipients</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {batch.recipients.length}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Outputs</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {batch.outputsCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Est. Size</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {batch.estimatedSizeBytes} bytes
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Est. Fee</div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {batch.estimatedFeeSat} sat
            </div>
          </div>
        </div>

        {/* TXID + Confirmation */}
        {batch.txid && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Transaction ID</div>
            <div className="mt-1 break-all font-mono text-xs text-zinc-900 dark:text-zinc-100">
              {batch.txid}
            </div>
            {confirmation && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Status:</span>
                <span
                  className={`text-xs font-medium ${getConfirmationColor(confirmation.status)}`}
                >
                  {getConfirmationLabel(confirmation.status)}
                  {confirmation.confirmations ? ` (${confirmation.confirmations} conf)` : ''}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Failure details */}
        {failure && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            <div className="text-xs font-medium text-red-700 dark:text-red-300">Batch Failure</div>
            <p className="mt-1 break-all font-mono text-xs text-red-600 dark:text-red-400">
              {failure.error}
            </p>
          </div>
        )}

        {/* Inputs breakdown */}
        <div>
          <h4 className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
            Inputs ({batch.tokenInputs.length + batch.bchInputs.length})
          </h4>
          <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {batch.tokenInputs.length > 0 && (
              <div className="border-b border-zinc-200 dark:border-zinc-700">
                <div className="bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Token Inputs ({batch.tokenInputs.length})
                </div>
                {batch.tokenInputs.map((inp, i) => (
                  <div
                    key={`t-${i}`}
                    className="border-t border-zinc-100 px-3 py-1 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    {inp.txid.slice(0, 16)}...:{inp.vout}
                  </div>
                ))}
              </div>
            )}
            {batch.bchInputs.length > 0 && (
              <div>
                <div className="bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  BCH Inputs ({batch.bchInputs.length})
                </div>
                {batch.bchInputs.map((inp, i) => (
                  <div
                    key={`b-${i}`}
                    className="border-t border-zinc-100 px-3 py-1 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                  >
                    {inp.txid.slice(0, 16)}...:{inp.vout}
                  </div>
                ))}
              </div>
            )}
            {batch.tokenInputs.length === 0 && batch.bchInputs.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                No inputs recorded
              </div>
            )}
          </div>
        </div>

        {/* Recipients in this batch */}
        <div>
          <h4 className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
            Recipients ({batchRecipients.length})
          </h4>
          <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-700">
              <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800">
                <tr>
                  <th className="px-3 py-1 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Address
                  </th>
                  <th className="px-3 py-1 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Amount
                  </th>
                  <th className="px-3 py-1 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {batchRecipients.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-1 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {r.address.length > 30
                        ? `${r.address.slice(0, 15)}...${r.address.slice(-10)}`
                        : r.address}
                    </td>
                    <td className="px-3 py-1 text-right font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {r.amountBase}
                    </td>
                    <td className="px-3 py-1">
                      <span
                        className={`text-xs font-medium ${
                          r.status === 'CONFIRMED'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : r.status === 'SENT'
                              ? 'text-blue-600 dark:text-blue-400'
                              : r.status === 'FAILED'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Close button */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
    </ModalLayer>
  );
}
