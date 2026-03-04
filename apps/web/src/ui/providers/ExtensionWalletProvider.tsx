'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { SessionTypes } from '@walletconnect/types';

import type { Network } from '@/core/db/types';

import {
  PaytacaConnectModal,
  emitModalState,
} from '@/ui/wallet/PaytacaConnectModal';

// ---------------------------------------------------------------------------
// BCH WalletConnect namespace constants
// ---------------------------------------------------------------------------

const BCH_CHAINS: Record<Network, string> = {
  testnet: 'bch:bchtest',
  mainnet: 'bch:bitcoincash',
};

const BCH_METHODS = [
  'bch_getAddresses',
  'bch_signTransaction',
  'bch_signMessage',
] as const;

const BCH_EVENTS = ['addressesChanged'] as const;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SignClient = Awaited<
  ReturnType<typeof import('@walletconnect/sign-client').SignClient.init>
>;

export interface WalletConnectContextValue {
  signClient: SignClient | null;
  session: SessionTypes.Struct | null;
  connectError: Error | null;
  disconnectError: Error | null;
  network: Network;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletConnectContext = createContext<WalletConnectContextValue>({
  signClient: null,
  session: null,
  connectError: null,
  disconnectError: null,
  network: 'testnet',
  connect: async () => {},
  disconnect: async () => {},
});

export function useWalletConnect() {
  return useContext(WalletConnectContext);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProjectId(): string {
  const id =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim()
      : undefined;
  if (!id) {
    console.error(
      '[CashDropKit] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. ' +
        'Wallet connect will fail. Create a free project at https://cloud.reown.com ' +
        'and add the ID to .env.local',
    );
    return 'missing-project-id';
  }
  return id;
}

const METADATA = {
  name: 'CashDrop Kit',
  description: 'CashTokens airdrop and vesting operations console',
  url: 'https://www.cashdropkit.com',
  icons: ['https://www.cashdropkit.com/favicon.svg'],
};

// ---------------------------------------------------------------------------
// Relay reconnection with exponential backoff (background only)
// ---------------------------------------------------------------------------

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * For user-initiated actions (connect, signTransaction): try once, fail fast.
 */
async function ensureRelayConnected(client: SignClient): Promise<void> {
  const relayer = client.core.relayer as {
    connected: boolean;
    restartTransport: (relayUrl?: string) => Promise<void>;
  };
  if (relayer.connected) return;

  try {
    await relayer.restartTransport();
  } catch (err) {
    throw new Error(
      `Relay connection failed: ${err instanceof Error ? err.message : 'unknown error'}. ` +
        'Check your network and try again.',
    );
  }

  if (!relayer.connected) {
    throw new Error(
      'Unable to connect to WalletConnect relay. Check your network and try again.',
    );
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ExtensionWalletProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const network: Network = 'testnet';
  const [signClient, setSignClient] = useState<SignClient | null>(null);
  const [session, setSession] = useState<SessionTypes.Struct | null>(null);
  const [connectError, setConnectError] = useState<Error | null>(null);
  const [disconnectError, setDisconnectError] = useState<Error | null>(null);
  const initRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // ---- Lazy SignClient init (SSR-safe via dynamic import) ----
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        console.log('[WC] Initializing SignClient...');
        const { SignClient } = await import('@walletconnect/sign-client');
        const client = await SignClient.init({
          projectId: getProjectId(),
          metadata: METADATA,
        });

        if (cancelled) return;
        console.log('[WC] SignClient initialized successfully');

        // Restore existing session
        const sessions = client.session.getAll();
        if (sessions.length > 0) {
          console.log('[WC] Restored existing session:', sessions[0].topic);
          setSession(sessions[0]);
        }

        // Wire session events
        client.on('session_delete', ({ topic }) => {
          console.log('[WC] session_delete:', topic);
          setSession((prev) => (prev?.topic === topic ? null : prev));
        });
        client.on('session_expire', ({ topic }) => {
          console.log('[WC] session_expire:', topic);
          setSession((prev) => (prev?.topic === topic ? null : prev));
        });
        client.on('session_update', ({ topic, params }) => {
          console.log('[WC] session_update:', topic);
          setSession((prev) => {
            if (prev?.topic !== topic) return prev;
            return { ...prev, namespaces: params.namespaces };
          });
        });
        client.on('session_event', (event) => {
          console.log('[WC] session_event:', event);
        });
        client.on('proposal_expire', (event) => {
          console.log('[WC] proposal_expire:', event);
        });

        // Wire background relay reconnection (exponential backoff)
        const relayer = client.core.relayer as {
          on: (event: string, cb: () => void) => void;
          connected: boolean;
          restartTransport: (relayUrl?: string) => Promise<void>;
        };

        const scheduleReconnect = () => {
          if (reconnectTimerRef.current) return;
          console.warn('[WC] Relay disconnected, scheduling reconnect...');
          let delay = RECONNECT_BASE_MS;
          const attempt = async () => {
            try {
              await relayer.restartTransport();
              if (relayer.connected) {
                console.log('[WC] Relay reconnected');
                reconnectTimerRef.current = undefined;
                return;
              }
            } catch {
              // will retry
            }
            delay = Math.min(delay * 2, RECONNECT_MAX_MS);
            reconnectTimerRef.current = setTimeout(attempt, delay);
          };
          reconnectTimerRef.current = setTimeout(attempt, delay);
        };

        relayer.on('relayer_disconnect', scheduleReconnect);
        relayer.on('relayer_connection_stalled', scheduleReconnect);

        setSignClient(client);
      } catch (err) {
        console.error('[WC] SignClient init failed:', err);
        if (!cancelled) {
          setConnectError(
            err instanceof Error
              ? err
              : new Error('Failed to initialize SignClient'),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Cleanup reconnect timer
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  // ---- Connect ----
  const connect = useCallback(async () => {
    if (!signClient) {
      throw new Error(
        'Wallet provider is still initialising. Please wait a moment and try again.',
      );
    }

    setConnectError(null);

    // Ensure relay is connected (try once, fail fast)
    await ensureRelayConnected(signClient);

    // Clean up stale pairings
    try {
      const pairings = signClient.core.pairing.getPairings();
      for (const pairing of pairings) {
        if (
          !pairing.active ||
          (pairing.expiry && pairing.expiry * 1000 < Date.now())
        ) {
          try {
            await signClient.core.pairing.disconnect({
              topic: pairing.topic,
            });
          } catch {
            // ignore cleanup errors
          }
        }
      }
    } catch {
      // pairing cleanup is best-effort
    }

    const chainId = BCH_CHAINS[network];
    console.log('[WC] Connecting with chain:', chainId);

    const { uri, approval } = await signClient.connect({
      optionalNamespaces: {
        bch: {
          chains: [chainId],
          methods: [...BCH_METHODS],
          events: [...BCH_EVENTS],
        },
      },
    });

    console.log('[WC] Got URI:', uri ? 'yes' : 'no');

    if (uri) {
      emitModalState({ isOpen: true, uri });
    }

    try {
      const approved = await approval();
      console.log('[WC] Session approved:', approved.topic);
      setSession(approved);
    } finally {
      emitModalState({ isOpen: false, uri: '' });
    }
  }, [signClient, network]);

  // ---- Disconnect ----
  const disconnect = useCallback(async () => {
    if (!signClient || !session) return;

    setDisconnectError(null);
    try {
      await signClient.disconnect({
        topic: session.topic,
        reason: { code: 6000, message: 'User disconnected' },
      });
    } catch (err) {
      setDisconnectError(
        err instanceof Error ? err : new Error('Failed to disconnect'),
      );
    }
    setSession(null);
  }, [signClient, session]);

  const value: WalletConnectContextValue = {
    signClient,
    session,
    connectError,
    disconnectError,
    network,
    connect,
    disconnect,
  };

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
      <PaytacaConnectModal />
    </WalletConnectContext.Provider>
  );
}
