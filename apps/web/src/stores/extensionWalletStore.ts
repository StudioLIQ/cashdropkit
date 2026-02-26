import { create } from 'zustand';

interface ExtensionWalletState {
  connectedAddress: string | null;
  setConnectedAddress: (address: string) => void;
  clearConnectedAddress: () => void;
}

export const useExtensionWalletStore = create<ExtensionWalletState>((set) => ({
  connectedAddress: null,
  setConnectedAddress: (address) => set({ connectedAddress: address }),
  clearConnectedAddress: () => set({ connectedAddress: null }),
}));
