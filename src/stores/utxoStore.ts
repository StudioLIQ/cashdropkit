/**
 * UTXO Store
 *
 * Zustand store for UTXO selection state management.
 * Handles fetching UTXOs, auto/manual selection, and validation.
 */
import { create } from 'zustand';

import { getConnectionService } from '@/core/adapters/chain/connectionService';
import type { Outpoint, TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import { outpointId } from '@/core/adapters/chain/types';
import {
  type DistributionRequirements,
  type SelectedUtxos,
  type UtxoSelectionMode,
  type UtxoSummary,
  type UtxoValidationResult,
  autoSelectUtxos,
  summarizeUtxos,
  utxosToOutpoints,
  validateManualSelection,
} from '@/core/utxo';

export interface UtxoState {
  // Fetch state
  isFetching: boolean;
  fetchError: string | null;
  lastFetchedAt: number | null;

  // Available UTXOs
  summary: UtxoSummary | null;

  // Selection state
  selectionMode: UtxoSelectionMode;
  selectedTokenOutpoints: Outpoint[];
  selectedBchOutpoints: Outpoint[];

  // Validation state
  validation: UtxoValidationResult | null;

  // Actions
  fetchUtxos: (address: string, tokenCategory: string) => Promise<void>;
  setSelectionMode: (mode: UtxoSelectionMode) => void;
  autoSelect: (requirements: DistributionRequirements) => void;
  toggleTokenUtxo: (outpoint: Outpoint) => void;
  toggleBchUtxo: (outpoint: Outpoint) => void;
  selectAllTokenUtxos: () => void;
  selectAllBchUtxos: () => void;
  clearTokenSelection: () => void;
  clearBchSelection: () => void;
  validateSelection: (requirements: DistributionRequirements) => void;
  reset: () => void;

  // Derived getters
  getSelectedTokenUtxos: () => TokenUtxo[];
  getSelectedBchUtxos: () => Utxo[];
  getSelectedUtxos: () => SelectedUtxos | null;
}

const initialState = {
  isFetching: false,
  fetchError: null,
  lastFetchedAt: null,
  summary: null,
  selectionMode: 'auto' as UtxoSelectionMode,
  selectedTokenOutpoints: [] as Outpoint[],
  selectedBchOutpoints: [] as Outpoint[],
  validation: null,
};

export const useUtxoStore = create<UtxoState>((set, get) => ({
  ...initialState,

  fetchUtxos: async (address: string, tokenCategory: string) => {
    set({ isFetching: true, fetchError: null });

    try {
      const adapter = getConnectionService().getAdapter();
      if (!adapter) {
        throw new Error('No chain adapter available. Check connection status.');
      }

      // Fetch all UTXOs for the address
      const allUtxos = await adapter.getUtxos(address);

      // Separate token UTXOs (matching category) from BCH-only UTXOs
      const tokenUtxos: TokenUtxo[] = [];
      const bchUtxos: Utxo[] = [];

      for (const utxo of allUtxos) {
        if ('token' in utxo && utxo.token) {
          tokenUtxos.push(utxo as TokenUtxo);
        } else {
          bchUtxos.push(utxo);
        }
      }

      // Create summary
      const summary = summarizeUtxos(address, tokenUtxos, bchUtxos, tokenCategory);

      set({
        summary,
        isFetching: false,
        lastFetchedAt: Date.now(),
        // Reset selection when new UTXOs are fetched
        selectedTokenOutpoints: [],
        selectedBchOutpoints: [],
        validation: null,
      });
    } catch (err) {
      set({
        fetchError: err instanceof Error ? err.message : 'Failed to fetch UTXOs',
        isFetching: false,
      });
    }
  },

  setSelectionMode: (mode: UtxoSelectionMode) => {
    set({ selectionMode: mode });
  },

  autoSelect: (requirements: DistributionRequirements) => {
    const { summary } = get();
    if (!summary) return;

    const result = autoSelectUtxos({
      tokenUtxos: summary.tokenUtxos,
      bchUtxos: summary.bchUtxos,
      requirements,
    });

    if (result.success && result.selection) {
      set({
        selectedTokenOutpoints: utxosToOutpoints(result.selection.tokenUtxos),
        selectedBchOutpoints: utxosToOutpoints(result.selection.bchUtxos),
        validation: result.validation,
        selectionMode: 'auto',
      });
    } else {
      set({
        validation: result.validation,
      });
    }
  },

  toggleTokenUtxo: (outpoint: Outpoint) => {
    const { selectedTokenOutpoints } = get();
    const id = outpointId(outpoint);
    const exists = selectedTokenOutpoints.some((o) => outpointId(o) === id);

    if (exists) {
      set({
        selectedTokenOutpoints: selectedTokenOutpoints.filter((o) => outpointId(o) !== id),
        selectionMode: 'manual',
      });
    } else {
      set({
        selectedTokenOutpoints: [...selectedTokenOutpoints, outpoint],
        selectionMode: 'manual',
      });
    }
  },

  toggleBchUtxo: (outpoint: Outpoint) => {
    const { selectedBchOutpoints } = get();
    const id = outpointId(outpoint);
    const exists = selectedBchOutpoints.some((o) => outpointId(o) === id);

    if (exists) {
      set({
        selectedBchOutpoints: selectedBchOutpoints.filter((o) => outpointId(o) !== id),
        selectionMode: 'manual',
      });
    } else {
      set({
        selectedBchOutpoints: [...selectedBchOutpoints, outpoint],
        selectionMode: 'manual',
      });
    }
  },

  selectAllTokenUtxos: () => {
    const { summary } = get();
    if (!summary) return;

    set({
      selectedTokenOutpoints: utxosToOutpoints(summary.tokenUtxos),
      selectionMode: 'manual',
    });
  },

  selectAllBchUtxos: () => {
    const { summary } = get();
    if (!summary) return;

    set({
      selectedBchOutpoints: utxosToOutpoints(summary.bchUtxos),
      selectionMode: 'manual',
    });
  },

  clearTokenSelection: () => {
    set({
      selectedTokenOutpoints: [],
      selectionMode: 'manual',
    });
  },

  clearBchSelection: () => {
    set({
      selectedBchOutpoints: [],
      selectionMode: 'manual',
    });
  },

  validateSelection: (requirements: DistributionRequirements) => {
    const { summary, selectedTokenOutpoints, selectedBchOutpoints } = get();
    if (!summary) return;

    const validation = validateManualSelection({
      selectedTokenOutpoints,
      selectedBchOutpoints,
      allTokenUtxos: summary.tokenUtxos,
      allBchUtxos: summary.bchUtxos,
      requirements,
    });

    set({ validation });
  },

  reset: () => {
    set(initialState);
  },

  // Derived getters
  getSelectedTokenUtxos: () => {
    const { summary, selectedTokenOutpoints } = get();
    if (!summary) return [];

    const selectedIds = new Set(selectedTokenOutpoints.map((o) => outpointId(o)));
    return summary.tokenUtxos.filter((u) =>
      selectedIds.has(outpointId({ txid: u.txid, vout: u.vout }))
    );
  },

  getSelectedBchUtxos: () => {
    const { summary, selectedBchOutpoints } = get();
    if (!summary) return [];

    const selectedIds = new Set(selectedBchOutpoints.map((o) => outpointId(o)));
    return summary.bchUtxos.filter((u) =>
      selectedIds.has(outpointId({ txid: u.txid, vout: u.vout }))
    );
  },

  getSelectedUtxos: () => {
    const tokenUtxos = get().getSelectedTokenUtxos();
    const bchUtxos = get().getSelectedBchUtxos();

    if (tokenUtxos.length === 0 && bchUtxos.length === 0) {
      return null;
    }

    const totalTokenAmount = tokenUtxos.reduce((sum, u) => sum + u.token.amount, 0n);
    const totalBchFromTokens = tokenUtxos.reduce((sum, u) => sum + u.satoshis, 0n);
    const totalPureBch = bchUtxos.reduce((sum, u) => sum + u.satoshis, 0n);

    return {
      tokenUtxos,
      bchUtxos,
      totalTokenAmount,
      totalBchSatoshis: totalBchFromTokens + totalPureBch,
    };
  },
}));
