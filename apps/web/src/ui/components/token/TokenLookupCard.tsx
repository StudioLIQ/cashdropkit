'use client';

import { useCallback, useState } from 'react';

import type { Network, TokenRef } from '@/core/db/types';
import { type TokenLookupResult, getTokenService, isValidTokenCategory } from '@/core/token';

interface TokenLookupCardProps {
  network: Network;
  onTokenSelected?: (token: TokenRef) => void;
  initialTokenId?: string;
}

function truncateTokenId(tokenId: string): string {
  if (tokenId.length <= 16) return tokenId;
  return `${tokenId.slice(0, 10)}...${tokenId.slice(-10)}`;
}

export function TokenLookupCard({
  network,
  onTokenSelected,
  initialTokenId,
}: TokenLookupCardProps) {
  const [tokenId, setTokenId] = useState(initialTokenId ?? '');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<TokenLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual decimals state
  const [manualDecimals, setManualDecimals] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState(false);

  const handleLookup = useCallback(async () => {
    const trimmed = tokenId.trim();
    if (!trimmed) {
      setError('Please enter a token ID');
      return;
    }

    if (!isValidTokenCategory(trimmed)) {
      setError('Invalid token ID format. Expected 64 hexadecimal characters.');
      return;
    }

    setIsLookingUp(true);
    setError(null);
    setLookupResult(null);
    setShowManualInput(false);

    try {
      const service = getTokenService(network);
      const result = await service.lookupToken(trimmed);

      setLookupResult(result);
      setTokenId(result.token.tokenId);

      if (!result.success) {
        setError(result.error ?? 'Lookup failed');
      } else if (result.requiresManualDecimals) {
        setShowManualInput(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLookingUp(false);
    }
  }, [tokenId, network]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !isLookingUp) {
        handleLookup();
      }
    },
    [handleLookup, isLookingUp]
  );

  const handleConfirmManualDecimals = useCallback(async () => {
    const decimals = parseInt(manualDecimals, 10);
    if (isNaN(decimals) || decimals < 0 || decimals > 18) {
      setError('Decimals must be a number between 0 and 18');
      return;
    }

    setIsLookingUp(true);
    setError(null);

    try {
      const service = getTokenService(network);
      const result = await service.setManualMetadata(lookupResult?.token.tokenId ?? tokenId, {
        symbol: lookupResult?.token.symbol,
        name: lookupResult?.token.name,
        decimals,
        iconUrl: lookupResult?.token.iconUrl,
      });

      setLookupResult(result);
      setShowManualInput(false);

      if (!result.success) {
        setError(result.error ?? 'Failed to save metadata');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsLookingUp(false);
    }
  }, [manualDecimals, lookupResult, tokenId, network]);

  const handleSelectToken = useCallback(() => {
    if (lookupResult?.success && !lookupResult.requiresManualDecimals && onTokenSelected) {
      onTokenSelected(lookupResult.token);
    }
  }, [lookupResult, onTokenSelected]);

  const handleClear = useCallback(() => {
    setTokenId('');
    setLookupResult(null);
    setError(null);
    setManualDecimals('');
    setShowManualInput(false);
  }, []);

  const canSelect =
    lookupResult?.success &&
    !lookupResult.requiresManualDecimals &&
    lookupResult.token.decimals !== undefined;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Token Lookup</h3>

      {/* Token ID Input */}
      <div className="space-y-3">
        <div>
          <label htmlFor="tokenId" className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            Token ID (Category)
          </label>
          <div className="flex gap-2">
            <input
              id="tokenId"
              type="text"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="64-character hex (e.g., abc123...)"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
              disabled={isLookingUp}
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={isLookingUp || !tokenId.trim()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLookingUp ? (
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                'Lookup'
              )}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Lookup Result */}
        {lookupResult && lookupResult.success && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 dark:bg-zinc-900 dark:border-zinc-800">
            <div className="flex items-start gap-3">
              {/* Icon */}
              {lookupResult.token.iconUrl ? (
                <img
                  src={lookupResult.token.iconUrl}
                  alt={lookupResult.token.symbol ?? 'Token'}
                  className="h-10 w-10 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                  <span className="text-lg font-bold text-zinc-500 dark:text-zinc-400">
                    {lookupResult.token.symbol?.[0] ?? '?'}
                  </span>
                </div>
              )}

              {/* Token Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {lookupResult.token.symbol ?? 'Unknown Token'}
                  </span>
                  {lookupResult.token.verified && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                      Verified
                    </span>
                  )}
                  {lookupResult.fromCache && (
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      Cached
                    </span>
                  )}
                </div>

                {lookupResult.token.name && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {lookupResult.token.name}
                  </p>
                )}

                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500 font-mono">
                  {truncateTokenId(lookupResult.token.tokenId)}
                </p>

                <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    Decimals:{' '}
                    {lookupResult.token.decimals !== undefined ? (
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {lookupResult.token.decimals}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-500">Not found</span>
                    )}
                  </span>
                  <span>Source: {lookupResult.source}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual Decimals Input */}
        {showManualInput && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950/50 dark:border-amber-900">
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">
              Token metadata not found. Please enter the number of decimal places manually.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                max="18"
                value={manualDecimals}
                onChange={(e) => setManualDecimals(e.target.value)}
                placeholder="e.g., 8"
                className="w-24 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button
                type="button"
                onClick={handleConfirmManualDecimals}
                disabled={isLookingUp || !manualDecimals}
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Tip: Check the token&apos;s official documentation for decimal places. Common values:
              0 (NFTs), 8 (most tokens), 6 (stablecoins).
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {lookupResult && (
          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Clear
            </button>

            {canSelect && onTokenSelected && (
              <button
                type="button"
                onClick={handleSelectToken}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Select Token
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
