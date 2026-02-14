/**
 * CORS Middleware
 *
 * Handles cross-origin requests between Vercel FE and Railway API.
 * Supports configurable origin allowlist, credential handling, and preflight caching.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CorsConfig {
  /** Allowed origins (comma-separated string or array) */
  allowedOrigins: string[];
  /** Allow credentials (cookies, authorization headers) */
  credentials: boolean;
  /** Allowed HTTP methods */
  methods: string[];
  /** Allowed request headers */
  allowedHeaders: string[];
  /** Headers exposed to the browser */
  exposedHeaders: string[];
  /** Preflight cache duration in seconds */
  maxAge: number;
}

const DEFAULT_CORS_CONFIG: CorsConfig = {
  allowedOrigins: ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-Total-Count'],
  maxAge: 86400, // 24 hours
};

/**
 * Parse CORS_ALLOWED_ORIGINS env var into config.
 */
export function parseCorsConfig(envOrigins?: string): CorsConfig {
  const config = { ...DEFAULT_CORS_CONFIG };

  if (envOrigins && envOrigins !== '*') {
    config.allowedOrigins = envOrigins
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
  }

  return config;
}

/**
 * Check if the request origin is allowed.
 */
export function isOriginAllowed(origin: string | undefined, config: CorsConfig): boolean {
  if (!origin) return false;
  if (config.allowedOrigins.includes('*')) return true;
  return config.allowedOrigins.includes(origin);
}

/**
 * Apply CORS headers to the response.
 */
export function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  config: CorsConfig,
): void {
  const origin = req.headers.origin;

  // Only set Access-Control-Allow-Origin if origin is allowed
  if (origin && isOriginAllowed(origin, config)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (config.allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (config.credentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', config.methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', String(config.maxAge));
}

/**
 * Handle CORS preflight (OPTIONS) request.
 * Returns true if the request was a preflight and has been handled.
 */
export function handlePreflight(
  req: IncomingMessage,
  res: ServerResponse,
  config: CorsConfig,
): boolean {
  if (req.method !== 'OPTIONS') return false;

  applyCorsHeaders(req, res, config);
  res.writeHead(204);
  res.end();
  return true;
}
