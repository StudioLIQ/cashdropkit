/**
 * Wallet Store
 *
 * Zustand store for wallet state management.
 * Handles wallet list, active wallet selection, and UI state.
 */
import { create } from 'zustand';

import type { Network, Wallet } from '@/core/db/types';
import {
  createWallet,
  deleteWallet,
  getActiveWallet,
  getAllWallets,
  importWallet,
  renameWallet,
  setActiveWallet,
} from '@/core/wallet';

export interface WalletState {
  // Data
  wallets: Wallet[];
  activeWalletId: string | undefined;

  // Loading states
  isLoading: boolean;
  isCreating: boolean;
  isImporting: boolean;

  // Error state
  error: string | null;

  // UI state
  showCreateModal: boolean;
  showImportModal: boolean;

  // Actions
  loadWallets: () => Promise<void>;
  createNewWallet: (
    name: string,
    network: Network,
    passphrase: string,
    strength?: 128 | 256
  ) => Promise<{ wallet: Wallet; mnemonic: string }>;
  importExistingWallet: (
    name: string,
    mnemonic: string,
    network: Network,
    passphrase: string
  ) => Promise<Wallet>;
  selectWallet: (walletId: string | undefined) => Promise<void>;
  removeWallet: (walletId: string) => Promise<void>;
  updateWalletName: (walletId: string, name: string) => Promise<void>;
  clearError: () => void;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openImportModal: () => void;
  closeImportModal: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  // Initial state
  wallets: [],
  activeWalletId: undefined,
  isLoading: false,
  isCreating: false,
  isImporting: false,
  error: null,
  showCreateModal: false,
  showImportModal: false,

  // Load wallets from IndexedDB
  loadWallets: async () => {
    set({ isLoading: true, error: null });
    try {
      const [wallets, activeWallet] = await Promise.all([getAllWallets(), getActiveWallet()]);
      set({
        wallets,
        activeWalletId: activeWallet?.id,
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load wallets',
        isLoading: false,
      });
    }
  },

  // Create new wallet
  createNewWallet: async (name, network, passphrase, strength = 128) => {
    set({ isCreating: true, error: null });
    try {
      const result = await createWallet(name, network, passphrase, strength);

      // Update store
      const wallets = await getAllWallets();
      set({
        wallets,
        isCreating: false,
        showCreateModal: false,
      });

      // Auto-select if no active wallet
      if (!get().activeWalletId) {
        await get().selectWallet(result.wallet.id);
      }

      return result;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create wallet',
        isCreating: false,
      });
      throw err;
    }
  },

  // Import existing wallet
  importExistingWallet: async (name, mnemonic, network, passphrase) => {
    set({ isImporting: true, error: null });
    try {
      const wallet = await importWallet(name, mnemonic, network, passphrase);

      // Update store
      const wallets = await getAllWallets();
      set({
        wallets,
        isImporting: false,
        showImportModal: false,
      });

      // Auto-select if no active wallet
      if (!get().activeWalletId) {
        await get().selectWallet(wallet.id);
      }

      return wallet;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to import wallet',
        isImporting: false,
      });
      throw err;
    }
  },

  // Select active wallet
  selectWallet: async (walletId) => {
    try {
      await setActiveWallet(walletId);
      set({ activeWalletId: walletId });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to select wallet',
      });
    }
  },

  // Delete wallet
  removeWallet: async (walletId) => {
    try {
      await deleteWallet(walletId);

      // Update store
      const wallets = await getAllWallets();
      const activeWallet = await getActiveWallet();
      set({
        wallets,
        activeWalletId: activeWallet?.id,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete wallet',
      });
    }
  },

  // Update wallet name
  updateWalletName: async (walletId, name) => {
    try {
      await renameWallet(walletId, name);

      // Update store
      const wallets = await getAllWallets();
      set({ wallets });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to rename wallet',
      });
    }
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Modal controls
  openCreateModal: () => set({ showCreateModal: true, error: null }),
  closeCreateModal: () => set({ showCreateModal: false, error: null }),
  openImportModal: () => set({ showImportModal: true, error: null }),
  closeImportModal: () => set({ showImportModal: false, error: null }),
}));
