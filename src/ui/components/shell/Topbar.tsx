'use client';

import { useState } from 'react';

import Link from 'next/link';

export type ConnectionStatus = 'connected' | 'degraded' | 'offline';
export type Network = 'mainnet' | 'testnet';

interface TopbarProps {
  network?: Network;
  connectionStatus?: ConnectionStatus;
  walletLabel?: string;
  onNetworkChange?: (network: Network) => void;
}

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const colors: Record<ConnectionStatus, string> = {
    connected: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    offline: 'bg-red-500',
  };

  const labels: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    degraded: 'Degraded',
    offline: 'Offline',
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="text-zinc-600 dark:text-zinc-400">{labels[status]}</span>
    </div>
  );
}

function NetworkSelector({
  network,
  onChange,
}: {
  network: Network;
  onChange: (n: Network) => void;
}) {
  return (
    <select
      value={network}
      onChange={(e) => onChange(e.target.value as Network)}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
    >
      <option value="testnet">Testnet (Chipnet)</option>
      <option value="mainnet">Mainnet</option>
    </select>
  );
}

export function Topbar({
  network = 'testnet',
  connectionStatus = 'connected',
  walletLabel,
  onNetworkChange,
}: TopbarProps) {
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);

  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-4">
        <NetworkSelector network={network} onChange={onNetworkChange || (() => {})} />
        <ConnectionIndicator status={connectionStatus} />
      </div>

      <div className="flex items-center gap-4">
        {walletLabel && (
          <Link
            href="/wallets"
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
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
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
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
              <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <Link
                  href="/airdrops/new"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                  className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
