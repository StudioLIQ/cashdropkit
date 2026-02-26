'use client';

import { useCallback, useMemo, useState } from 'react';

import { hashTransaction, hexToBin } from '@bitauth/libauth';
import { useSignTransaction, useWallet } from 'bch-connect';

import type { Network } from '@/core/db/types';
import type { ClaimBundle, ClaimTranche, UnlockResult } from '@/core/tx/unlockTxBuilder';
import {
  buildUnlockSigningPayload,
  filterTranchesForAddress,
  getTrancheStatus,
  parseClaimBundle,
} from '@/core/tx/unlockTxBuilder';

// ============================================================================
// Types
// ============================================================================

type UnlockState = Record<
  string,
  { status: 'idle' | 'unlocking' | 'done' | 'error'; result?: UnlockResult }
>;

interface ClaimPageClientProps {
  campaignId: string;
}

// ============================================================================
// Component
// ============================================================================

export function ClaimPageClient({ campaignId }: ClaimPageClientProps) {
  const [bundle, setBundle] = useState<ClaimBundle | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');

  const [beneficiaryAddress, setBeneficiaryAddress] = useState('');
  const [unlockStates, setUnlockStates] = useState<UnlockState>({});
  const [isConnecting, setIsConnecting] = useState(false);

  const {
    address: connectedAddress,
    tokenAddress: connectedTokenAddress,
    isConnected,
    connect,
    connectError,
    refetchAddresses,
  } = useWallet();
  const { signTransaction } = useSignTransaction();
  const effectiveConnectedAddress = connectedTokenAddress || connectedAddress;

  // Filter tranches for the beneficiary
  const myTranches = useMemo(() => {
    if (!bundle || !beneficiaryAddress.trim()) return [];
    return filterTranchesForAddress(bundle, beneficiaryAddress.trim());
  }, [bundle, beneficiaryAddress]);

  const lockedCount = useMemo(
    () => myTranches.filter((t) => getTrancheStatus(t.unlockTime) === 'LOCKED').length,
    [myTranches]
  );

  const unlockableCount = useMemo(
    () => myTranches.filter((t) => getTrancheStatus(t.unlockTime) === 'UNLOCKABLE').length,
    [myTranches]
  );

  const normalizedConnected = effectiveConnectedAddress?.trim().toLowerCase() || '';
  const normalizedBeneficiary = beneficiaryAddress.trim().toLowerCase();
  const isConnectedAddressMatchingBeneficiary =
    Boolean(normalizedConnected) && normalizedConnected === normalizedBeneficiary;

  // ========================================================================
  // Bundle Loading
  // ========================================================================

  const handleLoadBundle = useCallback(() => {
    try {
      setParseError(null);
      const parsed = parseClaimBundle(jsonText);

      // Validate campaignId matches if provided (non-empty)
      if (campaignId && parsed.campaignId !== campaignId) {
        // Allow loading anyway but show info
      }

      setBundle(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  }, [jsonText, campaignId]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setJsonText(text);
      try {
        setParseError(null);
        const parsed = parseClaimBundle(text);
        setBundle(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleConnectWallet = useCallback(async () => {
    try {
      setIsConnecting(true);
      await connect();
      await refetchAddresses();
    } catch {
      // connectError from hook is rendered in UI
    } finally {
      setIsConnecting(false);
    }
  }, [connect, refetchAddresses]);

  const applyConnectedAddress = useCallback(() => {
    if (effectiveConnectedAddress) {
      setBeneficiaryAddress(effectiveConnectedAddress);
    }
  }, [effectiveConnectedAddress]);

  // ========================================================================
  // Unlock
  // ========================================================================

  const handleUnlock = useCallback(
    async (tranche: ClaimTranche) => {
      setUnlockStates((prev) => ({
        ...prev,
        [tranche.trancheId]: { status: 'unlocking' },
      }));

      try {
        if (!isConnected) {
          await handleConnectWallet();
        }

        const currentConnectedAddress = effectiveConnectedAddress?.trim() || '';
        if (!currentConnectedAddress) {
          setUnlockStates((prev) => ({
            ...prev,
            [tranche.trancheId]: {
              status: 'error',
              result: { success: false, error: 'Connect extension wallet first' },
            },
          }));
          return;
        }

        if (currentConnectedAddress.toLowerCase() !== tranche.beneficiaryAddress.toLowerCase()) {
          setUnlockStates((prev) => ({
            ...prev,
            [tranche.trancheId]: {
              status: 'error',
              result: {
                success: false,
                error: 'Connected wallet address must match tranche beneficiary address',
              },
            },
          }));
          return;
        }

        const payloadResult = await buildUnlockSigningPayload({
          tranche,
          network: (bundle?.network || 'testnet') as Network,
          destinationAddress: currentConnectedAddress,
          feeRateSatPerByte: 1,
        });

        if (!payloadResult.success || !payloadResult.payload) {
          setUnlockStates((prev) => ({
            ...prev,
            [tranche.trancheId]: {
              status: 'error',
              result: {
                success: false,
                error: payloadResult.error || 'Failed to build unlock transaction',
              },
            },
          }));
          return;
        }

        const response = await signTransaction({
          txRequest: {
            transaction: payloadResult.payload.unsignedTxHex,
            sourceOutputs: payloadResult.payload.sourceOutputs,
            broadcast: false,
            userPrompt: 'Sign unlock transaction',
          },
        });

        if (!response) {
          setUnlockStates((prev) => ({
            ...prev,
            [tranche.trancheId]: {
              status: 'error',
              result: { success: false, error: 'Signature request rejected or canceled' },
            },
          }));
          return;
        }

        const txHex = normalizeHex(response.signedTransaction);
        let txid = normalizeHex(response.signedTransactionHash);
        if (txid.length !== 64) {
          txid = hashTransaction(hexToBin(txHex));
        }

        setUnlockStates((prev) => ({
          ...prev,
          [tranche.trancheId]: {
            status: 'done',
            result: {
              success: true,
              txid,
              txHex,
            },
          },
        }));
      } catch (error) {
        setUnlockStates((prev) => ({
          ...prev,
          [tranche.trancheId]: {
            status: 'error',
            result: {
              success: false,
              error: error instanceof Error ? error.message : 'Unlock failed',
            },
          },
        }));
      }
    },
    [bundle?.network, effectiveConnectedAddress, isConnected, handleConnectWallet, signTransaction]
  );

  // ========================================================================
  // Render
  // ========================================================================

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Claim Tokens</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Unlock your vested tokens
          {bundle
            ? ` from "${bundle.campaignName}"`
            : ` from campaign ${campaignId.slice(0, 8)}...`}
        </p>
      </div>

      {/* Bundle Loading Section */}
      {!bundle && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Load Claim Bundle
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Upload or paste your claim bundle JSON to view and unlock your tranches.
          </p>

          {/* File Upload */}
          <div className="mt-4">
            <label
              htmlFor="bundle-upload"
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 transition-colors hover:border-emerald-500 hover:bg-emerald-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-emerald-700 dark:hover:bg-emerald-950"
            >
              <svg
                className="h-10 w-10 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Click to upload claim bundle JSON
              </span>
              <input
                id="bundle-upload"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {/* Divider */}
          <div className="relative mt-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200 dark:border-zinc-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                or paste JSON
              </span>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            className="mt-4 h-32 w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            placeholder='{"version": 1, "campaignId": "...", "tranches": [...]}'
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />

          {parseError && (
            <div className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
              {parseError}
            </div>
          )}

          <button
            type="button"
            onClick={handleLoadBundle}
            disabled={!jsonText.trim()}
            className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load Bundle
          </button>
        </div>
      )}

      {/* Bundle Info */}
      {bundle && (
        <>
          {/* Campaign Info Card */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                  {bundle.campaignName}
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {bundle.token.symbol || 'Token'} &middot; {bundle.network} &middot;{' '}
                  {bundle.tranches.length} total tranches
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBundle(null);
                  setJsonText('');
                  setParseError(null);
                  setBeneficiaryAddress('');
                  setUnlockStates({});
                }}
                className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Change Bundle
              </button>
            </div>
          </div>

          {/* Extension wallet status */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-950">
            <h2 className="text-lg font-medium text-blue-900 dark:text-blue-200">
              Extension Wallet Required
            </h2>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              Recovery phrase is no longer accepted in this page. Connect your BCH extension wallet
              and sign each unlock transaction from the wallet popup.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleConnectWallet}
                disabled={isConnected || isConnecting}
                className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-700 dark:bg-zinc-900 dark:text-blue-300"
              >
                {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Connect Extension'}
              </button>
              <button
                type="button"
                onClick={applyConnectedAddress}
                disabled={!effectiveConnectedAddress}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Use Connected Address
              </button>
              <span className="text-xs text-blue-700 dark:text-blue-300">
                {effectiveConnectedAddress
                  ? `Connected: ${effectiveConnectedAddress}`
                  : 'Not connected'}
              </span>
            </div>
            {connectError && (
              <p className="mt-2 text-xs text-red-700 dark:text-red-400">{connectError.message}</p>
            )}
          </div>

          {/* Address Input */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Your Address</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Enter your beneficiary address to view your tranches.
            </p>
            <input
              type="text"
              className="mt-3 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              placeholder="bchtest:qz..."
              value={beneficiaryAddress}
              onChange={(e) => setBeneficiaryAddress(e.target.value)}
            />

            {beneficiaryAddress.trim() && myTranches.length === 0 && (
              <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                No tranches found for this address in the bundle.
              </p>
            )}

            {beneficiaryAddress.trim() &&
              effectiveConnectedAddress &&
              !isConnectedAddressMatchingBeneficiary && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Connected address does not match beneficiary address. Unlock is blocked.
                </p>
              )}
          </div>

          {/* Tranches */}
          {myTranches.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                Your Tranches ({myTranches.length})
              </h2>

              {/* Summary */}
              <div className="mt-3 flex gap-4 text-sm">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  {unlockableCount} Unlockable
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {lockedCount} Locked
                </span>
              </div>

              {/* Tranche List */}
              <div className="mt-4 space-y-3">
                {myTranches.map((tranche) => (
                  <TrancheCard
                    key={tranche.trancheId}
                    tranche={tranche}
                    tokenSymbol={bundle.token.symbol}
                    tokenDecimals={bundle.token.decimals}
                    unlockState={unlockStates[tranche.trancheId]}
                    unlockDisabled={!isConnectedAddressMatchingBeneficiary}
                    onUnlock={() => handleUnlock(tranche)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Tranche Card Sub-Component
// ============================================================================

function TrancheCard({
  tranche,
  tokenSymbol,
  tokenDecimals,
  unlockState,
  unlockDisabled,
  onUnlock,
}: {
  tranche: ClaimTranche;
  tokenSymbol?: string;
  tokenDecimals?: number;
  unlockState?: { status: 'idle' | 'unlocking' | 'done' | 'error'; result?: UnlockResult };
  unlockDisabled: boolean;
  onUnlock: () => void;
}) {
  const status = getTrancheStatus(tranche.unlockTime);
  const isUnlockable = status === 'UNLOCKABLE';
  const isUnlocking = unlockState?.status === 'unlocking';
  const isDone = unlockState?.status === 'done';
  const isError = unlockState?.status === 'error';

  const formattedAmount = formatTokenAmount(tranche.amountBase, tokenDecimals);
  const unlockDate = new Date(tranche.unlockTime * 1000);

  return (
    <div
      className={`rounded-lg border p-4 ${
        isDone
          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
          : isUnlockable
            ? 'border-emerald-200 bg-white dark:border-emerald-800 dark:bg-zinc-950'
            : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {formattedAmount} {tokenSymbol || 'tokens'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isDone
                  ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
                  : isUnlockable
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
              }`}
            >
              {isDone ? 'UNLOCKED' : status}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {isUnlockable
              ? `Unlocked since ${unlockDate.toLocaleDateString()} ${unlockDate.toLocaleTimeString()}`
              : `Unlocks ${unlockDate.toLocaleDateString()} ${unlockDate.toLocaleTimeString()}`}
          </p>
        </div>

        {isUnlockable && !isDone && (
          <button
            type="button"
            onClick={onUnlock}
            disabled={unlockDisabled || isUnlocking}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUnlocking ? 'Unlocking...' : 'Unlock'}
          </button>
        )}
      </div>

      {/* Success */}
      {isDone && unlockState?.result?.txid && (
        <div className="mt-2 rounded bg-emerald-100 p-2 dark:bg-emerald-900">
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
            Transaction ID:
          </p>
          <p className="mt-0.5 break-all font-mono text-xs text-emerald-700 dark:text-emerald-400">
            {unlockState.result.txid}
          </p>
        </div>
      )}

      {/* Error */}
      {isError && unlockState?.result?.error && (
        <div className="mt-2 rounded bg-red-50 p-2 dark:bg-red-950">
          <p className="text-xs text-red-700 dark:text-red-400">{unlockState.result.error}</p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function normalizeHex(value: string): string {
  return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

function formatTokenAmount(amountBase: string, decimals?: number): string {
  if (!decimals || decimals === 0) return amountBase;

  const str = amountBase.padStart(decimals + 1, '0');
  const intPart = str.slice(0, str.length - decimals) || '0';
  const decPart = str.slice(str.length - decimals).replace(/0+$/, '');

  return decPart ? `${intPart}.${decPart}` : intPart;
}
