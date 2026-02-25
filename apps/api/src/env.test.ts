import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateEnv } from './env.js';

describe('env validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to minimum valid set
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/cashdropkit',
      SESSION_SECRET: 'a'.repeat(32),
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      ELECTRUM_TESTNET_URL: 'wss://chipnet.imaginary.cash:50004',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns no errors for valid env', () => {
    expect(validateEnv()).toEqual([]);
  });

  it('detects missing DATABASE_URL', () => {
    delete process.env.DATABASE_URL;
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
  });

  it('detects invalid DATABASE_URL format', () => {
    process.env.DATABASE_URL = 'mysql://bad';
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('DATABASE_URL'))).toBe(true);
  });

  it('detects short SESSION_SECRET', () => {
    process.env.SESSION_SECRET = 'too-short';
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('SESSION_SECRET'))).toBe(true);
  });

  it('detects missing SESSION_SECRET', () => {
    delete process.env.SESSION_SECRET;
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('AUTH'))).toBe(true);
  });

  it('allows missing SESSION_SECRET when API_ACCESS_TOKEN is set', () => {
    delete process.env.SESSION_SECRET;
    process.env.API_ACCESS_TOKEN = 'shared-access-token-1234';
    expect(validateEnv()).toEqual([]);
  });

  it('detects invalid ELECTRUM_TESTNET_URL', () => {
    process.env.ELECTRUM_TESTNET_URL = 'http://not-websocket';
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('ELECTRUM_TESTNET_URL'))).toBe(true);
  });

  it('allows optional variables to be missing', () => {
    delete process.env.WORKER_POLL_INTERVAL_MS;
    delete process.env.API_ACCESS_TOKEN;
    expect(validateEnv()).toEqual([]);
  });

  it('validates API_ACCESS_TOKEN minimum length when provided', () => {
    process.env.API_ACCESS_TOKEN = 'short-token';
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('API_ACCESS_TOKEN'))).toBe(true);
  });

  it('validates LOG_LEVEL values', () => {
    process.env.LOG_LEVEL = 'invalid';
    const errors = validateEnv();
    expect(errors.some((e) => e.includes('LOG_LEVEL'))).toBe(true);
  });

  it('accepts valid LOG_LEVEL values', () => {
    process.env.LOG_LEVEL = 'debug';
    expect(validateEnv()).toEqual([]);
  });
});
