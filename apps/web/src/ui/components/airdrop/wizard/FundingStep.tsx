'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAirdropStore, useExtensionWalletStore, useUtxoStore, useWalletStore } from '@/stores';

import { outpointId } from '@/core/adapters/chain/types';
import type { Outpoint } from '@/core/adapters/chain/types';
import { quickEstimate } from '@/core/planner';
import { formatBchAmount, formatTokenAmount } from '@/core/utxo';

import { connectPaytacaWithGuard } from '@/ui/wallet/connectGuard';
import { useWallet } from '@/ui/wallet/usePaytacaWallet';

export function FundingStep() {
  const { activeCampaign, updateCampaignFunding } = useAirdropStore();
  const { wallets, activeWalletId, addWatchOnlyWallet, selectWallet } = useWalletStore();
  const {
    connect,
    isConnected: isDirectConnected,
    address: extensionAddress,
    tokenAddress: extensionTokenAddress,
    connectError,
    refetchAddresses,
  } = useWallet();
  const { connectedAddress: directWalletAddress } = useExtensionWalletStore();
  const {
    isFetching,
    fetchError,
    summary,
    selectionMode,
    selectedTokenOutpoints,
    selectedBchOutpoints,
    validation,
    fetchUtxos,
    setSelectionMode,
    autoSelect,
    toggleTokenUtxo,
    toggleBchUtxo,
    selectAllTokenUtxos,
    selectAllBchUtxos,
    clearTokenSelection,
    clearBchSelection,
    validateSelection,
    reset: resetUtxoStore,
  } = useUtxoStore();
  const [localError, setLocalError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncingSourceWallet, setIsSyncingSourceWallet] = useState(false);
  const effectiveExtensionAddress =
    directWalletAddress || extensionTokenAddress || extensionAddress;
  const isConnected = Boolean(directWalletAddress) || isDirectConnected;

  // Get current wallet and its primary address
  const currentWallet = useMemo(
    () => wallets.find((w) => w.id === activeCampaign?.funding.sourceWalletId),
    [wallets, activeCampaign?.funding.sourceWalletId]
  );
  const currentWalletAddress = currentWallet?.addresses?.[0] || currentWallet?.watchAddress;

  const primaryAddress = currentWalletAddress;

  // Calculate requirements from campaign
  const requirements = useMemo(() => {
    if (!activeCampaign) return null;

    const validRecipients = activeCampaign.recipients.filter((r) => r.valid);
    const requiredTokenAmount = validRecipients.reduce((sum, r) => sum + BigInt(r.amountBase), 0n);

    const estimate = quickEstimate(validRecipients.length, activeCampaign.settings);

    return {
      requiredTokenAmount,
      requiredBchSatoshis: estimate.estimatedTotalRequired,
      maxInputsPerTx: activeCampaign.settings.maxInputsPerTx,
    };
  }, [activeCampaign]);

  // Fetch UTXOs when wallet changes
  useEffect(() => {
    if (primaryAddress && activeCampaign?.token.tokenId) {
      fetchUtxos(primaryAddress, activeCampaign.token.tokenId);
    } else {
      resetUtxoStore();
    }
  }, [primaryAddress, activeCampaign?.token.tokenId, fetchUtxos, resetUtxoStore]);

  // Auto-select when summary loads and mode is auto
  useEffect(() => {
    if (summary && requirements && selectionMode === 'auto') {
      autoSelect(requirements);
    }
  }, [summary, requirements, selectionMode, autoSelect]);

  // Validate manual selection when it changes
  useEffect(() => {
    if (
      selectionMode === 'manual' &&
      summary &&
      requirements &&
      (selectedTokenOutpoints.length > 0 || selectedBchOutpoints.length > 0)
    ) {
      validateSelection(requirements);
    }
  }, [
    selectionMode,
    summary,
    requirements,
    selectedTokenOutpoints,
    selectedBchOutpoints,
    validateSelection,
  ]);

  const syncConnectedSourceWallet = useCallback(
    async (address: string) => {
      if (!activeCampaign) return;

      const normalizedAddress = address.trim().toLowerCase();
      const existingWallet = wallets.find(
        (wallet) =>
          wallet.network === activeCampaign.network &&
          ((wallet.watchAddress && wallet.watchAddress.toLowerCase() === normalizedAddress) ||
            wallet.addresses?.some(
              (walletAddress) => walletAddress.toLowerCase() === normalizedAddress
            ))
      );

      const sourceWallet =
        existingWallet ??
        (await addWatchOnlyWallet(
          `Paytaca ${address.slice(0, 8)}...${address.slice(-6)}`,
          address,
          activeCampaign.network
        ));

      if (activeWalletId !== sourceWallet.id) {
        await selectWallet(sourceWallet.id);
      }

      if (activeCampaign.funding.sourceWalletId !== sourceWallet.id) {
        await updateCampaignFunding({
          ...activeCampaign.funding,
          sourceWalletId: sourceWallet.id,
        });
      }
    },
    [
      activeCampaign,
      wallets,
      addWatchOnlyWallet,
      activeWalletId,
      selectWallet,
      updateCampaignFunding,
    ]
  );

  const handleConnectWallet = useCallback(async () => {
    setLocalError(null);
    try {
      setIsConnecting(true);
      await connectPaytacaWithGuard({ connect, refetchAddresses });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to connect extension wallet');
    } finally {
      setIsConnecting(false);
    }
  }, [connect, refetchAddresses]);

  useEffect(() => {
    const connected = effectiveExtensionAddress?.trim();
    if (!activeCampaign || !isConnected || !connected) return;

    const normalizedConnected = connected.toLowerCase();
    const normalizedCurrentWalletAddress = currentWalletAddress?.toLowerCase();
    const isAlreadySynced =
      normalizedCurrentWalletAddress === normalizedConnected &&
      activeCampaign.funding.sourceWalletId.length > 0 &&
      activeWalletId === activeCampaign.funding.sourceWalletId;

    if (isAlreadySynced) return;

    let cancelled = false;
    setLocalError(null);
    setIsSyncingSourceWallet(true);

    syncConnectedSourceWallet(connected)
      .catch((err) => {
        if (cancelled) return;
        setLocalError(
          err instanceof Error
            ? err.message
            : 'Failed to auto-sync extension address as source wallet'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsSyncingSourceWallet(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCampaign,
    isConnected,
    effectiveExtensionAddress,
    currentWalletAddress,
    activeWalletId,
    syncConnectedSourceWallet,
  ]);

  const handleModeToggle = useCallback(() => {
    const newMode = selectionMode === 'auto' ? 'manual' : 'auto';
    setSelectionMode(newMode);
    if (newMode === 'auto' && requirements) {
      autoSelect(requirements);
    }
  }, [selectionMode, setSelectionMode, autoSelect, requirements]);

  const handleRefresh = useCallback(() => {
    if (primaryAddress && activeCampaign?.token.tokenId) {
      fetchUtxos(primaryAddress, activeCampaign.token.tokenId);
    }
  }, [primaryAddress, activeCampaign?.token.tokenId, fetchUtxos]);

  // Check if a UTXO is selected
  const isTokenSelected = useCallback(
    (outpoint: Outpoint) => {
      const id = outpointId(outpoint);
      return selectedTokenOutpoints.some((o) => outpointId(o) === id);
    },
    [selectedTokenOutpoints]
  );

  const isBchSelected = useCallback(
    (outpoint: Outpoint) => {
      const id = outpointId(outpoint);
      return selectedBchOutpoints.some((o) => outpointId(o) === id);
    },
    [selectedBchOutpoints]
  );

  if (!activeCampaign) return null;

  const tokenDecimals = activeCampaign.token.decimals ?? 0;
  const tokenSymbol = activeCampaign.token.symbol ?? 'tokens';

  // Calculate selected totals
  const selectedTokenAmount = summary
    ? summary.tokenUtxos
        .filter((u) => isTokenSelected({ txid: u.txid, vout: u.vout }))
        .reduce((sum, u) => sum + u.token.amount, 0n)
    : 0n;

  const selectedBchFromTokens = summary
    ? summary.tokenUtxos
        .filter((u) => isTokenSelected({ txid: u.txid, vout: u.vout }))
        .reduce((sum, u) => sum + u.satoshis, 0n)
    : 0n;

  const selectedPureBch = summary
    ? summary.bchUtxos
        .filter((u) => isBchSelected({ txid: u.txid, vout: u.vout }))
        .reduce((sum, u) => sum + u.satoshis, 0n)
    : 0n;

  const selectedTotalBch = selectedBchFromTokens + selectedPureBch;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Funding & UTXO Selection
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Connect your browser wallet and CashDrop will auto-bind it as source wallet.
        </p>
      </div>

      {/* Extension wallet status */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Source Wallet (Extension)
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {effectiveExtensionAddress
                ? `Connected: ${effectiveExtensionAddress}`
                : 'Connect Paytaca wallet to select source address automatically.'}
            </p>
          </div>
          {!isConnected ? (
            <button
              type="button"
              onClick={handleConnectWallet}
              disabled={isConnecting}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isConnecting ? 'Connecting...' : 'Connect Paytaca'}
            </button>
          ) : null}
        </div>

        {currentWalletAddress && (
          <p className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-300">
            Bound source wallet: {currentWalletAddress}
          </p>
        )}
        {isSyncingSourceWallet && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Syncing source wallet...</p>
        )}
        {(localError || connectError?.message) && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {localError || connectError?.message}
          </p>
        )}
        {!currentWalletAddress && isConnected && !isSyncingSourceWallet && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Connected address is not synced yet. Check extension network and reconnect.
          </p>
        )}
      </div>

      {!currentWalletAddress && (
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/50">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Source wallet is required. Connect Paytaca extension to continue.
          </p>
        </div>
      )}

      {/* UTXO Section */}
      {currentWallet && primaryAddress && (
        <div className="space-y-4">
          {/* Header with mode toggle and refresh */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">UTXO Selection</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isFetching}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <svg
                  className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
              <button
                type="button"
                onClick={handleModeToggle}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectionMode === 'auto'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {selectionMode === 'auto' ? (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Auto
                  </>
                ) : (
                  <>
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    Manual
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Fetch error */}
          {fetchError && (
            <div className="rounded-lg bg-red-50 p-3 dark:bg-red-950/50">
              <p className="text-sm text-red-700 dark:text-red-300">{fetchError}</p>
            </div>
          )}

          {/* Loading state */}
          {isFetching && (
            <div className="flex items-center justify-center py-8">
              <svg className="h-6 w-6 animate-spin text-zinc-400" fill="none" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <span className="ml-2 text-sm text-zinc-500">Fetching UTXOs...</span>
            </div>
          )}

          {/* UTXO Summary */}
          {summary && !isFetching && (
            <>
              {/* Summary cards */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Available Tokens</div>
                  <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {formatTokenAmount(summary.totalTokenAmount, tokenDecimals)} {tokenSymbol}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Available BCH</div>
                  <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                    {formatBchAmount(summary.totalBchSatoshis)} BCH
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Selected Tokens</div>
                  <div className="mt-1 font-medium text-emerald-600 dark:text-emerald-400">
                    {formatTokenAmount(selectedTokenAmount, tokenDecimals)} {tokenSymbol}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Selected BCH</div>
                  <div className="mt-1 font-medium text-emerald-600 dark:text-emerald-400">
                    {formatBchAmount(selectedTotalBch)} BCH
                  </div>
                </div>
              </div>

              {/* NFT warning */}
              {summary.excludedNftCount > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950/50">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {summary.excludedNftCount} NFT-bearing UTXO(s) excluded for safety.
                  </p>
                </div>
              )}

              {/* Token UTXOs table */}
              <div className="rounded-lg border border-zinc-200 overflow-hidden dark:border-zinc-800">
                <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 dark:bg-zinc-800">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Token UTXOs ({summary.tokenUtxos.length})
                  </span>
                  {selectionMode === 'manual' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllTokenUtxos}
                        className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={clearTokenSelection}
                        className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {summary.tokenUtxos.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No token UTXOs found for this token.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
                        <tr>
                          <th className="w-8 px-4 py-2"></th>
                          <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
                            Outpoint
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                            Token Amount
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                            BCH
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                            Conf
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {summary.tokenUtxos.map((utxo) => {
                          const outpoint = { txid: utxo.txid, vout: utxo.vout };
                          const selected = isTokenSelected(outpoint);
                          return (
                            <tr
                              key={outpointId(outpoint)}
                              onClick={() =>
                                selectionMode === 'manual' && toggleTokenUtxo(outpoint)
                              }
                              className={`cursor-pointer transition-colors ${
                                selected
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleTokenUtxo(outpoint)}
                                  disabled={selectionMode === 'auto'}
                                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
                                />
                              </td>
                              <td className="px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                                {utxo.txid.slice(0, 8)}...:{utxo.vout}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-900 dark:text-zinc-100">
                                {formatTokenAmount(utxo.token.amount, tokenDecimals)}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-600 dark:text-zinc-400">
                                {formatBchAmount(utxo.satoshis)}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">
                                {utxo.confirmations === 0 ? (
                                  <span className="text-amber-600">0</span>
                                ) : (
                                  utxo.confirmations
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* BCH UTXOs table */}
              <div className="rounded-lg border border-zinc-200 overflow-hidden dark:border-zinc-800">
                <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 dark:bg-zinc-800">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    BCH UTXOs ({summary.bchUtxos.length})
                  </span>
                  {selectionMode === 'manual' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllBchUtxos}
                        className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={clearBchSelection}
                        className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {summary.bchUtxos.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No BCH-only UTXOs found.
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50/50 dark:bg-zinc-800/50">
                        <tr>
                          <th className="w-8 px-4 py-2"></th>
                          <th className="px-4 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">
                            Outpoint
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                            BCH Amount
                          </th>
                          <th className="px-4 py-2 text-right font-medium text-zinc-600 dark:text-zinc-400">
                            Conf
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {summary.bchUtxos.map((utxo) => {
                          const outpoint = { txid: utxo.txid, vout: utxo.vout };
                          const selected = isBchSelected(outpoint);
                          return (
                            <tr
                              key={outpointId(outpoint)}
                              onClick={() => selectionMode === 'manual' && toggleBchUtxo(outpoint)}
                              className={`cursor-pointer transition-colors ${
                                selected
                                  ? 'bg-emerald-50 dark:bg-emerald-950/30'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                              }`}
                            >
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleBchUtxo(outpoint)}
                                  disabled={selectionMode === 'auto'}
                                  className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
                                />
                              </td>
                              <td className="px-4 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                                {utxo.txid.slice(0, 8)}...:{utxo.vout}
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-900 dark:text-zinc-100">
                                {formatBchAmount(utxo.satoshis)} BCH
                              </td>
                              <td className="px-4 py-2 text-right text-zinc-500 dark:text-zinc-400">
                                {utxo.confirmations === 0 ? (
                                  <span className="text-amber-600">0</span>
                                ) : (
                                  utxo.confirmations
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Validation errors */}
              {validation && validation.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950/50">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Selection Issues
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-red-600 dark:text-red-400">
                    {validation.errors.map((error, i) => (
                      <li key={i}>{error.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation warnings */}
              {validation && validation.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/50">
                  <h4 className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    Warnings
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-amber-600 dark:text-amber-400">
                    {validation.warnings.map((warning, i) => (
                      <li key={i}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation success */}
              {validation && validation.valid && (
                <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/50">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Selection meets requirements
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Requirements display */}
      {requirements && (
        <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Requirements</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400">
                Required {tokenSymbol}
              </label>
              <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                {formatTokenAmount(requirements.requiredTokenAmount, tokenDecimals)}
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 dark:text-zinc-400">
                Required BCH (fees + dust)
              </label>
              <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                {formatBchAmount(requirements.requiredBchSatoshis)} BCH
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
