'use client';

import { useAirdropStore } from '@/stores';

export function ReportStep() {
  const { activeCampaign } = useAirdropStore();

  if (!activeCampaign) return null;

  const execution = activeCampaign.execution;
  const recipients = activeCampaign.recipients;

  const stats = {
    total: recipients.length,
    sent: recipients.filter((r) => r.status === 'SENT').length,
    confirmed: recipients.filter((r) => r.status === 'CONFIRMED').length,
    failed: recipients.filter((r) => r.status === 'FAILED').length,
    skipped: recipients.filter((r) => r.status === 'SKIPPED').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Report & Export</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review results and export distribution report.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-5">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {stats.total}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Total</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/50">
          <div className="text-2xl font-semibold text-blue-700 dark:text-blue-300">
            {stats.sent}
          </div>
          <div className="text-sm text-blue-600 dark:text-blue-400">Sent</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/50">
          <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
            {stats.confirmed}
          </div>
          <div className="text-sm text-emerald-600 dark:text-emerald-400">Confirmed</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
          <div className="text-2xl font-semibold text-red-700 dark:text-red-300">
            {stats.failed}
          </div>
          <div className="text-sm text-red-600 dark:text-red-400">Failed</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
          <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300">
            {stats.skipped}
          </div>
          <div className="text-sm text-amber-600 dark:text-amber-400">Skipped</div>
        </div>
      </div>

      {/* Export options placeholder */}
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
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Export Options
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Export functionality will be implemented in T-0601.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3"
              />
            </svg>
            Export CSV
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3"
              />
            </svg>
            Export JSON
          </button>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3"
              />
            </svg>
            TXIDs Only
          </button>
        </div>
      </div>

      {/* Report fields info */}
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
          Report Contents
        </h3>
        <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
          The export will include the following fields per recipient:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-blue-600 dark:text-blue-400">
          <li>• Address (normalized cashaddr)</li>
          <li>• Amount (base units)</li>
          <li>• Status (SENT/CONFIRMED/FAILED/SKIPPED)</li>
          <li>• Transaction ID (txid)</li>
          <li>• Error message (if failed)</li>
          <li>• Memo (if provided)</li>
        </ul>
      </div>

      {/* Campaign metadata */}
      <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Campaign Info</h3>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Campaign ID:</span>{' '}
            <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
              {activeCampaign.id}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Token:</span>{' '}
            <span className="text-zinc-900 dark:text-zinc-100">
              {activeCampaign.token.symbol || 'Unknown'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Network:</span>{' '}
            <span className="capitalize text-zinc-900 dark:text-zinc-100">
              {activeCampaign.network}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Execution State:</span>{' '}
            <span className="text-zinc-900 dark:text-zinc-100">
              {execution?.state || 'Not started'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
