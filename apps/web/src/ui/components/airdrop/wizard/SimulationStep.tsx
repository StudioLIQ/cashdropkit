'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAirdropStore } from '@/stores';

import { formatSatoshis, formatSatoshisAsBch, isPlanValid } from '@/core/planner';

export function SimulationStep() {
  const {
    activeCampaign,
    isPlanning,
    plannerWarnings,
    quickEstimate,
    error,
    generatePlan,
    updateQuickEstimate,
    clearPlan,
    updateCampaignSettings,
  } = useAirdropStore();

  // Local state for sliders - initialized from campaign settings
  // Use campaign values directly without syncing via useEffect
  const campaignMaxOutputs = activeCampaign?.settings.maxOutputsPerTx ?? 80;
  const campaignFeeRate = activeCampaign?.settings.feeRateSatPerByte ?? 1.0;
  const campaignDust = activeCampaign?.settings.dustSatPerOutput ?? 800;

  // Track the campaign ID to reset local overrides when campaign changes
  const [trackedCampaignId, setTrackedCampaignId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<{
    maxOutputs?: number;
    feeRate?: number;
    dust?: number;
  }>({});

  // Reset overrides when campaign changes
  const currentCampaignId = activeCampaign?.id ?? null;
  if (currentCampaignId !== trackedCampaignId) {
    setTrackedCampaignId(currentCampaignId);
    setLocalOverrides({});
  }

  // Effective values: local override or campaign value
  const localMaxOutputs = localOverrides.maxOutputs ?? campaignMaxOutputs;
  const localFeeRate = localOverrides.feeRate ?? campaignFeeRate;
  const localDust = localOverrides.dust ?? campaignDust;

  // Update quick estimate when settings change
  useEffect(() => {
    updateQuickEstimate();
  }, [activeCampaign?.recipients, localMaxOutputs, localFeeRate, localDust, updateQuickEstimate]);

  const validRecipients = useMemo(
    () => activeCampaign?.recipients.filter((r) => r.valid) ?? [],
    [activeCampaign?.recipients]
  );

  const plan = activeCampaign?.plan;
  const planIsValid = activeCampaign ? isPlanValid(activeCampaign) : false;

  // Handle settings change (updates campaign, invalidates plan)
  const handleSettingsChange = useCallback(async () => {
    if (!activeCampaign) return;

    await updateCampaignSettings({
      ...activeCampaign.settings,
      maxOutputsPerTx: localMaxOutputs,
      feeRateSatPerByte: localFeeRate,
      dustSatPerOutput: localDust,
    });
  }, [activeCampaign, localMaxOutputs, localFeeRate, localDust, updateCampaignSettings]);

  // Apply settings when user stops adjusting
  const handleSliderCommit = useCallback(() => {
    handleSettingsChange();
    // Clear plan since settings changed
    if (plan) {
      clearPlan();
    }
  }, [handleSettingsChange, plan, clearPlan]);

  // Generate plan handler
  const handleGeneratePlan = useCallback(async () => {
    // First apply any pending settings changes
    await handleSettingsChange();
    // Then generate the plan
    await generatePlan();
  }, [handleSettingsChange, generatePlan]);

  if (!activeCampaign) return null;

  // Pre-flight check items
  const preflightChecks = [
    {
      label: 'Recipients loaded',
      value: validRecipients.length.toString(),
      passed: validRecipients.length > 0,
    },
    {
      label: 'Source wallet',
      value: activeCampaign.funding.sourceWalletId ? 'Selected' : 'Not selected',
      passed: !!activeCampaign.funding.sourceWalletId,
    },
    {
      label: 'Token',
      value: activeCampaign.token.symbol || 'Not selected',
      passed: !!activeCampaign.token.tokenId,
    },
  ];

  const allChecksPassed = preflightChecks.every((c) => c.passed);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Simulation & Planning
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure batch settings and review the execution plan before starting.
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
            {plan?.estimated.txCount ?? quickEstimate?.batchCount ?? '—'}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Transactions</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {quickEstimate?.recipientsPerBatch ?? '—'}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Per Batch</div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {plan?.estimated.requiredBchSat
              ? formatSatoshisAsBch(plan.estimated.requiredBchSat)
              : quickEstimate?.estimatedTotalRequired
                ? formatSatoshisAsBch(quickEstimate.estimatedTotalRequired)
                : '—'}
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">BCH Required</div>
        </div>
      </div>

      {/* Settings sliders */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">
          Batch Settings
        </h3>

        <div className="space-y-6">
          {/* Max outputs per tx */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <label className="text-zinc-600 dark:text-zinc-400">
                Max outputs per transaction
              </label>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {localMaxOutputs}
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="150"
              value={localMaxOutputs}
              onChange={(e) =>
                setLocalOverrides((prev) => ({ ...prev, maxOutputs: Number(e.target.value) }))
              }
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700 accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-zinc-400 mt-1">
              <span>5</span>
              <span>80 (default)</span>
              <span>150</span>
            </div>
          </div>

          {/* Fee rate */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <label className="text-zinc-600 dark:text-zinc-400">Fee rate (sat/byte)</label>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {localFeeRate.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={localFeeRate}
              onChange={(e) =>
                setLocalOverrides((prev) => ({ ...prev, feeRate: Number(e.target.value) }))
              }
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700 accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-zinc-400 mt-1">
              <span>1.0 (min)</span>
              <span>5.0</span>
              <span>10.0</span>
            </div>
          </div>

          {/* Dust per output */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <label className="text-zinc-600 dark:text-zinc-400">Dust per output (satoshis)</label>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{localDust}</span>
            </div>
            <input
              type="range"
              min="546"
              max="2000"
              step="1"
              value={localDust}
              onChange={(e) =>
                setLocalOverrides((prev) => ({ ...prev, dust: Number(e.target.value) }))
              }
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full h-2 bg-zinc-200 rounded-lg appearance-none cursor-pointer dark:bg-zinc-700 accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-zinc-400 mt-1">
              <span>546 (min)</span>
              <span>800 (default)</span>
              <span>2000</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick estimate breakdown */}
      {quickEstimate && validRecipients.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
            Estimated Costs
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-zinc-500 dark:text-zinc-400">Total Fee</div>
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                {formatSatoshis(quickEstimate.estimatedTotalFee)}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 dark:text-zinc-400">Total Dust</div>
              <div className="font-medium text-zinc-900 dark:text-zinc-100">
                {formatSatoshis(quickEstimate.estimatedTotalDust)}
              </div>
            </div>
            <div>
              <div className="text-zinc-500 dark:text-zinc-400">Total BCH</div>
              <div className="font-medium text-emerald-600 dark:text-emerald-400">
                {formatSatoshis(quickEstimate.estimatedTotalRequired)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warnings */}
      {plannerWarnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/50">
          <h3 className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Warnings
          </h3>
          <ul className="space-y-1 text-sm text-amber-600 dark:text-amber-400">
            {plannerWarnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/50">
          <h3 className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300 mb-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Error
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Pre-flight check */}
      <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Pre-flight Check
        </h3>
        <ul className="mt-2 space-y-1 text-sm">
          {preflightChecks.map((check, i) => (
            <li key={i} className="flex items-center gap-2">
              {check.passed ? (
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
                <svg
                  className="h-4 w-4 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
              <span
                className={
                  check.passed
                    ? 'text-zinc-600 dark:text-zinc-400'
                    : 'text-red-600 dark:text-red-400'
                }
              >
                {check.label}: {check.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Plan status and generate button */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          {plan && planIsValid ? (
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Plan generated ({plan.batches.length} batches)
            </span>
          ) : plan && !planIsValid ? (
            <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              Plan outdated - regenerate
            </span>
          ) : (
            <span className="text-zinc-500 dark:text-zinc-400">No plan generated yet</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleGeneratePlan}
          disabled={!allChecksPassed || isPlanning}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlanning ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {plan ? 'Regenerate Plan' : 'Generate Plan'}
            </>
          )}
        </button>
      </div>

      {/* Batch breakdown table */}
      {plan && plan.batches.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="bg-zinc-50 dark:bg-zinc-800 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Batch Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
                    Batch
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                    Recipients
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                    Est. Size
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                    Est. Fee
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {plan.batches.slice(0, 10).map((batch, i) => (
                  <tr key={batch.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100">#{i + 1}</td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {batch.recipients.length}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {batch.estimatedSizeBytes.toLocaleString()} bytes
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                      {formatSatoshis(batch.estimatedFeeSat)}
                    </td>
                  </tr>
                ))}
                {plan.batches.length > 10 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-2 text-center text-zinc-500 dark:text-zinc-400"
                    >
                      ... and {plan.batches.length - 10} more batches
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
