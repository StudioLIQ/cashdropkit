'use client';

import { useCallback, useState } from 'react';

import { useAirdropStore } from '@/stores';

export function BasicsStep() {
  const { activeCampaign, updateCampaignName, isSaving } = useAirdropStore();

  const [name, setName] = useState(activeCampaign?.name || '');
  const [notes, setNotes] = useState(activeCampaign?.notes || '');
  const [hasChanges, setHasChanges] = useState(false);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setHasChanges(true);
  }, []);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotes(e.target.value);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeCampaign) return;

    if (name.trim() !== activeCampaign.name) {
      await updateCampaignName(name.trim());
    }

    setHasChanges(false);
  }, [activeCampaign, name, updateCampaignName]);

  if (!activeCampaign) return null;

  const settings = activeCampaign.settings;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Campaign Basics</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure the basic settings for your airdrop campaign.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Campaign name */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Campaign Name
          </label>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            onBlur={handleSave}
            placeholder="e.g., Community Airdrop Q1 2025"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Notes <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={handleNotesChange}
            placeholder="Add any notes or description..."
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Settings summary */}
      <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Default Settings</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          These settings can be adjusted later in the Funding step.
        </p>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Fee Rate:</span>{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {settings.feeRateSatPerByte} sat/byte
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Dust:</span>{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {settings.dustSatPerOutput} sats
            </span>
          </div>
          <div>
            <span className="text-zinc-500 dark:text-zinc-400">Max outputs/tx:</span>{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {settings.maxOutputsPerTx}
            </span>
          </div>
        </div>
      </div>

      {/* Campaign info */}
      <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <div className="text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Network: </span>
          <span className="font-medium capitalize text-zinc-900 dark:text-zinc-100">
            {activeCampaign.network}
          </span>
        </div>
        <div className="text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Mode: </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {activeCampaign.mode === 'FT' ? 'Fungible Token' : 'NFT'}
          </span>
        </div>
        <div className="text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">Created: </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {new Date(activeCampaign.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Save indicator */}
      {hasChanges && (
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          {isSaving ? 'Saving...' : 'Unsaved changes'}
        </div>
      )}
    </div>
  );
}
