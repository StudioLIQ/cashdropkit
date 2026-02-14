'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

import { airdropRepo, logRepo, vestingRepo, walletRepo } from '@/core/db';
import type { AirdropCampaign, LogEntry, VestingCampaign, Wallet } from '@/core/db/types';

// ============================================================================
// Types
// ============================================================================

interface DashboardStats {
  activeWallet: Wallet | null;
  airdropCampaigns: AirdropCampaign[];
  vestingCampaigns: VestingCampaign[];
  recentLogs: LogEntry[];
  isLoading: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function DashboardClient() {
  const [stats, setStats] = useState<DashboardStats>({
    activeWallet: null,
    airdropCampaigns: [],
    vestingCampaigns: [],
    recentLogs: [],
    isLoading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [airdrops, vestings, logs, wallets] = await Promise.all([
          airdropRepo.getAll(),
          vestingRepo.getAll(),
          logRepo.getRecent(20),
          walletRepo.getAll(),
        ]);

        if (cancelled) return;

        const activeWallet = wallets.length > 0 ? wallets[0] : null;

        setStats({
          activeWallet,
          airdropCampaigns: airdrops,
          vestingCampaigns: vestings,
          recentLogs: logs,
          isLoading: false,
        });
      } catch {
        if (!cancelled) {
          setStats((prev) => ({ ...prev, isLoading: false }));
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  // Derived counts
  const runningAirdrops = stats.airdropCampaigns.filter(
    (c) => c.execution?.state === 'RUNNING'
  ).length;
  const completedAirdrops = stats.airdropCampaigns.filter(
    (c) => c.execution?.state === 'COMPLETED'
  ).length;
  const failedAirdrops = stats.airdropCampaigns.filter(
    (c) => c.execution?.state === 'FAILED'
  ).length;
  const pendingAirdrops = stats.airdropCampaigns.filter(
    (c) => !c.execution || c.execution.state === 'READY' || c.execution.state === 'PAUSED'
  ).length;

  const runningVestings = stats.vestingCampaigns.filter(
    (c) => c.execution?.state === 'RUNNING'
  ).length;
  const completedVestings = stats.vestingCampaigns.filter(
    (c) => c.execution?.state === 'COMPLETED'
  ).length;

  const totalLockboxes = stats.vestingCampaigns.reduce((sum, c) => {
    return (
      sum +
      c.beneficiaries.reduce((bSum, b) => {
        return (
          bSum +
          b.tranches.filter(
            (t) => t.lockbox.status === 'CREATED' || t.lockbox.status === 'CONFIRMED'
          ).length
        );
      }, 0)
    );
  }, 0);

  if (stats.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Overview of your airdrop and vesting campaigns
        </p>
      </div>

      {/* Active Wallet Summary */}
      {stats.activeWallet && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {stats.activeWallet.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {stats.activeWallet.network} &middot; {stats.activeWallet.type}
                </div>
              </div>
            </div>
            <Link
              href="/wallets"
              className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Manage
            </Link>
          </div>
        </div>
      )}

      {!stats.activeWallet && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
          <div className="flex items-center justify-between">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No wallet configured. Create or import one to get started.
            </p>
            <Link
              href="/wallets"
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              Setup Wallet
            </Link>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Active Campaigns"
          value={stats.airdropCampaigns.length + stats.vestingCampaigns.length}
          detail={
            runningAirdrops + runningVestings > 0
              ? `${runningAirdrops + runningVestings} running`
              : undefined
          }
          color="emerald"
        />
        <SummaryCard
          label="Pending / Paused"
          value={pendingAirdrops}
          detail={failedAirdrops > 0 ? `${failedAirdrops} failed` : undefined}
          color={failedAirdrops > 0 ? 'red' : 'amber'}
        />
        <SummaryCard
          label="Completed Airdrops"
          value={completedAirdrops}
          detail={completedVestings > 0 ? `+ ${completedVestings} vesting` : undefined}
          color="blue"
        />
        <SummaryCard
          label="Active Lockboxes"
          value={totalLockboxes}
          detail={
            stats.vestingCampaigns.length > 0
              ? `${stats.vestingCampaigns.length} campaign${stats.vestingCampaigns.length > 1 ? 's' : ''}`
              : undefined
          }
          color="purple"
        />
      </div>

      {/* Recent Activity */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Recent Activity</h2>
          {stats.recentLogs.length > 0 && (
            <span className="text-xs text-zinc-400">{stats.recentLogs.length} entries</span>
          )}
        </div>

        {stats.recentLogs.length === 0 && (
          <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No recent activity. Create your first campaign to get started.
          </div>
        )}

        {stats.recentLogs.length > 0 && (
          <div className="mt-4 space-y-2">
            {stats.recentLogs.slice(0, 10).map((log) => (
              <LogEntryRow key={log.id ?? log.timestamp} entry={log} />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/airdrops"
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-emerald-800 dark:hover:bg-emerald-950"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Airdrop Campaigns
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {stats.airdropCampaigns.length} campaign
              {stats.airdropCampaigns.length !== 1 ? 's' : ''}
            </div>
          </div>
        </Link>

        <Link
          href="/vesting"
          className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-purple-300 hover:bg-purple-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-purple-800 dark:hover:bg-purple-950"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Vesting Campaigns
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {stats.vestingCampaigns.length} campaign
              {stats.vestingCampaigns.length !== 1 ? 's' : ''}
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function SummaryCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: number;
  detail?: string;
  color: 'emerald' | 'amber' | 'blue' | 'purple' | 'red';
}) {
  const colorStyles = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
    red: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      {detail && <div className={`mt-1 text-xs ${colorStyles[color]}`}>{detail}</div>}
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  const levelColors = {
    debug: 'text-zinc-400',
    info: 'text-blue-500 dark:text-blue-400',
    warn: 'text-amber-500 dark:text-amber-400',
    error: 'text-red-500 dark:text-red-400',
  };

  const levelBadges = {
    debug: 'bg-zinc-100 dark:bg-zinc-800',
    info: 'bg-blue-50 dark:bg-blue-950',
    warn: 'bg-amber-50 dark:bg-amber-950',
    error: 'bg-red-50 dark:bg-red-950',
  };

  const timeStr = new Date(entry.timestamp).toLocaleTimeString();

  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
      <span
        className={`mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium ${levelBadges[entry.level]} ${levelColors[entry.level]}`}
      >
        {entry.level.toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-zinc-700 dark:text-zinc-300">{entry.message}</span>
        {entry.category && <span className="ml-2 text-xs text-zinc-400">[{entry.category}]</span>}
      </div>
      <span className="shrink-0 text-xs text-zinc-400">{timeStr}</span>
    </div>
  );
}
