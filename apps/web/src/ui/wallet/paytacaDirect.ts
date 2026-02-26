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

const PAYTACA_EXTENSION_ID = 'pakphhpnneopheifihmjcjnbdbhaaiaa';

declare global {
  interface Window {
    paytaca?: PaytacaProvider;
    Paytaca?: PaytacaProvider;
  }
}

function isPaytacaProvider(
  provider: PaytacaProvider | null | undefined
): provider is PaytacaProvider {
  return Boolean(
    provider &&
      (provider.connect ||
        provider.enable ||
        provider.request ||
        provider.getAddress ||
        provider.getAddresses)
  );
}

function pickProvider(value: unknown): PaytacaProvider | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as PaytacaProvider;
  if (isPaytacaProvider(candidate)) return candidate;

  const nested = value as Record<string, unknown>;
  const nestedKeys = ['provider', 'paytaca', 'wallet', 'bch', 'bitcoincash', 'bitcoin'];
  for (const key of nestedKeys) {
    const nestedCandidate = nested[key] as PaytacaProvider | undefined;
    if (isPaytacaProvider(nestedCandidate)) {
      return nestedCandidate;
    }
  }

  return null;
}

function safeReadWindowProperty(name: string): unknown {
  try {
    return (window as unknown as Record<string, unknown>)[name];
  } catch {
    return undefined;
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
  const namedCandidates: unknown[] = [
    window.paytaca as PaytacaProvider,
    window.Paytaca as PaytacaProvider,
    (window as { bitcoincash?: PaytacaProvider }).bitcoincash as PaytacaProvider,
    (window as { bch?: PaytacaProvider }).bch as PaytacaProvider,
    (window as { bitcoin?: PaytacaProvider }).bitcoin as PaytacaProvider,
    (window as { bitcoinCash?: PaytacaProvider }).bitcoinCash as PaytacaProvider,
    (window as { paytacaWallet?: PaytacaProvider }).paytacaWallet as PaytacaProvider,
    (window as { paytacaProvider?: PaytacaProvider }).paytacaProvider as PaytacaProvider,
    (window as { paytaca?: { provider?: PaytacaProvider } }).paytaca?.provider as PaytacaProvider,
  ];

  for (const value of namedCandidates) {
    const provider = pickProvider(value);
    if (provider) {
      return provider;
    }
  }

  const seen = new Set<unknown>(namedCandidates);
  const windowKeys = Object.getOwnPropertyNames(window);
  for (const key of windowKeys) {
    const value = safeReadWindowProperty(key);
    if (seen.has(value)) continue;
    seen.add(value);
    const provider = pickProvider(value);
    if (provider) {
      return provider;
    }
  }

  return null;
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

function isChromiumBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /(Chrome|Chromium|Edg|Brave)/i.test(ua);
}

export async function isPaytacaExtensionInstalled(timeoutMs = 1200): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isChromiumBrowser()) return false;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`chrome-extension://${PAYTACA_EXTENSION_ID}/manifest.json`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function connectPaytacaDirect(network: Network = 'testnet'): Promise<string | null> {
  const provider = await waitForPaytacaProvider();
  if (!provider) {
    const extensionInstalled = await isPaytacaExtensionInstalled();
    if (extensionInstalled) {
      throw new Error(
        'Paytaca extension is installed, but no dApp provider API was exposed to this tab. Reload the page and reopen the extension once, then retry.'
      );
    }
    return null;
  }

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
