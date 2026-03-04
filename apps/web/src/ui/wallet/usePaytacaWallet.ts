'use client';

import { useCallback, useEffect, useMemo } from 'react';

import {
  cashAddressToLockingBytecode,
  lockingBytecodeToCashAddress,
  stringify,
} from '@bitauth/libauth';

import { useExtensionWalletStore } from '@/stores';

import type { Network } from '@/core/db/types';

import { useWalletConnect } from '@/ui/providers/ExtensionWalletProvider';

// ---------------------------------------------------------------------------
// Types (previously imported from bch-connect)
// ---------------------------------------------------------------------------

export interface WcSignTransactionRequest {
  transaction: unknown;
  sourceOutputs: unknown[];
  broadcast?: boolean;
  userPrompt?: string;
}

export interface PaytacaSignTransactionRequest {
  txRequest: WcSignTransactionRequest;
}

export interface PaytacaSignTransactionResponse {
  signedTransaction: string;
  signedTransactionHash: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Purge stale WalletConnect v2 data from localStorage so that a fresh
 * pairing can be established without "Subscribing to <topic> failed" errors
 * caused by leftover sessions/pairings from previous attempts.
 */
function clearStaleWcStorage(): void {
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('wc@')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage access may fail in some contexts; not critical.
  }
}

/**
 * Extract the BCH address from a CAIP-10 account string.
 * Format: "bch:bchtest:qz..." → "bchtest:qz..."
 */
function extractAddressFromCaip10(account: string): string {
  // Remove the "bch:" prefix → "bchtest:qz..."
  return account.replace(/^bch:/, '');
}

/**
 * Derive a token-aware CashAddress from a standard CashAddress.
 * Input like "bchtest:qz..." → "bchtest:zz..." (with tokenSupport).
 */
function deriveTokenAddress(address: string): string | null {
  try {
    const result = cashAddressToLockingBytecode(address);
    if (typeof result === 'string') return null; // error string
    const tokenAddr = lockingBytecodeToCashAddress({
      bytecode: result.bytecode,
      prefix: result.prefix,
      tokenSupport: true,
    });
    if (typeof tokenAddr === 'string') return tokenAddr;
    return null;
  } catch {
    return null;
  }
}

async function ensureRelayConnected(
  signClient: NonNullable<ReturnType<typeof useWalletConnect>['signClient']>,
): Promise<void> {
  const relayer = signClient.core.relayer as {
    connected: boolean;
    restartTransport: (relayUrl?: string) => Promise<void>;
  };
  if (relayer.connected) return;
  await relayer.restartTransport();
}

// ---------------------------------------------------------------------------
// useWallet
// ---------------------------------------------------------------------------

export function useWallet(_network: Network = 'testnet') {
  const {
    signClient,
    session,
    connectError,
    network,
    connect: wcConnect,
    disconnect: wcDisconnect,
  } = useWalletConnect();

  const { setConnectedAddress, clearConnectedAddress } =
    useExtensionWalletStore();

  const isConnected = session !== null;

  // Extract address from session
  const address = useMemo(() => {
    if (!session) return null;
    const accounts = session.namespaces?.bch?.accounts;
    if (!accounts || accounts.length === 0) return null;
    return extractAddressFromCaip10(accounts[0]);
  }, [session]);

  // Derive token address
  const tokenAddress = useMemo(() => {
    if (!address) return null;
    return deriveTokenAddress(address);
  }, [address]);

  const effectiveAddress = tokenAddress || address || null;

  // Sync to extension wallet store
  useEffect(() => {
    if (effectiveAddress) {
      setConnectedAddress(effectiveAddress);
    } else {
      clearConnectedAddress();
    }
  }, [effectiveAddress, setConnectedAddress, clearConnectedAddress]);

  // Connect with error handling
  const connect = useCallback(async () => {
    if (connectError) {
      throw connectError;
    }

    clearStaleWcStorage();

    try {
      await wcConnect();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : '';
      const lowered = message.toLowerCase();

      if (
        lowered.includes('origin not allowed') ||
        lowered.includes('unauthorized')
      ) {
        throw new Error(
          'WalletConnect relay rejected this origin. Set a valid NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local (create one free at https://cloud.reown.com).',
        );
      }
      if (
        lowered.includes('fatal socket error') ||
        lowered.includes('transport') ||
        lowered.includes('interrupted while trying to subscribe')
      ) {
        throw new Error(
          'Unable to reach the wallet relay. Check NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and retry.',
        );
      }
      if (lowered.includes('subscribing') && lowered.includes('failed')) {
        clearStaleWcStorage();
        throw new Error(
          'Relay subscription failed. Stale session data has been cleared — please refresh the page and try again.',
        );
      }
      throw error;
    }
  }, [connectError, wcConnect]);

  // Disconnect
  const disconnect = useCallback(async () => {
    await wcDisconnect();
  }, [wcDisconnect]);

  // Refetch addresses via bch_getAddresses
  const refetchAddresses = useCallback(async () => {
    if (!signClient || !session) return;
    try {
      await ensureRelayConnected(signClient);
      await signClient.request<{ addresses: string[] }>({
        topic: session.topic,
        chainId: `bch:${network === 'mainnet' ? 'bitcoincash' : 'bchtest'}`,
        request: {
          method: 'bch_getAddresses',
          params: { token: true },
        },
      });
    } catch {
      // best-effort; address is already available from session
    }
  }, [signClient, session, network]);

  return {
    connect,
    disconnect,
    refetchAddresses,
    isConnected,
    address,
    tokenAddress,
    connectError,
    session,
  };
}

// ---------------------------------------------------------------------------
// useSignTransaction
// ---------------------------------------------------------------------------

export function useSignTransaction() {
  const { signClient, session, network } = useWalletConnect();

  const signTransaction = useCallback(
    async ({
      txRequest,
    }: PaytacaSignTransactionRequest): Promise<PaytacaSignTransactionResponse | null> => {
      if (!signClient || !session) {
        throw new Error('Wallet is not connected');
      }

      // Ensure relay is connected before sending request
      await ensureRelayConnected(signClient);

      const chainId = `bch:${network === 'mainnet' ? 'bitcoincash' : 'bchtest'}`;

      // Use libauth's stringify to serialize BigInt/Uint8Array values,
      // then parse back for clean JSON-RPC transport.
      const serializedParams = JSON.parse(stringify(txRequest));

      const result = await signClient.request<{
        signedTransaction?: string;
        signedTransactionHash?: string;
      }>({
        topic: session.topic,
        chainId,
        request: {
          method: 'bch_signTransaction',
          params: serializedParams,
        },
        expiry: 300,
      });

      // Paytaca sometimes returns an empty object on rejection
      if (
        !result ||
        (typeof result === 'object' &&
          !result.signedTransaction &&
          !result.signedTransactionHash)
      ) {
        return null;
      }

      return {
        signedTransaction: result.signedTransaction!,
        signedTransactionHash: result.signedTransactionHash!,
      };
    },
    [signClient, session, network],
  );

  return { signTransaction };
}
