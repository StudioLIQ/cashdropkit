/**
 * Vesting Executor Tests
 *
 * Tests lockbox creation flow with mocks for:
 * - ChainAdapter (UTXO loading, broadcast)
 * - MnemonicSigner (signing)
 * - Database persistence (vestingRepo)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import type { BeneficiaryRow, VestingCampaign, VestingPlan } from '@/core/db/types';
import type { AddressDerivation, MnemonicSigner } from '@/core/signer';

import { VestingExecutor, type VestingExecutorConfig } from './vestingExecutor';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/core/db', () => ({
  vestingRepo: {
    update: vi.fn().mockResolvedValue(undefined),
  },
  logRepo: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

function makeTokenUtxo(
  txid: string,
  vout: number,
  satoshis: bigint,
  tokenAmount: bigint,
  category: string
): TokenUtxo {
  return {
    txid,
    vout,
    satoshis,
    scriptPubKey: '76a91489abcdef0123456789abcdef0123456789abcdef88ac',
    confirmations: 6,
    blockHeight: 800000,
    token: {
      category,
      amount: tokenAmount,
    },
  };
}

function makeBchUtxo(txid: string, vout: number, satoshis: bigint): Utxo {
  return {
    txid,
    vout,
    satoshis,
    scriptPubKey: '76a91489abcdef0123456789abcdef0123456789abcdef88ac',
    confirmations: 6,
    blockHeight: 800000,
  };
}

function makeBeneficiary(id: string, trancheCount: number): BeneficiaryRow {
  const tranches = Array.from({ length: trancheCount }, (_, i) => ({
    id: `${id}-t${i}`,
    unlockTime: 1700000000 + i * 2592000,
    amountBase: '100000',
    lockbox: { status: 'PLANNED' as const },
  }));

  // Use a valid testnet address format (bchtest:qz...)
  return {
    id,
    address: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
    tranches,
    valid: true,
  };
}

const TEST_CATEGORY = 'a'.repeat(64);

function makeCampaign(beneficiaries: BeneficiaryRow[], plan?: VestingPlan): VestingCampaign {
  return {
    id: 'vc1',
    name: 'Test Vesting',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    network: 'testnet',
    token: { tokenId: TEST_CATEGORY },
    template: 'MONTHLY_TRANCHES',
    schedule: {
      unlockTimes: [1700000000, 1702592000],
      amountsBasePerTranche: ['100000', '100000'],
    },
    beneficiaries,
    settings: {
      feeRateSatPerByte: 1,
      dustSatPerOutput: 800,
      lockScriptType: 'P2SH_CLTV_P2PKH',
    },
    funding: { sourceWalletId: 'w1' },
    plan: plan ?? {
      generatedAt: Date.now(),
      totalLockboxes: beneficiaries.reduce((s, b) => s + b.tranches.length, 0),
      estimated: {
        txCount: 1,
        totalFeeSat: '500',
        totalDustSat: '2400',
        requiredBchSat: '2900',
      },
      batches: [
        {
          id: 'batch1',
          trancheIds: beneficiaries.flatMap((b) => b.tranches.map((t) => t.id)),
          estimatedFeeSat: '500',
          estimatedSizeBytes: 400,
        },
      ],
    },
  };
}

function makeMockAdapter(): ChainAdapter {
  const tokenUtxos: TokenUtxo[] = [
    makeTokenUtxo('aa'.repeat(32), 0, 1000n, 500000n, TEST_CATEGORY),
  ];
  const bchUtxos: Utxo[] = [makeBchUtxo('bb'.repeat(32), 0, 100000n)];

  return {
    name: 'mock',
    network: 'testnet',
    getUtxos: vi.fn().mockResolvedValue([...tokenUtxos, ...bchUtxos]),
    getBchUtxos: vi.fn().mockResolvedValue(bchUtxos),
    getTokenUtxos: vi.fn().mockResolvedValue(tokenUtxos),
    getBalance: vi.fn().mockResolvedValue({ confirmed: 100000n, unconfirmed: 0n }),
    getTokenBalances: vi.fn().mockResolvedValue([]),
    broadcast: vi.fn().mockResolvedValue({ success: true, txid: 'cc'.repeat(32) }),
    getTxStatus: vi
      .fn()
      .mockResolvedValue({ status: 'confirmed', confirmations: 1, blockHeight: 800001 }),
    getRawTx: vi.fn().mockResolvedValue(''),
    getChainTip: vi.fn().mockResolvedValue({ height: 800001, hash: 'dd'.repeat(32) }),
    getBlock: vi.fn(),
    getBlockByHash: vi.fn(),
    isHealthy: vi.fn().mockResolvedValue(true),
    estimateFeeRate: vi.fn().mockResolvedValue(1.0),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChainAdapter;
}

function makeMockSigner(): MnemonicSigner {
  return {
    sign: vi.fn().mockResolvedValue({
      success: true,
      transaction: {
        txid: 'ee'.repeat(32),
        txHex: 'ff'.repeat(100),
        inputs: [],
        outputs: [],
      },
    }),
    destroy: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    getPublicKey: vi.fn(),
  } as unknown as MnemonicSigner;
}

// ============================================================================
// Tests
// ============================================================================

describe('VestingExecutor', () => {
  let adapter: ChainAdapter;
  let signer: MnemonicSigner;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = makeMockAdapter();
    signer = makeMockSigner();
  });

  function makeConfig(): VestingExecutorConfig {
    return {
      adapter,
      signer,
      sourceAddress: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
      addressDerivations: [
        {
          address: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
          accountIndex: 0,
          addressIndex: 0,
        } as AddressDerivation,
      ],
    };
  }

  it('should execute a vesting plan with one batch', async () => {
    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.completedBatches).toBe(1);
    expect(result.failedBatches).toBe(0);

    // Verify adapter was called
    expect(adapter.getUtxos).toHaveBeenCalled();
    expect(adapter.broadcast).toHaveBeenCalled();

    // Verify signer was called
    expect(signer.sign).toHaveBeenCalled();
  });

  it('should fail without a plan', async () => {
    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    campaign.plan = undefined;

    const executor = new VestingExecutor(makeConfig(), campaign);
    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/plan/i);
  });

  it('should fail when UTXOs cannot be loaded', async () => {
    (adapter.getUtxos as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Network error/);
  });

  it('should fail when broadcast fails', async () => {
    (adapter.broadcast as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Mempool full',
    });

    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Broadcast failed/);
  });

  it('should fail when signing fails', async () => {
    (signer.sign as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Invalid key',
    });

    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    const result = await executor.execute();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid key/);
  });

  it('should support pause via abort', async () => {
    const beneficiaries = [makeBeneficiary('b1', 3)];
    // Create 2 batches
    const campaign = makeCampaign(beneficiaries, {
      generatedAt: Date.now(),
      totalLockboxes: 3,
      estimated: {
        txCount: 2,
        totalFeeSat: '1000',
        totalDustSat: '4800',
        requiredBchSat: '5800',
      },
      batches: [
        {
          id: 'batch1',
          trancheIds: ['b1-t0', 'b1-t1'],
          estimatedFeeSat: '500',
          estimatedSizeBytes: 400,
        },
        {
          id: 'batch2',
          trancheIds: ['b1-t2'],
          estimatedFeeSat: '500',
          estimatedSizeBytes: 300,
        },
      ],
    });

    const config = makeConfig();
    const executor = new VestingExecutor(config, campaign);

    // Abort after first batch
    let callCount = 0;
    (adapter.broadcast as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount >= 1) {
        executor.abort();
      }
      return { success: true, txid: 'ee'.repeat(32) };
    });

    const result = await executor.execute();

    // Should have completed 1 batch then paused
    expect(result.completedBatches).toBe(1);
    expect(campaign.execution?.state).toBe('PAUSED');
  });

  it('should skip already-created tranches on resume', async () => {
    const beneficiaries = [makeBeneficiary('b1', 2)];
    // Pre-mark tranches as CREATED
    for (const t of beneficiaries[0].tranches) {
      t.lockbox.status = 'CREATED';
    }

    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    const result = await executor.execute();

    expect(result.success).toBe(true);
    expect(result.skippedBatches).toBe(1);
    // Adapter should load UTXOs but not broadcast (skipped)
    expect(adapter.getUtxos).toHaveBeenCalled();
    expect(adapter.broadcast).not.toHaveBeenCalled();
  });

  it('should persist outpoints after signing', async () => {
    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    await executor.execute();

    // Each tranche should have outpoint data
    for (const tranche of campaign.beneficiaries[0].tranches) {
      expect(tranche.lockbox.txid).toBeDefined();
      expect(tranche.lockbox.redeemScriptHex).toBeDefined();
      expect(tranche.lockbox.lockAddress).toBeDefined();
    }
  });

  it('should set execution state to COMPLETED on success', async () => {
    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    await executor.execute();

    expect(campaign.execution?.state).toBe('COMPLETED');
  });

  it('should set execution state to FAILED on error', async () => {
    (signer.sign as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Key error',
    });

    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    await executor.execute();

    expect(campaign.execution?.state).toBe('FAILED');
  });

  it('should track confirmation status after broadcast', async () => {
    const beneficiaries = [makeBeneficiary('b1', 2)];
    const campaign = makeCampaign(beneficiaries);
    const executor = new VestingExecutor(makeConfig(), campaign);

    await executor.execute();

    expect(campaign.execution?.confirmations).toBeDefined();
    const txids = Object.keys(campaign.execution?.confirmations || {});
    expect(txids.length).toBe(1);
    expect(campaign.execution?.confirmations[txids[0]].status).toBe('SEEN');
  });
});
