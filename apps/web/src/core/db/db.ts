import Dexie, { type EntityTable } from 'dexie';

import type {
  AirdropCampaign,
  AppSettings,
  LogEntry,
  TokenMetadataCache,
  VestingCampaign,
  Wallet,
} from './types';

/**
 * CashDrop Kit Database
 *
 * Uses Dexie.js for IndexedDB persistence.
 * Schema versioning supports migrations.
 */
export class CashDropDatabase extends Dexie {
  wallets!: EntityTable<Wallet, 'id'>;
  airdropCampaigns!: EntityTable<AirdropCampaign, 'id'>;
  vestingCampaigns!: EntityTable<VestingCampaign, 'id'>;
  logs!: EntityTable<LogEntry, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  tokenMetadata!: EntityTable<TokenMetadataCache, 'id'>;

  constructor() {
    super('CashDropKit');

    // Version 1: Initial schema
    this.version(1).stores({
      // Wallets: indexed by id, name, network
      wallets: 'id, name, network, createdAt, type',

      // Airdrop campaigns: indexed by id, name, network, status
      airdropCampaigns: 'id, name, network, createdAt, updatedAt, [execution.state]',

      // Vesting campaigns: indexed by id, name, network
      vestingCampaigns: 'id, name, network, createdAt, updatedAt',

      // Logs: auto-increment id, indexed by timestamp, level, category, campaignId
      logs: '++id, timestamp, level, category, campaignId',

      // Settings: single row with id='default'
      settings: 'id',
    });

    // Version 2: Add token metadata cache
    this.version(2).stores({
      // Keep existing tables unchanged
      wallets: 'id, name, network, createdAt, type',
      airdropCampaigns: 'id, name, network, createdAt, updatedAt, [execution.state]',
      vestingCampaigns: 'id, name, network, createdAt, updatedAt',
      logs: '++id, timestamp, level, category, campaignId',
      settings: 'id',

      // New: Token metadata cache
      // id = tokenId:network composite key
      tokenMetadata: 'id, tokenId, network, symbol, fetchedAt, expiresAt',
    });

    // Type mappings for TypeScript
    this.wallets.mapToClass(Object as unknown as new () => Wallet);
    this.airdropCampaigns.mapToClass(Object as unknown as new () => AirdropCampaign);
    this.vestingCampaigns.mapToClass(Object as unknown as new () => VestingCampaign);
    this.logs.mapToClass(Object as unknown as new () => LogEntry);
    this.settings.mapToClass(Object as unknown as new () => AppSettings);
    this.tokenMetadata.mapToClass(Object as unknown as new () => TokenMetadataCache);
  }
}

// Singleton instance
let dbInstance: CashDropDatabase | null = null;

/**
 * Get the database instance (singleton)
 */
export function getDb(): CashDropDatabase {
  if (!dbInstance) {
    dbInstance = new CashDropDatabase();
  }
  return dbInstance;
}

/**
 * Close and reset the database instance
 * Useful for testing or clearing state
 */
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Delete the entire database
 * WARNING: This is destructive and cannot be undone
 */
export async function deleteDb(): Promise<void> {
  await closeDb();
  await Dexie.delete('CashDropKit');
}
