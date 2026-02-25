/**
 * Token Store
 *
 * Zustand store for token metadata lookup and selection.
 * Handles token ID input, metadata fetching, and manual decimals input.
 */
import { create } from 'zustand';

import type { Network, TokenRef } from '@/core/db/types';
import { type TokenLookupResult, getTokenService } from '@/core/token';

export interface TokenState {
  // Current token lookup state
  tokenId: string;
  lookupResult: TokenLookupResult | null;
  isLookingUp: boolean;
  error: string | null;

  // Manual decimals input (when metadata not found)
  manualDecimals: number | null;
  showManualDecimalsInput: boolean;

  // Selected/confirmed token
  selectedToken: TokenRef | null;

  // Network
  network: Network;

  // Actions
  setNetwork: (network: Network) => void;
  setTokenId: (tokenId: string) => void;
  lookupToken: (tokenId: string) => Promise<TokenLookupResult | null>;
  setManualDecimals: (decimals: number) => void;
  confirmManualDecimals: () => Promise<void>;
  confirmToken: () => void;
  clearToken: () => void;
  resetState: () => void;
}

const initialState = {
  tokenId: '',
  lookupResult: null,
  isLookingUp: false,
  error: null,
  manualDecimals: null,
  showManualDecimalsInput: false,
  selectedToken: null,
  network: 'testnet' as Network,
};

export const useTokenStore = create<TokenState>((set, get) => ({
  ...initialState,

  setNetwork: (network: Network) => {
    set({ network });
    // Update the token service network
    getTokenService(network);
  },

  setTokenId: (tokenId: string) => {
    set({ tokenId, error: null });
  },

  lookupToken: async (tokenId: string) => {
    if (!tokenId.trim()) {
      set({ error: 'Please enter a token ID', lookupResult: null });
      return null;
    }

    set({ isLookingUp: true, error: null, lookupResult: null, showManualDecimalsInput: false });

    try {
      const { network } = get();
      const service = getTokenService(network);
      const result = await service.lookupToken(tokenId);

      set({
        lookupResult: result,
        isLookingUp: false,
        tokenId: result.token.tokenId,
        showManualDecimalsInput: result.requiresManualDecimals,
        error: result.success ? null : (result.error ?? 'Lookup failed'),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      set({
        isLookingUp: false,
        error: errorMessage,
        lookupResult: null,
      });
      return null;
    }
  },

  setManualDecimals: (decimals: number) => {
    set({ manualDecimals: decimals });
  },

  confirmManualDecimals: async () => {
    const { tokenId, manualDecimals, lookupResult, network } = get();

    if (manualDecimals === null || manualDecimals < 0 || manualDecimals > 18) {
      set({ error: 'Decimals must be between 0 and 18' });
      return;
    }

    set({ isLookingUp: true });

    try {
      const service = getTokenService(network);
      const result = await service.setManualMetadata(tokenId, {
        symbol: lookupResult?.token.symbol,
        name: lookupResult?.token.name,
        decimals: manualDecimals,
        iconUrl: lookupResult?.token.iconUrl,
      });

      set({
        lookupResult: result,
        showManualDecimalsInput: false,
        isLookingUp: false,
        error: result.success ? null : result.error,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save metadata';
      set({
        isLookingUp: false,
        error: errorMessage,
      });
    }
  },

  confirmToken: () => {
    const { lookupResult } = get();
    if (lookupResult?.success && !lookupResult.requiresManualDecimals) {
      set({ selectedToken: lookupResult.token });
    }
  },

  clearToken: () => {
    set({
      tokenId: '',
      lookupResult: null,
      manualDecimals: null,
      showManualDecimalsInput: false,
      selectedToken: null,
      error: null,
    });
  },

  resetState: () => {
    set(initialState);
  },
}));
