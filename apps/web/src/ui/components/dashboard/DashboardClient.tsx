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
      <div className="cdk-panel flex items-center justify-center rounded-2xl py-20">
        <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="cdk-panel rounded-2xl px-5 py-5 md:px-7 md:py-6">
        <div className="mb-2 inline-flex items-center rounded-full border border-cyan-300/60 bg-cyan-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:border-cyan-400/35 dark:bg-cyan-900/20 dark:text-cyan-300">
          Command Center
        </div>
        <h1 className="cdk-brand-title cdk-value text-3xl font-bold text-zinc-900 dark:text-zinc-100 md:text-4xl">
          CashDrop <span className="cdk-accent">Operations</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Real-time overview for campaign throughput, unlock progress, and operational health.
        </p>
      </div>

      {/* Active Wallet Summary */}
      {stats.activeWallet && (
        <div className="cdk-panel rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-md shadow-emerald-500/25">
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
                <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {stats.activeWallet.name}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {stats.activeWallet.network} &middot; {stats.activeWallet.type}
                </div>
              </div>
            </div>
            <Link
              href="/wallets"
              className="rounded-full border border-emerald-300/65 bg-emerald-100/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700 hover:bg-emerald-200/80 dark:border-emerald-500/35 dark:bg-emerald-950/25 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            >
              Manage
            </Link>
          </div>
        </div>
      )}

      {!stats.activeWallet && (
        <div className="rounded-2xl border border-amber-300/60 bg-gradient-to-r from-amber-100/95 to-orange-100/75 p-4 shadow-sm dark:border-amber-500/35 dark:from-amber-900/30 dark:to-orange-900/15">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              No wallet configured. Create or import one to get started.
            </p>
            <Link
              href="/wallets"
              className="rounded-full bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700"
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
      <div className="cdk-panel rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="cdk-brand-title text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Activity
          </h2>
          {stats.recentLogs.length > 0 && (
            <span className="rounded-full border border-zinc-300/65 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              {stats.recentLogs.length} entries
            </span>
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
          className="cdk-panel group flex items-center gap-3 rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-400 text-white shadow-md shadow-emerald-500/25">
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
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
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
          className="cdk-panel group flex items-center gap-3 rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-md shadow-cyan-500/25">
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
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
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
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    blue: 'text-blue-700 dark:text-blue-300',
    purple: 'text-cyan-700 dark:text-cyan-300',
    red: 'text-red-700 dark:text-red-300',
  };

  const topAccent = {
    emerald: 'from-emerald-500 to-emerald-300',
    amber: 'from-amber-500 to-orange-300',
    blue: 'from-blue-500 to-cyan-300',
    purple: 'from-cyan-500 to-blue-300',
    red: 'from-red-500 to-rose-300',
  };

  return (
    <div className="cdk-panel relative overflow-hidden rounded-2xl p-6">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${topAccent[color]}`} />
      <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="cdk-value mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
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
    <div className="flex items-start gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-900/60">
      <span
        className={`mt-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${levelBadges[entry.level]} ${levelColors[entry.level]}`}
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
