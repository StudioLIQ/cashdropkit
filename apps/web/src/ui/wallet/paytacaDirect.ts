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
  const namedCandidates: PaytacaProvider[] = [
    window.paytaca as PaytacaProvider,
    (window as { bitcoincash?: PaytacaProvider }).bitcoincash as PaytacaProvider,
    (window as { bch?: PaytacaProvider }).bch as PaytacaProvider,
  ].filter(Boolean);

  for (const provider of namedCandidates) {
    if (provider?.connect || provider?.enable || provider?.request) {
      return provider;
    }
  }

  // Last-resort scan for injected providers with compatible methods.
  const dynamicCandidate = Object.values(window).find((value) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as PaytacaProvider;
    return Boolean(
      candidate.signTransaction && (candidate.connect || candidate.enable || candidate.request)
    );
  }) as PaytacaProvider | undefined;

  return dynamicCandidate ?? null;
}

export async function connectPaytacaDirect(network: Network = 'testnet'): Promise<string | null> {
  const provider = getPaytacaProvider();
  if (!provider) return null;

  let response: PaytacaConnectResult | string | string[] | undefined;
  if (provider.connect) {
    response = await provider.connect();
  } else if (provider.enable) {
    response = await provider.enable();
  } else if (provider.request) {
    response = (await provider.request({ method: 'bch_getAddresses', params: { token: true } })) as
      | string[]
      | undefined;
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
  }

  if (!address && provider.getAddress) {
    address = await provider.getAddress();
  }
  if (!address && provider.getAddresses) {
    address = (await provider.getAddresses())?.[0];
  }

  if (!address) {
    return null;
  }

  return normalizeToNetwork(address, network);
}
