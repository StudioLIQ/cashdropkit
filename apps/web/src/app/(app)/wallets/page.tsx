'use client';

import { useCallback, useEffect, useState } from 'react';

import { useExtensionWalletStore, useWalletStore } from '@/stores';
import { useWallet } from 'bch-connect';

import { settingsRepo } from '@/core/db';
import type { Network } from '@/core/db/types';

import { WalletListCard } from '@/ui/components/wallet';
import { connectPaytacaWithGuard } from '@/ui/wallet/connectGuard';

export default function WalletsPage() {
  const {
    wallets,
    activeWalletId,
    isLoading,
    isCreating,
    error,
    loadWallets,
    addWatchOnlyWallet,
    selectWallet,
    removeWallet,
    clearError,
  } = useWalletStore();

  const {
    connect,
    disconnect,
    isConnected: isBchConnectConnected,
    address: extensionAddress,
    tokenAddress: extensionTokenAddress,
    connectError,
    refetchAddresses,
  } = useWallet();
  const {
    connectedAddress: directWalletAddress,
    setConnectedAddress,
    clearConnectedAddress,
  } = useExtensionWalletStore();

  const effectiveExtensionAddress =
    directWalletAddress || extensionTokenAddress || extensionAddress;
  const isConnected = Boolean(directWalletAddress) || isBchConnectConnected;

  const [network, setNetwork] = useState<Network>('testnet');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    loadWallets();
    settingsRepo.get().then(() => {
      setNetwork('testnet');
    });
  }, [loadWallets]);

  const syncConnectedWallet = useCallback(
    async (address: string) => {
      const existing = wallets.find(
        (wallet) => wallet.watchAddress === address || wallet.addresses?.includes(address)
      );
      if (existing) {
        await selectWallet(existing.id);
        return;
      }

      const short = `${address.slice(0, 8)}...${address.slice(-6)}`;
      const wallet = await addWatchOnlyWallet(`Paytaca ${short}`, address, network);
      await selectWallet(wallet.id);
    },
    [wallets, selectWallet, addWatchOnlyWallet, network]
  );

  const handleDelete = useCallback(
    async (walletId: string) => {
      await removeWallet(walletId);
      setDeleteConfirmId(null);
    },
    [removeWallet]
  );

  const handleConnect = useCallback(async () => {
    setLocalError(null);
    try {
      const directAddress = await connectPaytacaWithGuard({ connect, refetchAddresses });
      if (directAddress) {
        setConnectedAddress(directAddress);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to connect extension wallet');
    }
  }, [connect, refetchAddresses, setConnectedAddress]);

  const handleDisconnect = useCallback(() => {
    clearConnectedAddress();
    disconnect();
  }, [clearConnectedAddress, disconnect]);

  useEffect(() => {
    if (!isConnected || !effectiveExtensionAddress) return;
    syncConnectedWallet(effectiveExtensionAddress).catch((err) => {
      setLocalError(err instanceof Error ? err.message : 'Failed to sync connected wallet');
    });
  }, [isConnected, effectiveExtensionAddress, syncConnectedWallet]);

  const effectiveError = error || localError || connectError?.message || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Wallets</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Connect Paytaca and CashDrop will auto-register/select the wallet address.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isConnected ? (
            <button
              type="button"
              onClick={handleConnect}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Connect Paytaca
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisconnect}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {isConnected && effectiveExtensionAddress ? (
            <>
              Connected address: {effectiveExtensionAddress}
              {isCreating ? ' (syncing...)' : ''}
            </>
          ) : (
            'Connect extension to read and auto-register wallet address'
          )}
        </p>
      </div>

      {effectiveError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <p className="text-sm text-red-600 dark:text-red-400">{effectiveError}</p>
          <button
            type="button"
            onClick={() => {
              clearError();
              setLocalError(null);
            }}
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

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      )}

      {!isLoading && wallets.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex min-h-52 flex-col items-center justify-center p-8 text-center">
            <h3 className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              No wallets yet
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Connect Paytaca wallet to auto-register your address.
            </p>
          </div>
        </div>
      )}

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

              {deleteConfirmId === wallet.id && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    Delete &quot;{wallet.name}&quot; permanently?
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

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
        <div className="text-sm text-blue-800 dark:text-blue-200">
          <p className="font-medium">Security model (updated)</p>
          <p className="mt-1">
            CashDrop no longer requires recovery phrase input in wallet onboarding for normal usage.
            Use extension wallet connection and keep seed in wallet app only.
          </p>
          <p className="mt-2">
            Supported extension wallet: <strong>Paytaca Wallet</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
