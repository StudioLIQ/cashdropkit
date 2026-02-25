import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it } from 'vitest';

import { applyCorsHeaders, isOriginAllowed, parseCorsConfig } from './cors.js';

function mockReqRes(origin?: string) {
  const headers: Record<string, string | undefined> = {};
  const req = { headers: { origin }, method: 'GET' } as unknown as IncomingMessage;
  const res = {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    getHeader: (key: string) => headers[key],
  } as unknown as ServerResponse;
  return { req, res, headers };
}

describe('CORS middleware', () => {
  describe('parseCorsConfig', () => {
    it('defaults to wildcard when no env set', () => {
      const config = parseCorsConfig(undefined);
      expect(config.allowedOrigins).toEqual(['*']);
    });

    it('defaults to wildcard for * value', () => {
      const config = parseCorsConfig('*');
      expect(config.allowedOrigins).toEqual(['*']);
    });

    it('parses comma-separated origins', () => {
      const config = parseCorsConfig('http://localhost:3000,https://cashdropkit.com');
      expect(config.allowedOrigins).toEqual(['http://localhost:3000', 'https://cashdropkit.com']);
    });

    it('trims whitespace from origins', () => {
      const config = parseCorsConfig('  http://a.com , http://b.com  ');
      expect(config.allowedOrigins).toEqual(['http://a.com', 'http://b.com']);
    });

    it('filters empty values', () => {
      const config = parseCorsConfig('http://a.com,,http://b.com,');
      expect(config.allowedOrigins).toEqual(['http://a.com', 'http://b.com']);
    });

    it('enables credentials for explicit allowlist', () => {
      const config = parseCorsConfig('http://localhost:3000');
      expect(config.credentials).toBe(true);
    });

    it('disables credentials for wildcard', () => {
      const config = parseCorsConfig('*');
      expect(config.credentials).toBe(false);
    });
  });

  describe('isOriginAllowed', () => {
    it('allows any origin with wildcard', () => {
      const config = parseCorsConfig('*');
      expect(isOriginAllowed('http://evil.com', config)).toBe(true);
    });

    it('allows listed origin', () => {
      const config = parseCorsConfig('http://localhost:3000,https://cashdropkit.com');
      expect(isOriginAllowed('http://localhost:3000', config)).toBe(true);
      expect(isOriginAllowed('https://cashdropkit.com', config)).toBe(true);
    });

    it('rejects unlisted origin', () => {
      const config = parseCorsConfig('http://localhost:3000');
      expect(isOriginAllowed('http://evil.com', config)).toBe(false);
    });

    it('rejects undefined origin', () => {
      const config = parseCorsConfig('http://localhost:3000');
      expect(isOriginAllowed(undefined, config)).toBe(false);
    });

    it('is case-sensitive for origins', () => {
      const config = parseCorsConfig('http://localhost:3000');
      expect(isOriginAllowed('HTTP://LOCALHOST:3000', config)).toBe(false);
    });
  });

  describe('applyCorsHeaders', () => {
    it('reflects allowed origin and sets Vary: Origin', () => {
      const config = parseCorsConfig('http://localhost:3000');
      const { req, res, headers } = mockReqRes('http://localhost:3000');
      applyCorsHeaders(req, res, config);

      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
      expect(headers['Vary']).toBe('Origin');
      expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    });

    it('does NOT set ACAO for disallowed origin', () => {
      const config = parseCorsConfig('http://localhost:3000');
      const { req, res, headers } = mockReqRes('http://evil.com');
      applyCorsHeaders(req, res, config);

      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('uses * for wildcard mode without Vary', () => {
      const config = parseCorsConfig('*');
      const { req, res, headers } = mockReqRes('http://any.com');
      applyCorsHeaders(req, res, config);

      expect(headers['Access-Control-Allow-Origin']).toBe('*');
      expect(headers['Vary']).toBeUndefined();
      expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
    });

    it('does not set credentials with wildcard origin', () => {
      const config = parseCorsConfig('*');
      const { req, res, headers } = mockReqRes('http://any.com');
      applyCorsHeaders(req, res, config);

      expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
    });

    it('always sets methods, headers, expose, max-age', () => {
      const config = parseCorsConfig('http://localhost:3000');
      const { req, res, headers } = mockReqRes('http://localhost:3000');
      applyCorsHeaders(req, res, config);

      expect(headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(headers['Access-Control-Max-Age']).toBe('86400');
    });
  });
});
