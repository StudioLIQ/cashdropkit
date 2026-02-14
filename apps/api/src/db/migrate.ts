/**
 * Migration runner for CashDrop Kit API
 *
 * Runs Drizzle migrations from the migrations directory.
 * Called automatically at server startup and can be run standalone:
 *   pnpm --filter @cashdropkit/api migrate
 */

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { closePool, getDb } from './connection.js';

export async function runMigrations(): Promise<void> {
  const db = getDb();

  console.log('Running database migrations...');

  try {
    await migrate(db, {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    });
    console.log('Migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run standalone if executed directly
const isDirectRun = process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js');

if (isDirectRun) {
  runMigrations()
    .then(() => {
      console.log('Migration script completed.');
      return closePool();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration script failed:', err);
      process.exit(1);
    });
}
