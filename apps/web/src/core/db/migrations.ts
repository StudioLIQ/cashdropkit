/**
 * Database Migration Strategy
 *
 * CashDrop Kit uses Dexie's built-in versioning for schema migrations.
 *
 * MIGRATION RULES:
 * 1. Never delete or rename existing indexed fields in production
 * 2. Add new versions for schema changes
 * 3. Use upgrade functions for data transformations
 * 4. Test migrations with existing data before release
 *
 * ADDING A NEW VERSION:
 * In db.ts, add a new version block:
 *
 * this.version(2).stores({
 *   // Updated schema
 * }).upgrade(tx => {
 *   // Data migration logic
 * });
 *
 * VERSION HISTORY:
 * - v1: Initial schema (wallets, airdropCampaigns, vestingCampaigns, logs, settings)
 */
import { getDb } from './db';

/**
 * Check current database version
 */
export async function getCurrentVersion(): Promise<number> {
  const db = getDb();
  return db.verno;
}

/**
 * Verify database is accessible and at expected version
 */
export async function verifyDatabase(): Promise<{
  ok: boolean;
  version: number;
  error?: string;
}> {
  try {
    const db = getDb();
    await db.open();
    return {
      ok: true,
      version: db.verno,
    };
  } catch (error) {
    return {
      ok: false,
      version: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Export all data from the database
 * Useful for backup before migrations or for debugging
 */
export async function exportAllData(): Promise<{
  version: number;
  exportedAt: number;
  data: {
    wallets: unknown[];
    airdropCampaigns: unknown[];
    vestingCampaigns: unknown[];
    logs: unknown[];
    settings: unknown[];
  };
}> {
  const db = getDb();

  const [wallets, airdropCampaigns, vestingCampaigns, logs, settings] = await Promise.all([
    db.wallets.toArray(),
    db.airdropCampaigns.toArray(),
    db.vestingCampaigns.toArray(),
    db.logs.toArray(),
    db.settings.toArray(),
  ]);

  return {
    version: db.verno,
    exportedAt: Date.now(),
    data: {
      wallets,
      airdropCampaigns,
      vestingCampaigns,
      logs,
      settings,
    },
  };
}

/**
 * Get database statistics
 */
export async function getDbStats(): Promise<{
  version: number;
  counts: {
    wallets: number;
    airdropCampaigns: number;
    vestingCampaigns: number;
    logs: number;
  };
}> {
  const db = getDb();

  const [wallets, airdropCampaigns, vestingCampaigns, logs] = await Promise.all([
    db.wallets.count(),
    db.airdropCampaigns.count(),
    db.vestingCampaigns.count(),
    db.logs.count(),
  ]);

  return {
    version: db.verno,
    counts: {
      wallets,
      airdropCampaigns,
      vestingCampaigns,
      logs,
    },
  };
}
