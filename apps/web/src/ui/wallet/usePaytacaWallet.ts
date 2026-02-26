'use client';

import { useCallback, useEffect } from 'react';

import { useSignTransaction as useBchConnectSignTransaction, useWallet as useBchConnectWallet } from 'bch-connect';
import type { WcSignTransactionRequest } from 'bch-connect';

import { useExtensionWalletStore } from '@/stores';

import type { Network } from '@/core/db/types';

export interface PaytacaSignTransactionRequest {
  txRequest: WcSignTransactionRequest;
}

export interface PaytacaSignTransactionResponse {
  signedTransaction: string;
  signedTransactionHash: string;
}

export function useWallet(_network: Network = 'testnet') {
  const wallet = useBchConnectWallet();
  const { setConnectedAddress, clearConnectedAddress } = useExtensionWalletStore();

  const effectiveAddress = wallet.tokenAddress || wallet.address || null;

  useEffect(() => {
    if (effectiveAddress) {
      setConnectedAddress(effectiveAddress);
    } else {
      clearConnectedAddress();
    }
  }, [effectiveAddress, setConnectedAddress, clearConnectedAddress]);

  const connect = useCallback(async () => {
    try {
      await wallet.connect();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const lowered = message.toLowerCase();

      if (lowered.includes('fatal socket error') || lowered.includes('transport')) {
        throw new Error(
          'Unable to reach the Paytaca relay. Retry after opening Paytaca extension and approving the pairing request.'
        );
      }
      throw error;
    }
  }, [wallet]);

  const disconnect = useCallback(async () => {
    await wallet.disconnect();
  }, [wallet]);

  const refetchAddresses = useCallback(async () => {
    await wallet.refetchAddresses();
  }, [wallet]);

  return {
    ...wallet,
    connect,
    disconnect,
    refetchAddresses,
  };
}

export function useSignTransaction() {
  const { signTransaction: signViaBchConnect } = useBchConnectSignTransaction();

  const signTransaction = useCallback(
    async ({
      txRequest,
    }: PaytacaSignTransactionRequest): Promise<PaytacaSignTransactionResponse | null> => {
      const result = await signViaBchConnect({
        txRequest,
        requestExpirySeconds: 300,
      });

      if (!result) {
        return null;
      }

      return {
        signedTransaction: result.signedTransaction,
        signedTransactionHash: result.signedTransactionHash,
      };
    },
    [signViaBchConnect]
  );

  return { signTransaction };
}
