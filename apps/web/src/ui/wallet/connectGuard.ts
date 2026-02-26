'use client';

import { connectPaytacaDirect } from './paytacaDirect';

function normalizeWalletConnectError(error: unknown): string {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';

  const lowered = message.toLowerCase();
  if (lowered.includes('fatal socket error') || lowered.includes('transport')) {
    return 'Unable to reach the wallet relay. Please try again in a few seconds.';
  }
  if (lowered.includes('reject') || lowered.includes('declin')) {
    return 'Connection request was rejected in Paytaca.';
  }
  if (message) {
    return message;
  }
  return 'Failed to connect Paytaca wallet.';
}

export async function connectPaytacaWithGuard(params: {
  connect: () => Promise<void>;
  refetchAddresses?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<string | null> {
  const { connect, refetchAddresses, timeoutMs = 12000 } = params;

  try {
    const directAddress = await connectPaytacaDirect('testnet');
    if (directAddress) {
      return directAddress;
    }
  } catch {
    // Continue with WalletConnect fallback below.
  }

  let timer: number | undefined;
  try {
    await Promise.race([
      (async () => {
        await connect();
        if (refetchAddresses) {
          await refetchAddresses();
        }
      })(),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(
            new Error(
              'Paytaca connection timed out. Check the wallet popup and your network, then try again.'
            )
          );
        }, timeoutMs);
      }),
    ]);
    return null;
  } catch (error) {
    throw new Error(normalizeWalletConnectError(error));
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}
