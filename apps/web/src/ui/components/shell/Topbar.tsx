'use client';

import { useState } from 'react';

import Link from 'next/link';

import { type ConnectionStatus, getStatusInfo } from '@/stores/connectionStore';

import type { Network } from '@/core/db/types';

interface TopbarProps {
  network: Network;
  connectionStatus: ConnectionStatus;
  walletLabel?: string;
  isRetrying?: boolean;
  lastError?: string | null;
  onNetworkChange?: (network: Network) => void;
  onRetry?: () => void;
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
        <div className="cdk-panel absolute left-0 top-full z-30 mt-2 w-64 rounded-xl p-3 text-sm">
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

export function Topbar({
  network,
  connectionStatus,
  walletLabel,
  isRetrying = false,
  lastError,
  onNetworkChange,
  onRetry,
}: TopbarProps) {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  return (
    <header className="cdk-topbar flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
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
        {walletLabel && (
          <Link
            href="/wallets"
            className="cdk-pill hidden items-center gap-2 rounded-full px-3 py-1.5 text-sm text-zinc-700 hover:border-cyan-400/45 hover:bg-cyan-50/60 dark:text-zinc-200 dark:hover:bg-cyan-950/30 md:flex"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            <span className="max-w-32 truncate">{walletLabel}</span>
          </Link>
        )}

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
              <div className="fixed inset-0 z-10" onClick={() => setIsCreateMenuOpen(false)} />
              <div className="cdk-panel absolute right-0 top-full z-20 mt-2 w-52 rounded-xl py-1.5">
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
    </header>
  );
}

// Re-export types for convenience
export type { ConnectionStatus, Network };
