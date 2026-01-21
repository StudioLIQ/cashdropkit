'use client';

import { useAirdropStore } from '@/stores';

export function SimulationStep() {
  const { activeCampaign } = useAirdropStore();

  if (!activeCampaign) return null;

  const validRecipients = activeCampaign.recipients.filter((r) => r.valid);
  const plan = activeCampaign.plan;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Simulation & Planning
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review the execution plan before starting the distribution.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {validRecipients.length}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Recipients</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {plan?.estimated.txCount || '—'}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Transactions</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {plan?.batches.length || '—'}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Batches</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {plan?.estimated.requiredBchSat
              ? `${(Number(plan.estimated.requiredBchSat) / 100000000).toFixed(6)}`
              : '—'}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">BCH Required</div>
        </div>
      </div>

      {/* Placeholder for planner */}
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
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Planner Coming Soon
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The distribution planner will be implemented in T-0402.
          <br />
          It will show batch breakdown, fee/dust estimates, and UTXO requirements.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Generate Plan
        </button>
      </div>

      {/* Warnings placeholder */}
      <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/50">
        <h3 className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Pre-flight Check
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-amber-600 dark:text-amber-400">
          <li className="flex items-center gap-2">
            {validRecipients.length > 0 ? (
              <svg
                className="h-4 w-4 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            Recipients loaded: {validRecipients.length}
          </li>
          <li className="flex items-center gap-2">
            {activeCampaign.funding.sourceWalletId ? (
              <svg
                className="h-4 w-4 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            Source wallet: {activeCampaign.funding.sourceWalletId ? 'Selected' : 'Not selected'}
          </li>
          <li className="flex items-center gap-2">
            {activeCampaign.token.tokenId ? (
              <svg
                className="h-4 w-4 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            Token: {activeCampaign.token.symbol || 'Not selected'}
          </li>
        </ul>
      </div>
    </div>
  );
}
