'use client';

import { ReactNode, useCallback, useEffect } from 'react';

import { setGlobalAdapter, useConnectionStore, useWalletStore } from '@/stores';

import { getConnectionService } from '@/core/adapters/chain/connectionService';
import { initApiClient } from '@/core/db';
import type { Network } from '@/core/db/types';

import { ToastContainer } from '@/ui/components/toasts/ToastContainer';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AppShellProps {
  children: ReactNode;
}

function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3001';
    }
  }
  return 'https://api.cashdropkit.com';
}

const API_BASE_URL = resolveApiBaseUrl();
const API_ACCESS_TOKEN = 'cashdropkit-public-client-token';

if (API_BASE_URL) {
  initApiClient({
    baseUrl: API_BASE_URL,
    getToken: API_ACCESS_TOKEN ? () => API_ACCESS_TOKEN : undefined,
  });
}

export function AppShell({ children }: AppShellProps) {
  // Connection state
  const { status, network, isRetrying, lastError, setNetwork, recordHealthCheck, setChecking } =
    useConnectionStore();

  // Wallet state
  const { wallets, activeWalletId, loadWallets } = useWalletStore();
  const activeWallet = wallets.find((w) => w.id === activeWalletId);

  // Initialize connection on mount
  useEffect(() => {
    const service = getConnectionService();

    // Subscribe to health check results
    const unsubscribe = service.addListener((result) => {
      recordHealthCheck(result);
      setChecking(false);

      // Update global adapter when connection is healthy
      if (result.healthy) {
        setGlobalAdapter(service.getAdapter());
      }
    });

    // Start the connection
    setChecking(true);
    service
      .start(network)
      .then((result) => {
        // Set global adapter after successful connection
        if (result.healthy) {
          setGlobalAdapter(service.getAdapter());
        }
      })
      .catch((err) => {
        console.error('Failed to start connection service:', err);
        setChecking(false);
      });

    // Cleanup on unmount
    return () => {
      unsubscribe();
      setGlobalAdapter(null);
      service.stop();
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load wallets on mount
  useEffect(() => {
    loadWallets();
  }, [loadWallets]);

  // Handle network change
  const handleNetworkChange = useCallback(
    async (newNetwork: Network) => {
      if (newNetwork !== 'testnet') return;
      if (newNetwork === network) return;

      setNetwork(newNetwork);
      setChecking(true);

      const service = getConnectionService();
      try {
        const result = await service.switchNetwork(newNetwork);
        // Update global adapter after network switch
        if (result.healthy) {
          setGlobalAdapter(service.getAdapter());
        }
      } catch (err) {
        console.error('Failed to switch network:', err);
      }
      setChecking(false);
    },
    [network, setNetwork, setChecking]
  );

  // Handle retry
  const handleRetry = useCallback(async () => {
    setChecking(true);
    const service = getConnectionService();
    try {
      await service.retry();
    } catch (err) {
      console.error('Retry failed:', err);
    }
    setChecking(false);
  }, [setChecking]);

  return (
    <div className="cdk-shell-bg flex h-screen overflow-hidden">
      <div className="cdk-orb cdk-orb-1" />
      <div className="cdk-orb cdk-orb-2" />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-visible">
        <Topbar
          network={network}
          connectionStatus={status}
          walletLabel={activeWallet?.name}
          isRetrying={isRetrying}
          lastError={lastError}
          onNetworkChange={handleNetworkChange}
          onRetry={handleRetry}
        />
        <main className="flex-1 overflow-auto px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
          <div className="cdk-fade-in">{children}</div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
