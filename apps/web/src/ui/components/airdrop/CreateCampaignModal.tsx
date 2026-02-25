'use client';

import { useCallback, useState } from 'react';

import type { CreateCampaignInput } from '@/core/airdrop';
import type { Network } from '@/core/db/types';

interface CreateCampaignModalProps {
  isOpen: boolean;
  isCreating: boolean;
  network: Network;
  onClose: () => void;
  onCreate: (input: CreateCampaignInput) => Promise<void>;
}

export function CreateCampaignModal({
  isOpen,
  isCreating,
  network,
  onClose,
  onCreate,
}: CreateCampaignModalProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setName('');
    setNotes('');
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleCreate = useCallback(async () => {
    setError('');

    if (!name.trim()) {
      setError('Please enter a campaign name');
      return;
    }

    try {
      await onCreate({
        name: name.trim(),
        network,
        mode: 'FT', // MVP focuses on FT
        notes: notes.trim() || undefined,
      });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    }
  }, [name, notes, network, onCreate, resetForm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Create New Airdrop
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Set up a new token distribution campaign
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Campaign Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Community Airdrop Q1 2025"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Notes <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes or description for this campaign..."
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-zinc-500 dark:text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
              <div className="text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">Network: </span>
                <span className="font-medium capitalize text-zinc-900 dark:text-zinc-100">
                  {network}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Campaigns are currently limited to testnet (Chipnet).
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}
