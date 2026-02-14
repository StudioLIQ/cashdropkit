'use client';

import { useAirdropStore } from '@/stores';

import { TokenLookupCard } from '@/ui/components/token';

export function TokenStep() {
  const { activeCampaign, updateCampaignToken } = useAirdropStore();

  if (!activeCampaign) return null;

  const handleTokenSelect = async (token: {
    tokenId: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    iconUrl?: string;
    verified?: boolean;
  }) => {
    await updateCampaignToken({
      tokenId: token.tokenId,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      iconUrl: token.iconUrl,
      verified: token.verified,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Select Token</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Enter the token ID (category) to distribute. Metadata will be fetched automatically.
        </p>
      </div>

      <TokenLookupCard
        network={activeCampaign.network}
        initialTokenId={activeCampaign.token.tokenId}
        onTokenSelected={handleTokenSelect}
      />

      {/* Current token info */}
      {activeCampaign.token.tokenId && (
        <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-950/50">
          <h3 className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Token Selected
          </h3>
          <div className="mt-2 space-y-1 text-sm">
            {activeCampaign.token.symbol && (
              <p className="text-emerald-800 dark:text-emerald-200">
                <span className="font-medium">{activeCampaign.token.symbol}</span>
                {activeCampaign.token.name && (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {' '}
                    ({activeCampaign.token.name})
                  </span>
                )}
              </p>
            )}
            <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
              {activeCampaign.token.tokenId}
            </p>
            {activeCampaign.token.decimals !== undefined && (
              <p className="text-emerald-600 dark:text-emerald-400">
                Decimals: {activeCampaign.token.decimals}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
