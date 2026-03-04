'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useConnectionStore } from '@/stores';

import { type VestingCampaign, getVestingRepo } from '@/core/db';

export default function NewVestingPage() {
  const router = useRouter();
  const { network } = useConnectionStore();
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (): Promise<void> => {
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a campaign name');
      return;
    }

    setIsCreating(true);
    try {
      const now = Date.now();
      const campaign: VestingCampaign = {
        id: crypto.randomUUID(),
        name: trimmedName,
        createdAt: now,
        updatedAt: now,
        network,
        token: {
          tokenId: '',
          symbol: undefined,
          name: undefined,
          decimals: undefined,
          iconUrl: undefined,
          verified: false,
        },
        template: 'CLIFF_ONLY',
        schedule: {
          unlockTimes: [],
          amountsBasePerTranche: [],
        },
        beneficiaries: [],
        settings: {
          feeRateSatPerByte: 1,
          dustSatPerOutput: 546,
          lockScriptType: 'P2SH_CLTV_P2PKH',
        },
        funding: {
          sourceWalletId: '',
        },
      };

      await getVestingRepo().create(campaign);
      router.push('/vesting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vesting campaign');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">New Vesting</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Create a draft vesting campaign and continue configuration next.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Campaign Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Team Vesting 2026"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
        />

        <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
          Network: <span className="font-medium capitalize">{network}</span>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <Link
            href="/vesting"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Vesting Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}
