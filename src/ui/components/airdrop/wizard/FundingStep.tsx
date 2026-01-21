'use client';

import { useAirdropStore, useWalletStore } from '@/stores';

export function FundingStep() {
  const { activeCampaign, updateCampaignFunding } = useAirdropStore();
  const { wallets, activeWalletId } = useWalletStore();

  if (!activeCampaign) return null;

  const currentWallet = wallets.find((w) => w.id === activeCampaign.funding.sourceWalletId);

  const handleWalletSelect = async (walletId: string) => {
    await updateCampaignFunding({
      ...activeCampaign.funding,
      sourceWalletId: walletId,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Funding & Settings
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Select the source wallet and configure fee/dust settings.
        </p>
      </div>

      {/* Wallet selection */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Source Wallet
        </label>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Select the wallet that holds the tokens to distribute.
        </p>
        <div className="mt-2 space-y-2">
          {wallets
            .filter((w) => w.network === activeCampaign.network)
            .map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                onClick={() => handleWalletSelect(wallet.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  wallet.id === activeCampaign.funding.sourceWalletId
                    ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/50'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {wallet.name}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {wallet.addresses?.[0]?.slice(0, 20)}...
                    </div>
                  </div>
                  {wallet.id === activeCampaign.funding.sourceWalletId && (
                    <svg
                      className="h-5 w-5 text-emerald-600 dark:text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  )}
                </div>
              </button>
            ))}

          {wallets.filter((w) => w.network === activeCampaign.network).length === 0 && (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-950/50">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No wallets found for {activeCampaign.network}. Please create a wallet first.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fee settings (read-only for now) */}
      <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Fee Settings</h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Advanced settings will be editable in future tickets.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400">
              Fee Rate (sat/byte)
            </label>
            <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              {activeCampaign.settings.feeRateSatPerByte}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400">
              Dust per Output (sats)
            </label>
            <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              {activeCampaign.settings.dustSatPerOutput}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400">
              Max Outputs per Tx
            </label>
            <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              {activeCampaign.settings.maxOutputsPerTx}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 dark:text-zinc-400">
              Max Inputs per Tx
            </label>
            <div className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              {activeCampaign.settings.maxInputsPerTx}
            </div>
          </div>
        </div>
      </div>

      {/* UTXO selection placeholder */}
      <div className="rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-800/50">
        <svg
          className="mx-auto h-10 w-10 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <h3 className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          UTXO Selection
        </h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          UTXO selection (auto/manual) will be implemented in T-0403.
        </p>
      </div>
    </div>
  );
}
