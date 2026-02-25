/**
 * API Router for CashDrop Kit
 *
 * Simple pattern-matching router built on Node.js http module.
 * Routes are matched by method + path pattern.
 * CORS is handled via the dedicated middleware (not inline).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { AuthUser } from '../auth/index.js';
import { authenticateAccessToken, authenticateRequest, getJwtSecret } from '../auth/index.js';
import type { CorsConfig } from '../middleware/cors.js';
import { applyCorsHeaders, handlePreflight, parseCorsConfig } from '../middleware/cors.js';
import { filterSecrets } from '../middleware/secretFilter.js';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  user: AuthUser;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

type RouteHandler = (ctx: RouteContext) => Promise<void>;

interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: Route[] = [];
  private publicPaths = new Set<string>(['/health', '/api/v1']);
  private corsConfig: CorsConfig;

  constructor() {
    this.corsConfig = parseCorsConfig(process.env.CORS_ALLOWED_ORIGINS);
  }

  /**
   * Register a route with optional path parameters (e.g., /api/v1/campaigns/:id).
   */
  add(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_match, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      method: method.toUpperCase(),
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler,
    });
  }

  get(path: string, handler: RouteHandler): void {
    this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add('POST', path, handler);
  }

  put(path: string, handler: RouteHandler): void {
    this.add('PUT', path, handler);
  }

  patch(path: string, handler: RouteHandler): void {
    this.add('PATCH', path, handler);
  }

  delete(path: string, handler: RouteHandler): void {
    this.add('DELETE', path, handler);
  }

  /**
   * Mark a path as public (no auth required).
   */
  public(path: string): void {
    this.publicPaths.add(path);
  }

  /**
   * Handle an incoming HTTP request.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const method = (req.method || 'GET').toUpperCase();
    const pathname = url.pathname;

    // CORS preflight (OPTIONS) — handled by dedicated middleware
    if (handlePreflight(req, res, this.corsConfig)) {
      return;
    }

    // Apply CORS headers for all responses
    applyCorsHeaders(req, res, this.corsConfig);

    // Match route
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      // Extract path params
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });

      // Auth check (skip for public paths)
      if (!this.publicPaths.has(pathname)) {
        const staticAccessToken = process.env.API_ACCESS_TOKEN?.trim();
        let user: AuthUser | null = null;

        if (staticAccessToken) {
          user = authenticateAccessToken(req.headers.authorization, staticAccessToken);
        } else {
          let secret: string;
          try {
            secret = getJwtSecret();
          } catch {
            json(res, 500, {
              error: {
                code: 'AUTH_CONFIG_ERROR',
                message: 'Server auth not configured',
              },
            });
            return;
          }
          user = authenticateRequest(req.headers.authorization, secret);
        }

        if (!user) {
          json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Valid Bearer token required' } });
          return;
        }

        // Parse body for non-GET requests
        let body: unknown = null;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          try {
            body = await parseJsonBody(req);
          } catch {
            json(res, 400, { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
            return;
          }

          // Secret filter
          if (body !== null) {
            const filterResult = filterSecrets(body);
            if (!filterResult.safe) {
              json(res, 400, {
                error: {
                  code: 'SECRET_DETECTED',
                  message: 'Request contains forbidden secret fields',
                  details: { violations: filterResult.violations },
                },
              });
              return;
            }
          }
        }

        try {
          await route.handler({ req, res, user, params, query: url.searchParams, body });
        } catch (err) {
          console.error('Route handler error:', err);
          json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        }
        return;
      }

      // Public path — no auth
      try {
        await route.handler({
          req,
          res,
          user: { userId: 'anonymous' },
          params,
          query: url.searchParams,
          body: null,
        });
      } catch (err) {
        console.error('Route handler error:', err);
        json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
      }
      return;
    }

    // No route matched
    json(res, 404, { error: { code: 'NOT_FOUND', message: `${method} ${pathname} not found` } });
  }
}

// ============================================================================
// Helpers
// ============================================================================

export function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw || raw.trim().length === 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Parse pagination parameters from query string.
 */
export function parsePagination(query: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(query.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.get('pageSize') || '20', 10) || 20));
  return { page, pageSize };
}
