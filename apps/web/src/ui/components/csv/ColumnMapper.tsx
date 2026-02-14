'use client';

import { useCallback, useMemo } from 'react';

import type { ColumnMapping, ColumnSuggestion, CsvRawRow } from '@/core/csv';

interface ColumnMapperProps {
  headers: string[];
  rows: CsvRawRow[];
  mapping: ColumnMapping;
  suggestion?: ColumnSuggestion | null;
  onMappingChange: (mapping: ColumnMapping) => void;
  onConfirm: () => void;
  onBack?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function ColumnMapper({
  headers,
  rows,
  mapping,
  suggestion,
  onMappingChange,
  onConfirm,
  onBack,
  isLoading = false,
  error,
}: ColumnMapperProps) {
  // Preview rows (first 3)
  const previewRows = useMemo(() => rows.slice(0, 3), [rows]);

  const handleColumnSelect = useCallback(
    (field: 'address' | 'amount' | 'memo', columnIndex: number) => {
      const newMapping = { ...mapping };

      if (field === 'address') {
        newMapping.addressColumn = columnIndex;
      } else if (field === 'amount') {
        newMapping.amountColumn = columnIndex;
      } else if (field === 'memo') {
        newMapping.memoColumn = columnIndex === -1 ? undefined : columnIndex;
      }

      onMappingChange(newMapping);
    },
    [mapping, onMappingChange]
  );

  const isValidMapping = useMemo(() => {
    return (
      mapping.addressColumn >= 0 &&
      mapping.amountColumn >= 0 &&
      mapping.addressColumn !== mapping.amountColumn &&
      (mapping.memoColumn === undefined ||
        (mapping.memoColumn !== mapping.addressColumn &&
          mapping.memoColumn !== mapping.amountColumn))
    );
  }, [mapping]);

  const columnOptions = useMemo(() => {
    return headers.map((header, index) => ({
      value: index,
      label: `${index + 1}. ${header || '(empty)'}`,
    }));
  }, [headers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Map Columns</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Select which columns contain the recipient address, amount, and optional memo.
        </p>
      </div>

      {/* Auto-detection notice */}
      {suggestion && suggestion.confidence > 0.5 && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="font-medium">Columns auto-detected</span>
          </div>
          <p className="mt-1 text-xs opacity-80">{suggestion.reasoning}</p>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Column mapping selectors */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Address column */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Address Column <span className="text-red-500">*</span>
          </label>
          <select
            value={mapping.addressColumn}
            onChange={(e) => handleColumnSelect('address', parseInt(e.target.value, 10))}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {columnOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Amount column */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Amount Column <span className="text-red-500">*</span>
          </label>
          <select
            value={mapping.amountColumn}
            onChange={(e) => handleColumnSelect('amount', parseInt(e.target.value, 10))}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {columnOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Memo column */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
            Memo Column (optional)
          </label>
          <select
            value={mapping.memoColumn ?? -1}
            onChange={(e) => handleColumnSelect('memo', parseInt(e.target.value, 10))}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value={-1}>None</option>
            {columnOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Validation warning */}
      {!isValidMapping && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300">
          Address and Amount columns must be different, and Memo (if set) must be different from
          both.
        </div>
      )}

      {/* Preview table */}
      <div>
        <h4 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Preview (first 3 rows)
        </h4>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  #
                </th>
                {headers.map((header, idx) => (
                  <th
                    key={idx}
                    className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider ${
                      idx === mapping.addressColumn
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                        : idx === mapping.amountColumn
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : idx === mapping.memoColumn
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300'
                            : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span>{header || '(empty)'}</span>
                      {idx === mapping.addressColumn && (
                        <span className="text-[10px] font-normal normal-case">Address</span>
                      )}
                      {idx === mapping.amountColumn && (
                        <span className="text-[10px] font-normal normal-case">Amount</span>
                      )}
                      {idx === mapping.memoColumn && (
                        <span className="text-[10px] font-normal normal-case">Memo</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200 dark:bg-zinc-950 dark:divide-zinc-800">
              {previewRows.map((row) => (
                <tr key={row.lineNumber}>
                  <td className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {row.lineNumber}
                  </td>
                  {row.values.map((value, idx) => (
                    <td
                      key={idx}
                      className={`px-3 py-2 text-sm font-mono truncate max-w-[200px] ${
                        idx === mapping.addressColumn
                          ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/20 dark:text-blue-100'
                          : idx === mapping.amountColumn
                            ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100'
                            : idx === mapping.memoColumn
                              ? 'bg-purple-50 text-purple-900 dark:bg-purple-950/20 dark:text-purple-100'
                              : 'text-zinc-900 dark:text-zinc-100'
                      }`}
                      title={value}
                    >
                      {value || <span className="text-zinc-400 italic">empty</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Total rows: {rows.length}</p>
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            disabled={isLoading}
          >
            Back
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={isLoading || !isValidMapping}
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
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
              Validating...
            </span>
          ) : (
            'Validate Recipients'
          )}
        </button>
      </div>
    </div>
  );
}
