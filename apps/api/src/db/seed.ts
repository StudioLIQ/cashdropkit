/**
 * Database seed script for CashDrop Kit API
 *
 * Creates default settings and sample data for development.
 * Run with: pnpm --filter @cashdropkit/api seed
 */

import { closePool, getDb } from './connection.js';
import { appSettings } from './schema.js';

export async function seed(): Promise<void> {
  const db = getDb();

  console.log('Seeding database...');

  // Insert default settings (upsert)
  await db
    .insert(appSettings)
    .values({
      id: 'default',
      userId: 'system',
      network: 'testnet',
      autoLockMinutes: 15,
      requirePasswordForSigning: true,
      defaultFeeRateSatPerByte: 1,
      defaultDustSatPerOutput: 546,
      defaultMaxOutputsPerTx: 80,
    })
    .onConflictDoNothing();

  console.log('Seed completed.');
}

// Run standalone
const isDirectRun = process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js');

if (isDirectRun) {
  seed()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
