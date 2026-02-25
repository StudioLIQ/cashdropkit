/**
 * Confirmation Worker — Standalone Entrypoint
 *
 * Runs as an independent Railway service.
 * Polls for SENT transactions and updates their status
 * (CONFIRMED / DROPPED) in the database.
 *
 * Start: node --import tsx src/worker/main.ts
 * Railway service command: pnpm start:worker
 */

import { and, eq, sql } from 'drizzle-orm';

import { assertEnv, getEnvConfig } from '../env.js';
import { closePool, getDb } from '../db/index.js';
import { airdropCampaigns, vestingCampaigns } from '../db/schema.js';

import { ConfirmationWorker } from './confirmationWorker.js';
import type { TxCheckJob, TxStatusProvider, TxStatusResult } from './confirmationWorker.js';

// ============================================================================
// Fail-fast env validation
// ============================================================================

assertEnv();

const config = getEnvConfig();

// ============================================================================
// Heartbeat / health logging
// ============================================================================

const HEARTBEAT_INTERVAL_MS = 60_000; // Log heartbeat every 60s
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function logHeartbeat(worker: ConfirmationWorker): void {
  const state = worker.getState();
  console.log(
    `[worker:heartbeat] running=${state.isRunning} pending=${state.pendingJobs} ` +
    `completed=${state.completedJobs} failed=${state.failedJobs} ` +
    `deadLetter=${state.deadLetterCount} backoff=${state.currentBackoffMs}ms ` +
    `lastPoll=${state.lastPollAt ? new Date(state.lastPollAt).toISOString() : 'never'}`,
  );
}

// ============================================================================
// Stub TxStatusProvider (uses Electrum endpoint from env)
// ============================================================================

/**
 * Minimal Electrum-over-WebSocket provider for tx status checks.
 * In production this should be replaced with a proper Electrum client;
 * for now we use a simple HTTP/JSON-RPC approach or direct ws.
 */
