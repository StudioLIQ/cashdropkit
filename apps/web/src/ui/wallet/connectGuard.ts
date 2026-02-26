'use client';

function normalizeConnectError(error: unknown): string {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === 'string' ? error.trim() : '';

  const lowered = message.toLowerCase();
  if (lowered.includes('fatal socket error') || lowered.includes('transport')) {
    return 'Unable to reach the wallet relay. Please try again in a few seconds.';
  }
  if (lowered.includes('interrupted while trying to subscribe')) {
    return 'Wallet relay connection was interrupted. Retry once after re-opening the Paytaca extension.';
  }
  if (lowered.includes('project not found')) {
    return 'Wallet relay project configuration is invalid. Reload the app and try connecting again.';
  }
  if (lowered.includes('reject') || lowered.includes('declin')) {
    return 'Connection request was rejected in Paytaca.';
  }
  if (lowered.includes('still initialising') || lowered.includes('still initializing')) {
    return 'Wallet relay is still loading. Please wait a moment and click Connect again.';
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
  const { connect, refetchAddresses, timeoutMs = 45000 } = params;

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
              'Paytaca pairing timed out. Keep the extension open, approve the session request, and try again.'
            )
          );
        }, timeoutMs);
      }),
    ]);
    return null;
  } catch (error) {
    throw new Error(normalizeConnectError(error));
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}
