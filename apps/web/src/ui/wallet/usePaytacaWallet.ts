'use client';

import { useCallback, useState } from 'react';

import { useExtensionWalletStore } from '@/stores';

import type { Network } from '@/core/db/types';

import { connectPaytacaDirect, getPaytacaProvider, waitForPaytacaProvider } from './paytacaDirect';

export interface PaytacaSignTransactionRequest {
  txRequest: {
    transaction: unknown;
    sourceOutputs: unknown[];
    broadcast?: boolean;
    userPrompt?: string;
  };
}

export interface PaytacaSignTransactionResponse {
  signedTransaction: string;
  signedTransactionHash: string;
}

export function useWallet(network: Network = 'testnet') {
  const { connectedAddress, setConnectedAddress, clearConnectedAddress } =
    useExtensionWalletStore();
  const [connectError, setConnectError] = useState<Error | null>(null);
  const [disconnectError, setDisconnectError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    try {
      setConnectError(null);
      const address = await connectPaytacaDirect(network);
      if (!address) {
        throw new Error(
          'Paytaca extension wallet was not detected. Confirm the extension is enabled for this site and opened in this Chrome profile.'
        );
      }
      setConnectedAddress(address);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to connect Paytaca wallet.');
      setConnectError(err);
      throw err;
    }
  }, [network, setConnectedAddress]);

  const disconnect = useCallback(async () => {
    try {
      setDisconnectError(null);
      clearConnectedAddress();
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error('Failed to disconnect Paytaca wallet.');
      setDisconnectError(err);
      throw err;
    }
  }, [clearConnectedAddress]);

  const refetchAddresses = useCallback(async () => {
    if (connectedAddress) {
      setConnectedAddress(connectedAddress);
    }
  }, [connectedAddress, setConnectedAddress]);

  return {
    address: connectedAddress,
    tokenAddress: connectedAddress,
    isConnected: Boolean(connectedAddress),
    connect,
    disconnect,
    connectError,
    disconnectError,
    refetchAddresses,
    areAddressesLoading: false,
    addressError: null as Error | null,
    tokenAddressError: null as Error | null,
    session: null,
    isError: Boolean(connectError || disconnectError),
  };
}

export function useSignTransaction() {
  const signTransaction = useCallback(
    async ({
      txRequest,
    }: PaytacaSignTransactionRequest): Promise<PaytacaSignTransactionResponse | null> => {
      const provider = getPaytacaProvider() ?? (await waitForPaytacaProvider());
      if (!provider?.signTransaction && !provider?.request) {
        throw new Error(
          'Paytaca extension wallet was not detected. Confirm the extension is enabled for this site and opened in this Chrome profile.'
        );
      }

      const result = provider.signTransaction
        ? await provider.signTransaction(txRequest)
        : ((await provider.request?.({
            method: 'bch_signTransaction',
            params: txRequest,
          })) as
            | {
                signedTransaction: string;
                signedTransactionHash: string;
              }
            | undefined);

      if (!result) {
        return null;
      }

      return {
        signedTransaction: result.signedTransaction,
        signedTransactionHash: result.signedTransactionHash,
      };
    },
    []
  );

  return { signTransaction };
}
