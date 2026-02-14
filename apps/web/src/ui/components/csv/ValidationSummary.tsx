'use client';

import { useCallback, useMemo } from 'react';

import type { MergeResult, ValidationSummary as ValidationSummaryType } from '@/core/csv';

interface ValidationSummaryProps {
  summary: ValidationSummaryType;
  mergeResult?: MergeResult | null;
  decimals: number;
  mergeDuplicates: boolean;
  onMergeDuplicatesChange?: (merge: boolean) => void;
  onExportInvalid?: () => void;
  onConfirm?: () => void;
  onBack?: () => void;
  hasInvalidRows?: boolean;
  allowConfirmWithInvalid?: boolean;
}

export function ValidationSummary({
  summary,
  mergeResult,
  decimals,
  mergeDuplicates,
  onMergeDuplicatesChange,
  onExportInvalid,
  onConfirm,
  onBack,
  hasInvalidRows = false,
  allowConfirmWithInvalid = true,
}: ValidationSummaryProps) {
  const formatAmount = useCallback(
    (amountBase: bigint): string => {
      const divisor = 10 ** decimals;
      const intPart = amountBase / BigInt(divisor);
      const fracPart = amountBase % BigInt(divisor);
      if (fracPart === 0n) {
        return intPart.toLocaleString();
      }
      const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
      return `${intPart.toLocaleString()}.${fracStr}`;
    },
    [decimals]
  );

  const validPercent = useMemo(() => {
    if (summary.totalRows === 0) return 0;
    return Math.round((summary.validRows / summary.totalRows) * 100);
  }, [summary.totalRows, summary.validRows]);

  const canConfirm = useMemo(() => {
    if (summary.validRows === 0) return false;
    if (!allowConfirmWithInvalid && hasInvalidRows) return false;
    return true;
  }, [summary.validRows, allowConfirmWithInvalid, hasInvalidRows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Validation Summary</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Review the validation results before proceeding.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total rows */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Total Rows</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {summary.totalRows.toLocaleString()}
          </div>
        </div>

        {/* Valid rows */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="text-sm text-emerald-600 dark:text-emerald-400">Valid Recipients</div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            {summary.validRows.toLocaleString()}
            <span className="ml-2 text-sm font-normal">({validPercent}%)</span>
          </div>
        </div>

        {/* Invalid rows */}
        <div
          className={`rounded-xl border p-4 ${
            summary.invalidRows > 0
              ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
              : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900'
          }`}
        >
          <div
            className={`text-sm ${
              summary.invalidRows > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            Invalid Rows
          </div>
          <div
            className={`mt-1 text-2xl font-bold ${
              summary.invalidRows > 0
                ? 'text-red-700 dark:text-red-300'
                : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {summary.invalidRows.toLocaleString()}
          </div>
        </div>

        {/* Total amount */}
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Total Amount</div>
          <div className="mt-1 text-2xl font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {formatAmount(summary.totalAmountBase)}
          </div>
        </div>
      </div>

      {/* Duplicate handling */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Duplicate Addresses
            </h4>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {summary.duplicateAddressCount > 0 ? (
                <>
                  Found{' '}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    {summary.duplicateAddressCount} duplicate
                    {summary.duplicateAddressCount === 1 ? '' : 's'}
                  </span>{' '}
                  across {summary.uniqueAddressCount} unique addresses.
                </>
              ) : (
                <>No duplicate addresses found.</>
              )}
            </p>
            {mergeDuplicates && mergeResult && mergeResult.duplicateGroups.length > 0 && (
              <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                Merged into {mergeResult.mergedCount} recipients (from {mergeResult.originalCount}{' '}
                original rows)
              </p>
            )}
          </div>

          {onMergeDuplicatesChange && summary.duplicateAddressCount > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mergeDuplicates}
                onChange={(e) => onMergeDuplicatesChange(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                Merge duplicates
              </span>
            </label>
          )}
        </div>
      </div>

      {/* Error breakdown */}
      {summary.invalidRows > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <h4 className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
            Error Breakdown
          </h4>
          <ul className="space-y-1 text-sm text-red-600 dark:text-red-400">
            {summary.errorBreakdown.addressErrors > 0 && (
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {summary.errorBreakdown.addressErrors} address error
                {summary.errorBreakdown.addressErrors === 1 ? '' : 's'}
              </li>
            )}
            {summary.errorBreakdown.amountErrors > 0 && (
              <li className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {summary.errorBreakdown.amountErrors} amount error
                {summary.errorBreakdown.amountErrors === 1 ? '' : 's'}
              </li>
            )}
          </ul>

          {onExportInvalid && (
            <button
              type="button"
              onClick={onExportInvalid}
              className="mt-3 flex items-center gap-2 text-sm text-red-700 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export invalid rows as CSV
            </button>
          )}
        </div>
      )}

      {/* Warning if proceeding with invalid rows */}
      {hasInvalidRows && allowConfirmWithInvalid && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <svg
              className="h-5 w-5 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="font-medium">Proceeding with invalid rows</p>
              <p className="mt-1">
                Invalid rows will be skipped during execution. Only{' '}
                <strong>{summary.validRows}</strong> valid recipients will receive tokens.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Back to Column Mapping
          </button>
        ) : (
          <div />
        )}

        {onConfirm && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Recipients ({summary.validRows})
          </button>
        )}
      </div>
    </div>
  );
}
