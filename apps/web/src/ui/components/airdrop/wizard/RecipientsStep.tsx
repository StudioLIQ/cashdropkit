'use client';

import { useAirdropStore } from '@/stores';

export function RecipientsStep() {
  const { activeCampaign } = useAirdropStore();

  if (!activeCampaign) return null;

  const validRecipients = activeCampaign.recipients.filter((r) => r.valid);
  const invalidRecipients = activeCampaign.recipients.filter((r) => !r.valid);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Recipients</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Import your recipient list from CSV. This step will be fully implemented in T-0303.
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {activeCampaign.recipients.length}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Total Rows</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/50">
          <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
            {validRecipients.length}
          </div>
          <div className="text-sm text-emerald-600 dark:text-emerald-400">Valid Recipients</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <div className="text-2xl font-semibold text-red-700 dark:text-red-300">
            {invalidRecipients.length}
          </div>
          <div className="text-sm text-red-600 dark:text-red-400">Invalid Rows</div>
        </div>
      </div>

      {/* Placeholder for CSV import UI */}
      <div className="rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
        <svg
          className="mx-auto h-12 w-12 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          CSV Import Coming Soon
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The CSV import functionality is already implemented in src/core/csv.
          <br />
          UI integration will be completed in this wizard step.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-950/50">
        <h3 className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          CSV Format
        </h3>
        <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
          Your CSV should include columns for address and amount. Optional memo column is supported.
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-blue-100 p-2 text-xs dark:bg-blue-900">
          {`address,amount,memo
bitcoincash:qr...,1000,Team allocation
bitcoincash:qp...,500,Advisor share`}
        </pre>
      </div>
    </div>
  );
}
