/**
 * CashDrop Kit API Server
 *
 * Minimal HTTP server for Railway deployment.
 * Handles campaign CRUD, execution orchestration, and report generation.
 * Secrets (mnemonic/keys) NEVER reach this server.
 */

import { createServer } from 'node:http';

import { assertEnv, getEnvConfig } from './env.js';
import {
  createCampaign,
  createVestingCampaign,
  deleteCampaign,
  getCampaign,
  getVestingCampaign,
  listCampaigns,
  listVestingCampaigns,
  updateCampaign,
} from './routes/campaigns.js';
import { Router, json } from './routes/router.js';

// ============================================================================
// Fail-fast env validation — process exits immediately on missing vars
// ============================================================================

assertEnv();

const envConfig = getEnvConfig();
const PORT = envConfig.PORT;
const HOST = envConfig.HOST;

// ============================================================================
// Router Setup
// ============================================================================

const router = new Router();

// Public routes (no auth required)
router.public('/health');
router.public('/api/v1');

router.get('/health', async (ctx) => {
  json(ctx.res, 200, {
    status: 'ok',
    service: '@cashdropkit/api',
    version: '0.1.0',
    uptime: process.uptime(),
  });
});

router.get('/api/v1', async (ctx) => {
  json(ctx.res, 200, {
    version: '0.1.0',
    endpoints: {
      health: 'GET /health',
      campaigns: {
        list: 'GET /api/v1/campaigns',
        get: 'GET /api/v1/campaigns/:id',
        create: 'POST /api/v1/campaigns',
        update: 'PATCH /api/v1/campaigns/:id',
        delete: 'DELETE /api/v1/campaigns/:id',
      },
      vesting: {
        list: 'GET /api/v1/vesting',
        get: 'GET /api/v1/vesting/:id',
        create: 'POST /api/v1/vesting',
      },
    },
  });
});

// Airdrop campaign routes
router.get('/api/v1/campaigns', listCampaigns);
router.get('/api/v1/campaigns/:id', getCampaign);
router.post('/api/v1/campaigns', createCampaign);
router.patch('/api/v1/campaigns/:id', updateCampaign);
router.delete('/api/v1/campaigns/:id', deleteCampaign);

// Vesting campaign routes
router.get('/api/v1/vesting', listVestingCampaigns);
router.get('/api/v1/vesting/:id', getVestingCampaign);
router.post('/api/v1/vesting', createVestingCampaign);

// ============================================================================
// Server
// ============================================================================

const server = createServer((req, res) => {
  router.handle(req, res).catch((err) => {
    console.error('Unhandled error:', err);
    json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`@cashdropkit/api listening on http://${HOST}:${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  const authMode = process.env.API_ACCESS_TOKEN ? 'shared-token' : 'jwt';
  console.log(`Auth mode: ${authMode}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => process.exit(0));
});
