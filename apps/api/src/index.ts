/**
 * CashDrop Kit API Server
 *
 * Minimal HTTP server for Railway deployment.
 * Handles campaign CRUD, execution orchestration, and report generation.
 * Secrets (mnemonic/keys) NEVER reach this server.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Health check
  if (url.pathname === '/health' && req.method === 'GET') {
    json(res, 200, {
      status: 'ok',
      service: '@cashdropkit/api',
      version: '0.1.0',
      uptime: process.uptime(),
    });
    return;
  }

  // API version
  if (url.pathname === '/api/v1' && req.method === 'GET') {
    json(res, 200, {
      version: '0.1.0',
      endpoints: ['/health', '/api/v1'],
    });
    return;
  }

  // 404 for everything else
  json(res, 404, { error: 'Not Found', path: url.pathname });
}

const server = createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log(`@cashdropkit/api listening on http://${HOST}:${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
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
