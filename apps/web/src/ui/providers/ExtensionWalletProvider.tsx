'use client';

import { BCHConnectProvider, bchConnectModal } from 'bch-connect';
import type { Configuration, CreatedConfig, ModalFactory } from 'bch-connect';

const PAYTACA_WALLETCONNECT_PROJECT_ID = 'b7c10b6ffc9f3911c913020d9fbb2d51';
const ZERO_PROJECT_ID = '00000000000000000000000000000000';
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
  const fromEnv = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (!fromEnv || fromEnv === ZERO_PROJECT_ID) {
    return PAYTACA_WALLETCONNECT_PROJECT_ID;
  }
  return fromEnv;
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
  // sign-client-v2-20 (npm alias for @walletconnect/sign-client@2.20.3) does not
  // resolve correctly under pnpm strict isolation, causing the provider to silently
  // fail to initialise.  Use the standard (latest) sign-client instead.
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
