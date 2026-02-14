import Link from 'next/link';

export default function VestingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Vesting</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Manage CLTV lockbox vesting campaigns
          </p>
        </div>
        <Link
          href="/vesting/new"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Vesting
        </Link>
      </div>

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
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            No vesting campaigns
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Get started by creating your first vesting campaign with CLTV lockboxes.
          </p>
          <Link
            href="/vesting/new"
            className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500"
          >
            Create vesting campaign
          </Link>
        </div>
      </div>
    </div>
  );
}
