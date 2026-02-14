'use client';

import Link from 'next/link';

import { formatDistanceToNow } from 'date-fns';

import type { CampaignStatus, CampaignSummary } from '@/core/airdrop';

interface CampaignListCardProps {
  campaign: CampaignSummary;
  onDelete: () => void;
}

function formatDate(timestamp: number): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

function formatAmount(amountBase: string | undefined, decimals?: number): string {
  if (!amountBase) return '—';
  try {
    const amount = BigInt(amountBase);
    if (decimals && decimals > 0) {
      const divisor = BigInt(10 ** decimals);
      const whole = amount / divisor;
      const fraction = amount % divisor;
      if (fraction === 0n) {
        return whole.toLocaleString();
      }
      return `${whole.toLocaleString()}.${fraction.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
    }
    return amount.toLocaleString();
  } catch {
    return '—';
  }
}

function getStatusBadge(status: CampaignStatus): { label: string; className: string } {
  switch (status) {
    case 'DRAFT':
      return {
        label: 'Draft',
        className: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
      };
    case 'READY':
      return {
        label: 'Ready',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      };
    case 'PLANNED':
      return {
        label: 'Planned',
        className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
      };
    case 'RUNNING':
      return {
        label: 'Running',
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
      };
    case 'PAUSED':
      return {
        label: 'Paused',
        className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
      };
    case 'COMPLETED':
      return {
        label: 'Completed',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
      };
    case 'FAILED':
      return {
        label: 'Failed',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
      };
  }
}

export function CampaignListCard({ campaign, onDelete }: CampaignListCardProps) {
  const statusBadge = getStatusBadge(campaign.status);
  const isInProgress = campaign.status === 'RUNNING';

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/airdrops/${campaign.id}`}
              className="font-medium text-zinc-900 dark:text-zinc-100 hover:text-emerald-600 dark:hover:text-emerald-500 truncate"
            >
              {campaign.name}
            </Link>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
            {campaign.tokenSymbol && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {campaign.tokenSymbol}
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {campaign.recipientCount.toLocaleString()} recipients
            </span>
            {campaign.totalAmount && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                {formatAmount(campaign.totalAmount)} total
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
            <span className="capitalize">{campaign.network}</span>
            <span>•</span>
            <span>Updated {formatDate(campaign.updatedAt)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          <Link
            href={`/airdrops/${campaign.id}`}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 dark:text-emerald-500 dark:hover:bg-emerald-950"
          >
            {isInProgress ? 'View' : 'Continue'}
          </Link>
          {!isInProgress && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
              title="Delete campaign"
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
          )}
        </div>
      </div>
    </div>
  );
}
