'use client';

import { BCHConnectProvider } from 'bch-connect';
import type { Configuration, CreatedConfig } from 'bch-connect';

import {
  PaytacaConnectModal,
  createPaytacaModalBridge,
} from '@/ui/wallet/PaytacaConnectModal';

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

// Custom modal that shows a prominent "Open in Paytaca Extension" button
// when the extension is detected, with a QR code fallback below.
const modal = createPaytacaModalBridge();

// Avoid createConfig(): it eagerly creates modal internals and can touch `document` during SSR.
const config = { ...baseConfig, modal } as CreatedConfig;

export function ExtensionWalletProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <BCHConnectProvider config={config}>
      {children}
      <PaytacaConnectModal />
    </BCHConnectProvider>
  );
}
