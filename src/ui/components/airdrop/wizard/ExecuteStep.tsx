'use client';

import { useAirdropStore } from '@/stores';

export function ExecuteStep() {
  const { activeCampaign } = useAirdropStore();

  if (!activeCampaign) return null;

  const execution = activeCampaign.execution;
  const plan = activeCampaign.plan;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Execute Distribution
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Run the airdrop with pause/resume support.
        </p>
      </div>

      {/* Execution status */}
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  execution?.state === 'RUNNING'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                    : execution?.state === 'PAUSED'
                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                      : execution?.state === 'COMPLETED'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : execution?.state === 'FAILED'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {execution?.state || 'READY'}
              </span>
              {execution?.state === 'RUNNING' && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">Progress</div>
            <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {execution?.currentBatchIndex || 0} / {plan?.batches.length || 0}
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
                width: `${plan?.batches.length ? ((execution?.currentBatchIndex || 0) / plan.batches.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Placeholder for executor controls */}
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
            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Executor Coming Soon
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The execution engine will be implemented in T-0503 and T-0504.
          <br />
          Features: Sign, broadcast, pause/resume, retry failed batches.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
            </svg>
            Start
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
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Pause
          </button>
        </div>
      </div>

      {/* Batch list placeholder */}
      <div>
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Batch Status</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Detailed batch view will show inputs, outputs, and transaction details.
        </p>
        <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div className="p-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {plan?.batches.length
              ? `${plan.batches.length} batches will be displayed here`
              : 'No plan generated yet'}
          </div>
        </div>
      </div>
    </div>
  );
}
