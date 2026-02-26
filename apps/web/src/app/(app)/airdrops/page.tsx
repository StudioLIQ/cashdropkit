'use client';

import { useEffect, useState } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useAirdropStore, useConnectionStore } from '@/stores';

import { CampaignListCard, CreateCampaignModal } from '@/ui/components/airdrop';

export default function AirdropsPage() {
  const { network } = useConnectionStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    campaigns,
    isLoadingList,
    showCreateModal,
    isCreating,
    error,
    loadCampaigns,
    createCampaign,
    deleteCampaign,
    openCreateModal,
    closeCreateModal,
    clearError,
  } = useAirdropStore();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load campaigns on mount and when network changes
  useEffect(() => {
    loadCampaigns(network);
  }, [loadCampaigns, network]);

  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    openCreateModal();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('create');
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [openCreateModal, pathname, router, searchParams]);

  const handleDelete = async (id: string) => {
    await deleteCampaign(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Airdrops</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage token distribution campaigns
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Airdrop
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <div className="flex">
            <svg
              className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
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
            <div className="ml-3 flex-1">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoadingList && (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading campaigns...</span>
          </div>
        </div>
      )}

      {/* Campaign list */}
      {!isLoadingList && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div key={campaign.id}>
              {deleteConfirm === campaign.id ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Delete &quot;{campaign.name}&quot;? This action cannot be undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(campaign.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <CampaignListCard
                  campaign={campaign}
                  onDelete={() => setDeleteConfirm(campaign.id)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoadingList && campaigns.length === 0 && (
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
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No airdrop campaigns
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Get started by creating your first airdrop campaign.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500"
            >
              Create airdrop campaign
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        isCreating={isCreating}
        network={network}
        onClose={closeCreateModal}
        onCreate={async (input) => {
          await createCampaign(input);
        }}
      />
    </div>
  );
}
