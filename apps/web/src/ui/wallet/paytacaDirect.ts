'use client';

import type { Network } from '@/core/db/types';
import { decodeCashAddr, encodeCashAddr, normalizeCashAddr } from '@/core/wallet/cashaddr';

interface PaytacaConnectResult {
  connected?: boolean;
  address?: string;
}

interface PaytacaProvider {
  connect?: () => Promise<PaytacaConnectResult | string | undefined>;
  enable?: () => Promise<PaytacaConnectResult | string | string[] | undefined>;
  getAddress?: () => Promise<string | undefined>;
  getAddresses?: () => Promise<string[] | undefined>;
  request?: (args: { method: string; params?: unknown }) => Promise<unknown>;
  address?: string;
  selectedAddress?: string;
  signTransaction?: (request: unknown) => Promise<
    | {
        signedTransaction: string;
        signedTransactionHash: string;
      }
    | undefined
  >;
}

declare global {
  interface Window {
    paytaca?: PaytacaProvider;
    Paytaca?: PaytacaProvider;
  }
}

function normalizeToNetwork(address: string, network: Network): string {
  const normalized = normalizeCashAddr(address);
  const decoded = decodeCashAddr(normalized);
  if (decoded.network === network) {
    return normalized;
  }
  return encodeCashAddr(network, decoded.type, decoded.hash);
}

export function getPaytacaProvider(): PaytacaProvider | null {
  if (typeof window === 'undefined') return null;
  const isProvider = (provider: PaytacaProvider | null | undefined): provider is PaytacaProvider =>
    Boolean(
      provider &&
        (provider.connect ||
          provider.enable ||
          provider.request ||
          provider.getAddress ||
          provider.getAddresses)
    );

  const namedCandidates: PaytacaProvider[] = [
    window.paytaca as PaytacaProvider,
    window.Paytaca as PaytacaProvider,
    (window as { bitcoincash?: PaytacaProvider }).bitcoincash as PaytacaProvider,
    (window as { bch?: PaytacaProvider }).bch as PaytacaProvider,
    (window as { bitcoin?: PaytacaProvider }).bitcoin as PaytacaProvider,
    (window as { bitcoinCash?: PaytacaProvider }).bitcoinCash as PaytacaProvider,
    (window as { paytacaWallet?: PaytacaProvider }).paytacaWallet as PaytacaProvider,
    (window as { paytacaProvider?: PaytacaProvider }).paytacaProvider as PaytacaProvider,
    (window as { paytaca?: { provider?: PaytacaProvider } }).paytaca?.provider as PaytacaProvider,
  ].filter(Boolean);

  for (const provider of namedCandidates) {
    if (isProvider(provider)) {
      return provider;
    }
  }

  // Last-resort scan for injected providers with compatible methods.
  const dynamicCandidate = Object.values(window).find((value) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as PaytacaProvider;
    return isProvider(candidate);
  }) as PaytacaProvider | undefined;

  return dynamicCandidate ?? null;
}

export async function waitForPaytacaProvider(timeoutMs = 2500): Promise<PaytacaProvider | null> {
  const start = Date.now();
  let provider = getPaytacaProvider();
  while (!provider && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    provider = getPaytacaProvider();
  }
  return provider;
}

export async function connectPaytacaDirect(network: Network = 'testnet'): Promise<string | null> {
  const provider = await waitForPaytacaProvider();
  if (!provider) return null;

  let response: PaytacaConnectResult | string | string[] | undefined;
  if (provider.connect) {
    response = await provider.connect();
  } else if (provider.enable) {
    response = await provider.enable();
  } else if (provider.request) {
    const requestMethods = [
      { method: 'bch_getAddresses', params: { token: true } },
      { method: 'bch_getAccounts' },
      { method: 'requestAccounts' },
    ];

    for (const args of requestMethods) {
      try {
        response = (await provider.request(args)) as PaytacaConnectResult | string | string[] | undefined;
        if (response) break;
      } catch {
        // Try next known account-read method.
      }
    }
  }

  let address: string | undefined;

  if (typeof response === 'string') {
    address = response;
  } else if (Array.isArray(response)) {
    address = response[0];
  } else if (response?.connected && response.address) {
    address = response.address;
  } else if (response?.address) {
    address = response.address;
  } else if (response && typeof response === 'object') {
    const objectResponse = response as { result?: string[]; addresses?: string[]; account?: string };
    address = objectResponse.addresses?.[0] ?? objectResponse.result?.[0] ?? objectResponse.account;
  }

  if (!address && provider.getAddress) {
    address = await provider.getAddress();
  }
  if (!address && provider.getAddresses) {
    address = (await provider.getAddresses())?.[0];
  }
  if (!address && typeof provider.address === 'string') {
    address = provider.address;
  }
  if (!address && typeof provider.selectedAddress === 'string') {
    address = provider.selectedAddress;
  }

  if (!address) {
    throw new Error('Paytaca did not return a wallet address. Approve the request in the extension and try again.');
  }

  return normalizeToNetwork(address, network);
}
