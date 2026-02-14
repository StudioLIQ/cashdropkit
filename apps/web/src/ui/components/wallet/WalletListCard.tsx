'use client';

import { formatDistanceToNow } from 'date-fns';

import type { Wallet } from '@/core/db/types';

interface WalletListCardProps {
  wallet: Wallet;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function formatDate(timestamp: number): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

function truncateAddress(address: string): string {
  if (address.length <= 20) return address;
  const prefix = address.includes(':') ? address.split(':')[0] + ':' : '';
  const hash = address.includes(':') ? address.split(':')[1] : address;
  return `${prefix}${hash.slice(0, 8)}...${hash.slice(-8)}`;
}

export function WalletListCard({ wallet, isActive, onSelect, onDelete }: WalletListCardProps) {
  const primaryAddress = wallet.addresses?.[0] || wallet.watchAddress || 'No address';

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isActive
          ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/50'
          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{wallet.name}</h3>
            {isActive && (
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                Active
              </span>
            )}
            {wallet.type === 'watch-only' && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                Watch-only
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 font-mono">
            {truncateAddress(primaryAddress)}
          </p>

          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
            <span className="capitalize">{wallet.network}</span>
            <span>•</span>
            <span>Created {formatDate(wallet.createdAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {!isActive && (
            <button
              type="button"
              onClick={onSelect}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-500 dark:hover:bg-emerald-950"
            >
              Select
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
            title="Delete wallet"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
