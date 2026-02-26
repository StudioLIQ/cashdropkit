'use client';

const FALLBACK_WALLETCONNECT_PROJECT_ID = '00000000000000000000000000000000';

function getWalletRelayProjectId(): string {
  return (
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || FALLBACK_WALLETCONNECT_PROJECT_ID
  );
}

export function hasConfiguredWalletRelayProjectId(): boolean {
  const projectId = getWalletRelayProjectId();
  return projectId.length > 0 && projectId !== FALLBACK_WALLETCONNECT_PROJECT_ID;
}

export async function connectPaytacaWithGuard(params: {
  connect: () => Promise<void>;
  refetchAddresses?: () => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const { connect, refetchAddresses, timeoutMs = 12000 } = params;

  if (!hasConfiguredWalletRelayProjectId()) {
    throw new Error('Paytaca 연결 설정이 누락되었습니다. 운영 환경 변수 확인 후 다시 시도하세요.');
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
            new Error('Paytaca 연결이 응답하지 않습니다. 확장지갑 팝업/네트워크를 확인하세요.')
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
}
