'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { useConnectionStore } from '@/stores';

import { type VestingCampaign, getVestingRepo } from '@/core/db';

function getCampaignStatus(campaign: VestingCampaign): string {
  const state = campaign.execution?.state;
  if (state === 'RUNNING') return 'RUNNING';
  if (state === 'PAUSED') return 'PAUSED';
  if (state === 'COMPLETED') return 'COMPLETED';
  if (state === 'FAILED') return 'FAILED';
  if (campaign.plan?.batches?.length) return 'PLANNED';
  return 'DRAFT';
}

function formatUpdatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export default function VestingPage() {
  const { network } = useConnectionStore();
  const [campaigns, setCampaigns] = useState<VestingCampaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setError(null);
      try {
        const items = await getVestingRepo().getByNetwork(network);
        if (!cancelled) {
          setCampaigns(items);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load vesting campaigns');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [network]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Vesting</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage CLTV lockbox vesting campaigns
          </p>
        </div>
        <Link
          href="/vesting/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Vesting
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading campaigns...</span>
          </div>
        </div>
      )}

      {!isLoading && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
                    {campaign.name}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Updated {formatUpdatedAt(campaign.updatedAt)}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {getCampaignStatus(campaign)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                <span>Template: {campaign.template}</span>
                <span>Beneficiaries: {campaign.beneficiaries.length}</span>
                <span>
                  Token:{' '}
                  {campaign.token.tokenId ? `${campaign.token.tokenId.slice(0, 12)}...` : 'Unset'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && campaigns.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-900">
              <svg
                className="h-6 w-6 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No vesting campaigns
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Get started by creating your first vesting campaign with CLTV lockboxes.
            </p>
            <Link
              href="/vesting/new"
              className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500"
            >
              Create vesting campaign
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
