/**
 * Database Persistence Tests
 *
 * These tests verify that the database layer works correctly.
 * Can be run in browser console or with a test framework.
 *
 * Usage in browser console:
 *   import { runDbTests } from '@/core/db/db.test';
 *   await runDbTests();
 */
import { deleteDb, getDb } from './db';
import { airdropRepo, logRepo, settingsRepo, vestingRepo, walletRepo } from './repositories';
import type { AirdropCampaign, VestingCampaign, Wallet } from './types';

function generateId(): string {
  return crypto.randomUUID();
}

async function testWalletRepo(): Promise<{ passed: boolean; error?: string }> {
  try {
    const testWallet: Wallet = {
      id: generateId(),
      name: 'Test Wallet',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      network: 'testnet',
      type: 'mnemonic',
      derivationPath: "m/44'/145'/0'",
    };

    // Create
    await walletRepo.create(testWallet);

    // Read
    const retrieved = await walletRepo.getById(testWallet.id);
    if (!retrieved || retrieved.name !== testWallet.name) {
      return { passed: false, error: 'Failed to retrieve wallet' };
    }

    // Update
    testWallet.name = 'Updated Wallet';
    testWallet.updatedAt = Date.now();
    await walletRepo.update(testWallet);
    const updated = await walletRepo.getById(testWallet.id);
    if (!updated || updated.name !== 'Updated Wallet') {
      return { passed: false, error: 'Failed to update wallet' };
    }

    // List
    const all = await walletRepo.getAll();
    if (!all.some((w) => w.id === testWallet.id)) {
      return { passed: false, error: 'Wallet not in list' };
    }

    // Delete
    await walletRepo.delete(testWallet.id);
    const deleted = await walletRepo.getById(testWallet.id);
    if (deleted) {
      return { passed: false, error: 'Failed to delete wallet' };
    }

    return { passed: true };
  } catch (error) {
    return { passed: false, error: String(error) };
  }
}

async function testAirdropRepo(): Promise<{ passed: boolean; error?: string }> {
  try {
    const testCampaign: AirdropCampaign = {
      id: generateId(),
      name: 'Test Airdrop',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      network: 'testnet',
      token: { tokenId: '0'.repeat(64) },
      mode: 'FT',
      amountUnit: 'base',
      recipients: [],
      settings: {
        feeRateSatPerByte: 1,
        dustSatPerOutput: 546,
        maxOutputsPerTx: 80,
        maxInputsPerTx: 100,
        allowMergeDuplicates: true,
        rounding: 'floor',
      },
      funding: {
        sourceWalletId: generateId(),
        tokenUtxoSelection: 'auto',
        bchUtxoSelection: 'auto',
      },
    };

    // Create
    await airdropRepo.create(testCampaign);

    // Read
    const retrieved = await airdropRepo.getById(testCampaign.id);
    if (!retrieved || retrieved.name !== testCampaign.name) {
      return { passed: false, error: 'Failed to retrieve campaign' };
    }

    // Patch
    await airdropRepo.patch(testCampaign.id, { name: 'Patched Airdrop' });
    const patched = await airdropRepo.getById(testCampaign.id);
    if (!patched || patched.name !== 'Patched Airdrop') {
      return { passed: false, error: 'Failed to patch campaign' };
    }

    // Delete
    await airdropRepo.delete(testCampaign.id);
    const deleted = await airdropRepo.getById(testCampaign.id);
    if (deleted) {
      return { passed: false, error: 'Failed to delete campaign' };
    }

    return { passed: true };
  } catch (error) {
    return { passed: false, error: String(error) };
  }
}

async function testVestingRepo(): Promise<{ passed: boolean; error?: string }> {
  try {
    const testCampaign: VestingCampaign = {
      id: generateId(),
      name: 'Test Vesting',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      network: 'testnet',
      token: { tokenId: '0'.repeat(64) },
      template: 'CLIFF_ONLY',
      schedule: {
        unlockTimes: [Date.now() + 86400000],
        amountsBasePerTranche: ['1000000'],
      },
      beneficiaries: [],
      settings: {
        feeRateSatPerByte: 1,
        dustSatPerOutput: 546,
        lockScriptType: 'P2SH_CLTV_P2PKH',
      },
      funding: {
        sourceWalletId: generateId(),
      },
    };

    // Create and verify
    await vestingRepo.create(testCampaign);
    const retrieved = await vestingRepo.getById(testCampaign.id);
    if (!retrieved) {
      return { passed: false, error: 'Failed to retrieve vesting campaign' };
    }

    // Cleanup
    await vestingRepo.delete(testCampaign.id);

    return { passed: true };
  } catch (error) {
    return { passed: false, error: String(error) };
  }
}

async function testLogRepo(): Promise<{ passed: boolean; error?: string }> {
  try {
    // Add logs
    await logRepo.log('info', 'test', 'Test log message');
    await logRepo.log('error', 'test', 'Test error message', { detail: 'test' });

    // Retrieve
    const recent = await logRepo.getRecent(10);
    if (recent.length < 2) {
      return { passed: false, error: 'Failed to retrieve logs' };
    }

    // Clear old logs
    await logRepo.clearOlderThan(Date.now() + 1000);

    return { passed: true };
  } catch (error) {
    return { passed: false, error: String(error) };
  }
}

async function testSettingsRepo(): Promise<{ passed: boolean; error?: string }> {
  try {
    // Get defaults
    const settings = await settingsRepo.get();
    if (!settings.id || settings.id !== 'default') {
      return { passed: false, error: 'Failed to get default settings' };
    }

    // Update
    await settingsRepo.update({ network: 'mainnet' });
    const updated = await settingsRepo.get();
    if (updated.network !== 'mainnet') {
      return { passed: false, error: 'Failed to update settings' };
    }

    // Reset
    await settingsRepo.reset();
    const reset = await settingsRepo.get();
    if (reset.network !== 'testnet') {
      return { passed: false, error: 'Failed to reset settings' };
    }

    return { passed: true };
  } catch (error) {
    return { passed: false, error: String(error) };
  }
}

export interface TestResults {
  wallet: { passed: boolean; error?: string };
  airdrop: { passed: boolean; error?: string };
  vesting: { passed: boolean; error?: string };
  log: { passed: boolean; error?: string };
  settings: { passed: boolean; error?: string };
  allPassed: boolean;
}

/**
 * Run all database tests
 */
export async function runDbTests(): Promise<TestResults> {
  // Ensure clean state
  await deleteDb();

  // Force new connection
  getDb();

  const results: TestResults = {
    wallet: await testWalletRepo(),
    airdrop: await testAirdropRepo(),
    vesting: await testVestingRepo(),
    log: await testLogRepo(),
    settings: await testSettingsRepo(),
    allPassed: false,
  };

  results.allPassed =
    results.wallet.passed &&
    results.airdrop.passed &&
    results.vesting.passed &&
    results.log.passed &&
    results.settings.passed;

  // Cleanup
  await deleteDb();

  return results;
}
