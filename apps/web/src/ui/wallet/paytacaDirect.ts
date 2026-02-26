'use client';

import type { Network } from '@/core/db/types';
import { decodeCashAddr, encodeCashAddr, normalizeCashAddr } from '@/core/wallet/cashaddr';

interface PaytacaConnectResult {
  connected?: boolean;
  address?: string;
}

interface PaytacaProvider {
  connect?: () => Promise<PaytacaConnectResult | string | undefined>;
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
  return window.paytaca ?? null;
}

export async function connectPaytacaDirect(network: Network = 'testnet'): Promise<string | null> {
  const provider = getPaytacaProvider();
  if (!provider?.connect) return null;

  const response = await provider.connect();
  let address: string | undefined;

  if (typeof response === 'string') {
    address = response;
  } else if (response?.connected && response.address) {
    address = response.address;
  } else if (response?.address) {
    address = response.address;
  }

  if (!address) {
    return null;
  }

  return normalizeToNetwork(address, network);
}
