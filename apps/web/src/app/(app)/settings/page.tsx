'use client';

import { useCallback, useState } from 'react';

import { downloadAsFile, generateSampleCsv, getDemoPresetSummary } from '@/core/util/demoPreset';

export default function SettingsPage() {
  const [csvGenerated, setCsvGenerated] = useState(false);

  const handleDownloadSampleCsv = useCallback(() => {
    const csv = generateSampleCsv();
    downloadAsFile(csv, 'sample_airdrop_recipients.csv', 'text/csv');
    setCsvGenerated(true);
    setTimeout(() => setCsvGenerated(false), 3000);
  }, []);

  const demoSummary = getDemoPresetSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Configure application preferences and security options
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Security</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Auto-lock timeout
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Lock the app after period of inactivity
                </div>
              </div>
              <select className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="0">Never</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Require password for signing
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Always confirm with password before signing transactions
                </div>
              </div>
              <button
                type="button"
                className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-emerald-600 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                role="switch"
                aria-checked="true"
              >
                <span className="translate-x-5 inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out" />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Default Campaign Settings
          </h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Max outputs per transaction
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Default batch size for airdrops
                </div>
              </div>
              <input
                type="number"
                defaultValue={80}
                className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Default fee rate (sat/byte)
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Transaction fee rate for campaigns
                </div>
              </div>
              <input
                type="number"
                defaultValue={1}
                className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Dust amount per output (sats)
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Minimum satoshis attached to token outputs
                </div>
              </div>
              <input
                type="number"
                defaultValue={546}
                className="w-24 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Network</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Default network
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Network to use when creating new campaigns
                </div>
              </div>
              <select className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                <option value="testnet">Testnet (Chipnet)</option>
                <option value="mainnet">Mainnet</option>
              </select>
            </div>
          </div>
        </div>

        {/* Demo Preset Section */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-800 dark:bg-emerald-950">
          <h2 className="text-lg font-medium text-emerald-900 dark:text-emerald-100">
            Demo Preset
          </h2>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
            Download sample data and use demo settings for a quick demonstration.
          </p>

          <div className="mt-4 space-y-2">
            {demoSummary.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between text-sm">
                <span className="text-emerald-700 dark:text-emerald-400">{item.key}</span>
                <span className="font-mono text-emerald-900 dark:text-emerald-200">
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              {csvGenerated ? 'Downloaded!' : 'Download Sample CSV'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Data Management</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Export all data
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Download encrypted backup of all campaigns and settings
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Export
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-red-600 dark:text-red-400">
                  Clear all data
                </div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">
                  Permanently delete all local data including wallets
                </div>
              </div>
              <button
                type="button"
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
