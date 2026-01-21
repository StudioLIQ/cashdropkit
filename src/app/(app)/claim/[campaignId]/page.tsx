interface ClaimPageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { campaignId } = await params;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Claim Tokens</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Unlock your vested tokens from campaign {campaignId.slice(0, 8)}...
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Load Claim Bundle</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Upload or paste your claim bundle JSON to view and unlock your tranches.
        </p>

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
            <input id="bundle-upload" type="file" accept=".json" className="hidden" />
          </label>
        </div>

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

        <textarea
          className="mt-4 h-32 w-full rounded-lg border border-zinc-200 bg-white p-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          placeholder='{"campaignId": "...", "tranches": [...]}'
        />

        <button
          type="button"
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Load Bundle
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Your Tranches</h2>
        <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Load a claim bundle to see your available tranches.
        </div>
      </div>
    </div>
  );
}
