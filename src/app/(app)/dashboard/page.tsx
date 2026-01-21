export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Overview of your airdrop and vesting campaigns
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Active Campaigns
          </div>
          <div className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">0</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Pending Distributions
          </div>
          <div className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">0</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Completed Airdrops
          </div>
          <div className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">0</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Active Lockboxes
          </div>
          <div className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-100">0</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Recent Activity</h2>
        <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No recent activity. Create your first campaign to get started.
        </div>
      </div>
    </div>
  );
}
