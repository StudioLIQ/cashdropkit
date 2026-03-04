'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useExtensionWalletStore } from '@/stores';
import {
  cashAddressToLockingBytecode,
  lockingBytecodeToCashAddress,
  stringify,
} from '@bitauth/libauth';

import type { Network } from '@/core/db/types';

import { useWalletConnect } from '@/ui/providers/ExtensionWalletProvider';

import { type PaytacaProvider, connectPaytacaDirect, getPaytacaProvider } from './paytacaDirect';

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
// Module-level direct provider reference
// Shared between useWallet and useSignTransaction hooks.
// ---------------------------------------------------------------------------

let _directProvider: PaytacaProvider | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the BCH address from a CAIP-10 account string.
 * Format: "bch:bchtest:qz..." → "bchtest:qz..."
 */
function extractAddressFromCaip10(account: string): string {
  return account.replace(/^bch:/, '');
}

/**
 * Derive a token-aware CashAddress from a standard CashAddress.
 * Input like "bchtest:qz..." → "bchtest:zz..." (with tokenSupport).
 */
function deriveTokenAddress(address: string): string | null {
  try {
    const result = cashAddressToLockingBytecode(address);
    if (typeof result === 'string') return null;
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
  signClient: NonNullable<ReturnType<typeof useWalletConnect>['signClient']>
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

export function useWallet(_network?: Network) {
  void _network; // network is controlled by the provider context

  const {
    signClient,
    session,
    connectError,
    network,
    connect: wcConnect,
    disconnect: wcDisconnect,
  } = useWalletConnect();

  const { setConnectedAddress, clearConnectedAddress } = useExtensionWalletStore();

  // WC session means connected via WalletConnect.
  // Direct provider means connected via window.paytaca.
  // Downstream consumers also check extensionWalletStore.connectedAddress.
  const isConnected = session !== null;

  // Extract address from WC session
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

  // Sync WC session address to extension wallet store
  useEffect(() => {
    if (effectiveAddress) {
      setConnectedAddress(effectiveAddress);
    } else if (!_directProvider) {
      // Only clear if we're also not connected via direct provider
      clearConnectedAddress();
    }
  }, [effectiveAddress, setConnectedAddress, clearConnectedAddress]);

  // Connect: try direct extension provider first, WalletConnect as fallback
  const connect = useCallback(async () => {
    // 1. Try direct provider (window.paytaca) — no relay needed
    try {
      console.log('[Wallet] Trying direct extension provider...');
      const directAddress = await connectPaytacaDirect(network);
      if (directAddress) {
        _directProvider = getPaytacaProvider();
        setConnectedAddress(directAddress);
        console.log('[Wallet] Connected via direct provider:', directAddress);
        return;
      }
    } catch (err) {
      console.log('[Wallet] Direct provider failed, falling back to WC:', err);
    }

    // 2. Fall back to WalletConnect (opens modal with QR/extension link)
    if (connectError) {
      throw connectError;
    }

    try {
      await wcConnect();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const lowered = message.toLowerCase();

      if (lowered.includes('origin not allowed') || lowered.includes('unauthorized')) {
        throw new Error(
          'WalletConnect relay rejected this origin. Set a valid NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local (create one free at https://cloud.reown.com).'
        );
      }
      if (
        lowered.includes('fatal socket error') ||
        lowered.includes('transport') ||
        lowered.includes('interrupted while trying to subscribe')
      ) {
        throw new Error(
          'Unable to reach the wallet relay. Check NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and retry.'
        );
      }
      if (lowered.includes('subscribing') && lowered.includes('failed')) {
        throw new Error('Relay subscription failed. Please refresh the page and try again.');
      }
      throw error;
    }
  }, [connectError, wcConnect, network, setConnectedAddress]);

  // Disconnect
  const disconnect = useCallback(async () => {
    if (_directProvider) {
      console.log('[Wallet] Disconnecting direct provider');
      _directProvider = null;
      clearConnectedAddress();
      return;
    }
    await wcDisconnect();
  }, [wcDisconnect, clearConnectedAddress]);

  // Refetch addresses (WC only — direct provider address is static)
  const refetchAddresses = useCallback(async () => {
    if (_directProvider) return; // direct provider: address already known
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
      // 1. Try direct provider (in-process, no serialization needed)
      if (_directProvider?.signTransaction) {
        console.log('[Wallet] Signing via direct provider');
        const result = await _directProvider.signTransaction(txRequest);
        if (!result) return null;
        return {
          signedTransaction: result.signedTransaction,
          signedTransactionHash: result.signedTransactionHash,
        };
      }

      // 2. Fall back to WalletConnect
      if (!signClient || !session) {
        throw new Error('Wallet is not connected');
      }

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
        (typeof result === 'object' && !result.signedTransaction && !result.signedTransactionHash)
      ) {
        return null;
      }

      return {
        signedTransaction: result.signedTransaction!,
        signedTransactionHash: result.signedTransactionHash!,
      };
    },
    [signClient, session, network]
  );

  return { signTransaction };
}
