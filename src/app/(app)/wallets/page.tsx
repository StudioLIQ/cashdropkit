'use client';

import { useCallback, useEffect, useState } from 'react';

import { useWalletStore } from '@/stores';

import { settingsRepo } from '@/core/db';
import type { Network } from '@/core/db/types';

import { CreateWalletModal, ImportWalletModal, WalletListCard } from '@/ui/components/wallet';

export default function WalletsPage() {
  const {
    wallets,
    activeWalletId,
    isLoading,
    isCreating,
    isImporting,
    error,
    showCreateModal,
    showImportModal,
    loadWallets,
    createNewWallet,
    importExistingWallet,
    selectWallet,
    removeWallet,
    clearError,
    openCreateModal,
    closeCreateModal,
    openImportModal,
    closeImportModal,
  } = useWalletStore();

  const [network, setNetwork] = useState<Network>('testnet');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Load wallets and network on mount
  useEffect(() => {
    loadWallets();
    settingsRepo.get().then((settings) => {
      setNetwork(settings.network);
    });
  }, [loadWallets]);

  const handleDelete = useCallback(
    async (walletId: string) => {
      await removeWallet(walletId);
      setDeleteConfirmId(null);
    },
    [removeWallet]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Wallets</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage your local wallets for signing transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Import
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Create New
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={clearError}
            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
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
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && wallets.length === 0 && (
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
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No wallets
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Add a wallet to start creating and executing campaigns.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={openImportModal}
                className="text-sm font-medium text-zinc-600 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              >
                Import existing
              </button>
              <span className="text-zinc-300 dark:text-zinc-600">or</span>
              <button
                type="button"
                onClick={openCreateModal}
                className="text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500"
              >
                Create new wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet list */}
      {!isLoading && wallets.length > 0 && (
        <div className="space-y-3">
          {wallets.map((wallet) => (
            <div key={wallet.id}>
              <WalletListCard
                wallet={wallet}
                isActive={wallet.id === activeWalletId}
                onSelect={() => selectWallet(wallet.id)}
                onDelete={() => setDeleteConfirmId(wallet.id)}
              />

              {/* Delete confirmation */}
              {deleteConfirmId === wallet.id && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    Are you sure you want to delete &quot;{wallet.name}&quot;? This action cannot be
                    undone.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(wallet.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      Delete Wallet
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Security notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
        <div className="flex gap-3">
          <svg
            className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500"
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
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Your keys never leave this device</p>
            <p className="mt-1">
              Wallets are encrypted locally using your passphrase. Make sure to back up your
              recovery phrase securely.
            </p>
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateWalletModal
        isOpen={showCreateModal}
        isCreating={isCreating}
        network={network}
        onClose={closeCreateModal}
        onCreate={createNewWallet}
      />

      <ImportWalletModal
        isOpen={showImportModal}
        isImporting={isImporting}
        network={network}
        onClose={closeImportModal}
        onImport={importExistingWallet}
      />
    </div>
  );
}
