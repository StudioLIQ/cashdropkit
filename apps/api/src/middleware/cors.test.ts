import { describe, expect, it } from 'vitest';

import { isOriginAllowed, parseCorsConfig } from './cors.js';

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
});
