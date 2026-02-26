'use client';

import { useState } from 'react';

import Link from 'next/link';

import { type ConnectionStatus, getStatusInfo } from '@/stores/connectionStore';

import type { Network } from '@/core/db/types';

interface TopbarProps {
  network: Network;
  connectionStatus: ConnectionStatus;
  walletLabel?: string;
  walletAddress?: string;
  isWalletConnected?: boolean;
  isWalletConnecting?: boolean;
  walletError?: string | null;
  isRetrying?: boolean;
  lastError?: string | null;
  onNetworkChange?: (network: Network) => void;
  onRetry?: () => void;
  onWalletConnect?: () => void | Promise<void>;
  onWalletDisconnect?: () => void;
}

function ConnectionIndicator({
  status,
  isRetrying,
  lastError,
  onRetry,
}: {
  status: ConnectionStatus;
  isRetrying?: boolean;
  lastError?: string | null;
  onRetry?: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const statusInfo = getStatusInfo(status);

  const canRetry = (status === 'offline' || status === 'degraded') && !isRetrying;

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={canRetry && onRetry ? onRetry : undefined}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={!canRetry}
        className={`cdk-pill flex items-center gap-2 px-2.5 py-1.5 text-sm transition-colors ${
          canRetry
            ? 'cursor-pointer hover:border-emerald-400/40 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
            : 'cursor-default'
        }`}
        title={canRetry ? 'Click to retry connection' : undefined}
      >
        {isRetrying ? (
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${statusInfo.bgColor}`} />
        )}
        <span className={`${statusInfo.color}`}>
          {isRetrying ? 'Connecting...' : statusInfo.label}
        </span>
        {canRetry && (
          <svg
            className="h-3 w-3 text-zinc-400"
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
        )}
      </button>

      {/* Tooltip with error details */}
      {showTooltip && lastError && (
        <div className="cdk-panel absolute left-0 top-full z-[132] mt-2 w-64 rounded-xl p-3 text-sm">
          <div className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">Connection Error</div>
          <div className="text-zinc-500 dark:text-zinc-400">{lastError}</div>
          {canRetry && (
            <div className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">Click to retry</div>
          )}
        </div>
      )}
    </div>
  );
}

function NetworkSelector({
  network,
  onChange,
  disabled,
}: {
  network: Network;
  onChange: (n: Network) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={network}
      onChange={(e) => onChange(e.target.value as Network)}
      disabled={disabled}
      className="cdk-pill rounded-full px-3.5 py-1.5 text-sm font-semibold text-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-200"
    >
      <option value="testnet">Testnet (Chipnet)</option>
    </select>
  );
}

function shortenAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

export function Topbar({
  network,
  connectionStatus,
  walletLabel,
  walletAddress,
  isWalletConnected = false,
  isWalletConnecting = false,
  walletError,
  isRetrying = false,
  lastError,
  onNetworkChange,
  onRetry,
  onWalletConnect,
  onWalletDisconnect,
}: TopbarProps) {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);

  return (
    <header className="cdk-topbar relative z-[120] flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <NetworkSelector
          network={network}
          onChange={onNetworkChange || (() => {})}
          disabled={isRetrying}
        />
        <ConnectionIndicator
          status={connectionStatus}
          isRetrying={isRetrying}
          lastError={lastError}
          onRetry={onRetry}
        />
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="relative">
          {isWalletConnected && walletAddress ? (
            <button
              type="button"
              onClick={() => setIsWalletMenuOpen((open) => !open)}
              className="cdk-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-cyan-400/45 hover:bg-cyan-50/60 dark:text-zinc-200 dark:hover:bg-cyan-950/30"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-mono text-xs sm:text-sm">{shortenAddress(walletAddress)}</span>
              <svg
                className="h-4 w-4 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void onWalletConnect?.()}
              disabled={isWalletConnecting}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/30 transition-transform hover:scale-[1.02] hover:from-cyan-400 hover:to-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              {isWalletConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}

          {isWalletMenuOpen && isWalletConnected && walletAddress && (
            <>
              <div className="fixed inset-0 z-[130]" onClick={() => setIsWalletMenuOpen(false)} />
              <div className="cdk-panel absolute right-0 top-full z-[132] mt-2 w-72 rounded-xl p-3">
                <div className="text-xs uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                  Connected Wallet
                </div>
                <div className="mt-1 font-mono text-xs text-zinc-700 dark:text-zinc-200">
                  {walletAddress}
                </div>
                {walletLabel && (
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Active: {walletLabel}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href="/wallets"
                    onClick={() => setIsWalletMenuOpen(false)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Manage
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      onWalletDisconnect?.();
                      setIsWalletMenuOpen(false);
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/50"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => setIsCreateMenuOpen(!isCreateMenuOpen)}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-transform hover:scale-[1.02] hover:from-emerald-400 hover:to-cyan-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New
          </button>

          {isCreateMenuOpen && (
            <>
              <div className="fixed inset-0 z-[130]" onClick={() => setIsCreateMenuOpen(false)} />
              <div className="cdk-panel absolute right-0 top-full z-[133] mt-2 w-52 rounded-xl py-1.5">
                <Link
                  href="/airdrops/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-emerald-50/70 dark:text-zinc-300 dark:hover:bg-emerald-950/30"
                  onClick={() => setIsCreateMenuOpen(false)}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  New Airdrop
                </Link>
                <Link
                  href="/vesting/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-cyan-50/70 dark:text-zinc-300 dark:hover:bg-cyan-950/30"
                  onClick={() => setIsCreateMenuOpen(false)}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  New Vesting
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
      {walletError && (
        <div className="w-full text-xs text-red-600 dark:text-red-400">{walletError}</div>
      )}
    </header>
  );
}

// Re-export types for convenience
export type { ConnectionStatus, Network };
