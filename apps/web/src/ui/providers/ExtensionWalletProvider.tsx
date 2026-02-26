'use client';

import { BCHConnectProvider, createConfig } from 'bch-connect';

const FALLBACK_WALLETCONNECT_PROJECT_ID = '00000000000000000000000000000000';

function getProjectId(): string {
  const configured = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  if (configured) return configured;
  return FALLBACK_WALLETCONNECT_PROJECT_ID;
}

const config = createConfig({
  projectId: getProjectId(),
  network: 'testnet',
  metadata: {
    name: 'CashDrop Kit',
    description: 'CashTokens airdrop and vesting operations console',
    url: 'https://www.cashdropkit.com',
    icons: ['https://www.cashdropkit.com/favicon.svg'],
  },
  supportLegacyClient: true,
});

export function ExtensionWalletProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <BCHConnectProvider config={config}>{children}</BCHConnectProvider>;
}

export function hasWalletConnectProjectIdConfigured(): boolean {
  const configured = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  return Boolean(configured);
}
