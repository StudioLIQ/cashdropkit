/**
 * Repository Provider
 *
 * Selects the correct repository implementation:
 * - If API client is initialized → use API adapters (for hosted mode)
 * - Otherwise → use Dexie adapters (local-first mode)
 *
 * Wallet, Settings, and TokenMetadata always use Dexie (browser-only).
 * Encrypted mnemonics/keys NEVER leave the browser.
 */
import { isApiAvailable } from './apiClient';
import { apiAirdropRepo, apiLogRepo, apiVestingRepo } from './apiRepositories';
import type {
  AirdropRepository,
  LogRepository,
  RepositoryRegistry,
  SettingsRepository,
  TokenMetadataRepository,
  VestingRepository,
  WalletRepository,
} from './ports';
import {
  airdropRepo as dexieAirdropRepo,
  logRepo as dexieLogRepo,
  settingsRepo as dexieSettingsRepo,
  tokenMetadataRepo as dexieTokenMetadataRepo,
  vestingRepo as dexieVestingRepo,
  walletRepo as dexieWalletRepo,
} from './repositories';

/**
 * Get the airdrop repository (API or Dexie).
 */
export function getAirdropRepo(): AirdropRepository {
  return isApiAvailable() ? apiAirdropRepo : dexieAirdropRepo;
}

/**
 * Get the vesting repository (API or Dexie).
 */
export function getVestingRepo(): VestingRepository {
  return isApiAvailable() ? apiVestingRepo : dexieVestingRepo;
}

/**
 * Get the log repository (API or Dexie).
 */
export function getLogRepo(): LogRepository {
  return isApiAvailable() ? apiLogRepo : dexieLogRepo;
}

/**
 * Wallet repository — always local (Dexie).
 * Encrypted mnemonics MUST stay in the browser.
 */
export function getWalletRepo(): WalletRepository {
  return dexieWalletRepo;
}

/**
 * Settings repository — always local (Dexie).
 */
export function getSettingsRepo(): SettingsRepository {
  return dexieSettingsRepo;
}

/**
 * Token metadata cache — always local (Dexie).
 */
export function getTokenMetadataRepo(): TokenMetadataRepository {
  return dexieTokenMetadataRepo;
}

/**
 * Get a full RepositoryRegistry based on current mode.
 */
export function getRepositoryRegistry(): RepositoryRegistry {
  return {
    wallet: getWalletRepo(),
    airdrop: getAirdropRepo(),
    vesting: getVestingRepo(),
    log: getLogRepo(),
    settings: getSettingsRepo(),
    tokenMetadata: getTokenMetadataRepo(),
  };
}