function createTxStatusProvider(): TxStatusProvider {
  return {
    async getTxStatus(txid: string): Promise<TxStatusResult> {
      // For MVP, use a simple fetch to the Electrum server
      // Most Electrum servers expose blockchain.transaction.get over JSON-RPC
      try {
        const url = config.ELECTRUM_MAINNET_URL;
        if (!url) {
          return { status: 'error', error: 'No Electrum URL configured' };
        }

        // Use a lightweight approach: try to get the tx
        // If the server is WebSocket-only, we need a different approach
        // For Railway worker, we can do a simple check via the db state
        // The worker's primary job is to scan campaigns for SENT txids
        // and verify them against the chain

        // Placeholder: in production, implement actual Electrum WS client
        // For now, return not_found so the worker logs properly
        console.log(`[worker:provider] Checking tx ${txid.substring(0, 16)}...`);
        return { status: 'not_found' };
      } catch (err) {
        return {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

// ============================================================================
// Job scanner — reads SENT transactions from the database
// ============================================================================

async function getSentTransactionJobs(): Promise<TxCheckJob[]> {
  const db = getDb();
  const jobs: TxCheckJob[] = [];

  // Scan airdrop campaigns with RUNNING or PAUSED execution that have SENT batches
  const airdropRows = await db
    .select({
      id: airdropCampaigns.id,
      plan: airdropCampaigns.plan,
      execution: airdropCampaigns.execution,
    })
    .from(airdropCampaigns)
    .where(
      sql`${airdropCampaigns.execution}->>'state' IN ('RUNNING', 'PAUSED', 'FAILED')`,
    );

  for (const row of airdropRows) {
    const exec = row.execution as Record<string, unknown> | null;
    const plan = row.plan as Record<string, unknown> | null;
    if (!exec || !plan) continue;

    const confirmations = (exec.confirmations ?? {}) as Record<string, { status: string; firstSeenAt?: number }>;
    const batches = ((plan as Record<string, unknown>).batches ?? []) as Array<{ id: string; txid?: string }>;

    for (const batch of batches) {
      if (!batch.txid) continue;
      const conf = confirmations[batch.txid];

      // Only check if not yet CONFIRMED or DROPPED
      if (conf?.status === 'CONFIRMED' || conf?.status === 'DROPPED') continue;

      jobs.push({
        txid: batch.txid,
        campaignId: row.id,
        campaignType: 'airdrop',
        firstSeenAt: conf?.firstSeenAt ?? Date.now(),
        retryCount: 0,
      });
    }
  }

  // Scan vesting campaigns similarly
  const vestingRows = await db
    .select({
      id: vestingCampaigns.id,
      plan: vestingCampaigns.plan,
      execution: vestingCampaigns.execution,
    })
    .from(vestingCampaigns)
    .where(
      sql`${vestingCampaigns.execution}->>'state' IN ('RUNNING', 'PAUSED', 'FAILED')`,
    );

  for (const row of vestingRows) {
    const exec = row.execution as Record<string, unknown> | null;
    if (!exec) continue;

    const confirmations = (exec.confirmations ?? {}) as Record<string, { status: string; firstSeenAt?: number }>;

    // Vesting txids are in beneficiaries → tranches → lockbox.txid
    const beneficiaries = ((row as Record<string, unknown>).beneficiaries ?? []) as Array<{
      tranches?: Array<{ lockbox?: { txid?: string } }>;
    }>;

    for (const ben of beneficiaries) {
      for (const tranche of ben.tranches ?? []) {
        const txid = tranche.lockbox?.txid;
        if (!txid) continue;
        const conf = confirmations[txid];
        if (conf?.status === 'CONFIRMED' || conf?.status === 'DROPPED') continue;

        jobs.push({
          txid,
          campaignId: row.id,
          campaignType: 'vesting',
          firstSeenAt: conf?.firstSeenAt ?? Date.now(),
          retryCount: 0,
        });
      }
    }
  }

  return jobs;
}

// ============================================================================
// Persistence callbacks
// ============================================================================

async function onConfirmed(job: TxCheckJob, confirmations: number): Promise<void> {
  console.log(
    `[worker:confirmed] txid=${job.txid.substring(0, 16)}... ` +
    `campaign=${job.campaignId} type=${job.campaignType} confirmations=${confirmations}`,
  );

  const db = getDb();
  const table = job.campaignType === 'airdrop' ? airdropCampaigns : vestingCampaigns;

  // Update the confirmations object in the execution JSONB
  await db
    .update(table)
    .set({
      execution: sql`jsonb_set(
        COALESCE(${table.execution}, '{}'),
        '{confirmations,${sql.raw(job.txid)}}',
        ${JSON.stringify({ status: 'CONFIRMED', confirmations, lastCheckedAt: Date.now() })}::jsonb
      )`,
      updatedAt: new Date(),
    } as Record<string, unknown>)
    .where(eq(table.id, job.campaignId));
}

async function onDropped(job: TxCheckJob): Promise<void> {
  console.log(
    `[worker:dropped] txid=${job.txid.substring(0, 16)}... ` +
    `campaign=${job.campaignId} type=${job.campaignType}`,
  );

  const db = getDb();
  const table = job.campaignType === 'airdrop' ? airdropCampaigns : vestingCampaigns;

  await db
    .update(table)
    .set({
      execution: sql`jsonb_set(
        COALESCE(${table.execution}, '{}'),
        '{confirmations,${sql.raw(job.txid)}}',
        ${JSON.stringify({ status: 'DROPPED', lastCheckedAt: Date.now() })}::jsonb
      )`,
      updatedAt: new Date(),
    } as Record<string, unknown>)
    .where(eq(table.id, job.campaignId));
}

async function onDeadLetter(job: TxCheckJob): Promise<void> {
  console.error(
    `[worker:dead-letter] txid=${job.txid.substring(0, 16)}... ` +
    `campaign=${job.campaignId} retries=${job.retryCount} lastError=${job.lastError}`,
  );
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('========================================');
  console.log('@cashdropkit/worker starting...');
  console.log(`  poll interval: ${config.WORKER_POLL_INTERVAL_MS}ms`);
  console.log(`  dropped threshold: ${config.WORKER_DROPPED_THRESHOLD_MS}ms`);
  console.log(`  log level: ${config.LOG_LEVEL}`);
  console.log('========================================');

  const provider = createTxStatusProvider();
  const worker = new ConfirmationWorker(
    provider,
    {
      pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
      droppedThresholdMs: config.WORKER_DROPPED_THRESHOLD_MS,
    },
    {
      onConfirmed,
      onDropped,
      onDeadLetter,
    },
  );

  // Start heartbeat
  heartbeatTimer = setInterval(() => logHeartbeat(worker), HEARTBEAT_INTERVAL_MS);

  // Start worker
  worker.start(getSentTransactionJobs);
  console.log('[worker] Polling started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, stopping...`);
    worker.stop();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await closePool();
    console.log('[worker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] Fatal error:', err);
  process.exit(1);
});
