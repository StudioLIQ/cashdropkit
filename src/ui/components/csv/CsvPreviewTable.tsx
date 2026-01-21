'use client';

import { useCallback, useMemo, useState } from 'react';

import type { ValidatedRecipientRow } from '@/core/csv';

interface CsvPreviewTableProps {
  rows: ValidatedRecipientRow[];
  decimals: number;
  showOnlyInvalid?: boolean;
  maxRows?: number;
  onRowClick?: (row: ValidatedRecipientRow) => void;
}

type FilterMode = 'all' | 'valid' | 'invalid';

export function CsvPreviewTable({
  rows,
  decimals,
  showOnlyInvalid = false,
  maxRows = 100,
  onRowClick,
}: CsvPreviewTableProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>(showOnlyInvalid ? 'invalid' : 'all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRows = useMemo(() => {
    let result = rows;

    // Apply filter mode
    if (filterMode === 'valid') {
      result = result.filter((r) => r.valid);
    } else if (filterMode === 'invalid') {
      result = result.filter((r) => !r.valid);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.rawAddress.toLowerCase().includes(query) ||
          r.normalizedAddress?.toLowerCase().includes(query) ||
          r.memo?.toLowerCase().includes(query) ||
          r.lineNumber.toString().includes(query)
      );
    }

    return result;
  }, [rows, filterMode, searchQuery]);

  const displayRows = useMemo(() => {
    return filteredRows.slice(0, maxRows);
  }, [filteredRows, maxRows]);

  const formatAmount = useCallback(
    (amountBase: bigint | undefined, rawAmount: string): string => {
      if (amountBase === undefined) {
        return rawAmount;
      }
      const divisor = 10 ** decimals;
      const intPart = amountBase / BigInt(divisor);
      const fracPart = amountBase % BigInt(divisor);
      if (fracPart === 0n) {
        return intPart.toString();
      }
      const fracStr = fracPart.toString().padStart(decimals, '0').replace(/0+$/, '');
      return `${intPart}.${fracStr}`;
    },
    [decimals]
  );

  const truncateAddress = useCallback((address: string | undefined): string => {
    if (!address) return '-';
    if (address.length <= 25) return address;
    return `${address.slice(0, 16)}...${address.slice(-8)}`;
  }, []);

  const validCount = useMemo(() => rows.filter((r) => r.valid).length, [rows]);
  const invalidCount = useMemo(() => rows.filter((r) => !r.valid).length, [rows]);

  return (
    <div className="space-y-4">
      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        {/* Filter tabs */}
        <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5 bg-zinc-100 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filterMode === 'all'
                ? 'bg-white text-zinc-900 shadow dark:bg-zinc-700 dark:text-zinc-100'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            All ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('valid')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filterMode === 'valid'
                ? 'bg-white text-emerald-700 shadow dark:bg-zinc-700 dark:text-emerald-400'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Valid ({validCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('invalid')}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filterMode === 'invalid'
                ? 'bg-white text-red-700 shadow dark:bg-zinc-700 dark:text-red-400'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            Invalid ({invalidCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search address or memo..."
            className="w-full sm:w-64 rounded-lg border border-zinc-300 bg-white pl-10 pr-3 py-2 text-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-12">
                #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-16">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Address
              </th>
              <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-32">
                Amount
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider max-w-[200px]">
                Memo
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Errors
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-zinc-200 dark:bg-zinc-950 dark:divide-zinc-800">
            {displayRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400"
                >
                  No rows to display
                </td>
              </tr>
            ) : (
              displayRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={`${
                    row.valid
                      ? 'hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                      : 'bg-red-50/50 hover:bg-red-50 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                  } ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                    {row.lineNumber}
                  </td>
                  <td className="px-3 py-2">
                    {row.valid ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                        Valid
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
                        Invalid
                      </span>
                    )}
                  </td>
                  <td
                    className="px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100"
                    title={row.normalizedAddress ?? row.rawAddress}
                  >
                    {truncateAddress(row.normalizedAddress ?? row.rawAddress)}
                  </td>
                  <td className="px-3 py-2 text-sm font-mono text-right text-zinc-900 dark:text-zinc-100">
                    {formatAmount(row.amountBase, row.rawAmount)}
                  </td>
                  <td
                    className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]"
                    title={row.memo}
                  >
                    {row.memo || '-'}
                  </td>
                  <td className="px-3 py-2">
                    {row.errors.length > 0 && (
                      <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside">
                        {row.errors.map((err, idx) => (
                          <li key={idx} className="truncate" title={err}>
                            {err}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination info */}
      {filteredRows.length > maxRows && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
          Showing {maxRows} of {filteredRows.length} rows
        </p>
      )}
    </div>
  );
}
