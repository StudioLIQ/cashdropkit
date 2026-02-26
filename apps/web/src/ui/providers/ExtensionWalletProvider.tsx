'use client';

import { BCHConnectProvider, bchConnectModal } from 'bch-connect';
import type { Configuration, CreatedConfig, ModalFactory } from 'bch-connect';

const PAYTACA_EXTENSION_ID = 'pakphhpnneopheifihmjcjnbdbhaaiaa';

const PAYTACA_ONLY_WALLETS = [
  {
    id: 'paytaca',
    name: 'Paytaca',
    iconUrl: 'https://www.paytaca.com/favicon.png',
    links: {
      native: 'paytaca://apps/wallet-connect?uri={{uri}}',
      fallback: `chrome-extension://${PAYTACA_EXTENSION_ID}/www/index.html#/apps/wallet-connect?uri={{uri}}`,
    },
  },
] as const;

function getProjectId(): string {
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!id) {
    console.error(
      '[CashDropKit] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. ' +
        'Wallet connect will fail. Create a free project at https://cloud.reown.com ' +
        'and add the ID to .env.local',
    );
    return 'missing-project-id';
  }
  return id;
}

const modalFactory: ModalFactory = ({ sessionType }) =>
  bchConnectModal({
    sessionType,
    wallets: [...PAYTACA_ONLY_WALLETS],
  });

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
  // sign-client-v2-20 (npm alias) fails to resolve under pnpm strict isolation.
  // The standard @walletconnect/sign-client works correctly.
  supportLegacyClient: false,
  debug: process.env.NODE_ENV === 'development',
};

// Avoid createConfig(): it eagerly creates modal internals and can touch `document` during SSR.
const config = { ...baseConfig, modal: modalFactory } as CreatedConfig;

export function ExtensionWalletProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <BCHConnectProvider config={config}>{children}</BCHConnectProvider>;
}
