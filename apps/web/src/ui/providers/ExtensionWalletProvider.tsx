'use client';

import { BCHConnectProvider, bchConnectModal } from 'bch-connect';
import type { Configuration, CreatedConfig, ModalFactory } from 'bch-connect';

const FALLBACK_WALLETCONNECT_PROJECT_ID = '00000000000000000000000000000000';
const PAYTACA_ONLY_WALLETS = [
  {
    id: 'paytaca',
    name: 'Paytaca',
    iconUrl: 'https://www.paytaca.com/favicon.png',
    links: {
      native: 'paytaca://apps/wallet-connect?uri={{uri}}',
      fallback: 'https://www.paytaca.com/applications/wallet',
    },
  },
] as const;

function getProjectId(): string {
  // Hardcoded fallback for hackathon/demo builds.
  return (
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || FALLBACK_WALLETCONNECT_PROJECT_ID
  );
}

const baseConfig: Configuration = {
  projectId: getProjectId(),
  network: 'testnet',
  metadata: {
    name: 'CashDrop Kit',
    description: 'CashTokens airdrop and vesting operations console',
    url: 'https://www.cashdropkit.com',
    icons: ['https://www.cashdropkit.com/favicon.svg'],
  },
  sessionType: 'Wallet Connect V2',
  supportLegacyClient: false,
  debug: false,
};

// Avoid createConfig(): it eagerly creates modal and touches `document` during SSR prerender.
const modalFactory: ModalFactory = ({ sessionType }) =>
  bchConnectModal({
    sessionType,
    wallets: [...PAYTACA_ONLY_WALLETS],
  });
const config = { ...baseConfig, modal: modalFactory } as CreatedConfig;

export function ExtensionWalletProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <BCHConnectProvider config={config}>{children}</BCHConnectProvider>;
}
