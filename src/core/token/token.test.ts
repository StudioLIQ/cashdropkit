/**
 * Tests for token metadata service
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TokenService, getTokenService, resetTokenService } from './tokenService';
import { isValidTokenCategory, normalizeTokenId } from './types';

// Mock the database repository
vi.mock('../db', () => ({
  tokenMetadataRepo: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getAllByNetwork: vi.fn().mockResolvedValue([]),
    clearExpired: vi.fn().mockResolvedValue(0),
    clearAll: vi.fn().mockResolvedValue(undefined),
    searchBySymbol: vi.fn().mockResolvedValue([]),
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample valid token ID (64 hex characters)
const VALID_TOKEN_ID = 'a'.repeat(64);
const VALID_TOKEN_ID_MIXED_CASE = 'AbCdEf'.padEnd(64, '0');
const INVALID_TOKEN_ID_SHORT = 'abc123';
const INVALID_TOKEN_ID_NON_HEX = 'g'.repeat(64);

// Sample BCMR registry response
const MOCK_BCMR_REGISTRY = {
  $schema: 'https://cashtokens.org/bcmr-v2.schema.json',
  version: { major: 2, minor: 0, patch: 0 },
  identities: {
    [VALID_TOKEN_ID]: {
      '2024-01-01T00:00:00.000Z': {
        name: 'Test Token',
        description: 'A test token',
        token: {
          symbol: 'TEST',
          decimals: 8,
          category: VALID_TOKEN_ID,
        },
        uris: {
          icon: 'https://example.com/icon.png',
          web: 'https://example.com',
        },
      },
    },
  },
};

// Sample OTR response
const MOCK_OTR_TOKENS = [
  {
    id: VALID_TOKEN_ID,
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 8,
    icon: 'https://example.com/icon.png',
    verified: true,
  },
];

describe('isValidTokenCategory', () => {
  it('returns true for valid 64 hex character string', () => {
    expect(isValidTokenCategory(VALID_TOKEN_ID)).toBe(true);
  });

  it('returns true for mixed case hex', () => {
    expect(isValidTokenCategory(VALID_TOKEN_ID_MIXED_CASE)).toBe(true);
  });

  it('returns false for short string', () => {
    expect(isValidTokenCategory(INVALID_TOKEN_ID_SHORT)).toBe(false);
  });

  it('returns false for non-hex characters', () => {
    expect(isValidTokenCategory(INVALID_TOKEN_ID_NON_HEX)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidTokenCategory('')).toBe(false);
  });

  it('returns false for 65 character string', () => {
    expect(isValidTokenCategory('a'.repeat(65))).toBe(false);
  });
});

describe('normalizeTokenId', () => {
  it('converts to lowercase', () => {
    expect(normalizeTokenId('ABCDEF')).toBe('abcdef');
  });

  it('trims whitespace', () => {
    expect(normalizeTokenId('  abc123  ')).toBe('abc123');
  });

  it('handles already normalized input', () => {
    expect(normalizeTokenId('abc123')).toBe('abc123');
  });
});

describe('TokenService', () => {
  beforeEach(() => {
    resetTokenService();
    mockFetch.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTokenService();
  });

  describe('constructor', () => {
    it('creates service with default config', () => {
      const service = new TokenService({ network: 'mainnet' });
      expect(service).toBeInstanceOf(TokenService);
    });

    it('creates service with custom config', () => {
      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://custom.bcmr.com/registry.json'],
        otrUrls: ['https://custom.otr.com/tokens'],
        timeoutMs: 5000,
        cacheTtlMs: 3600000,
      });
      expect(service).toBeInstanceOf(TokenService);
    });
  });

  describe('lookupToken', () => {
    it('returns error for invalid token ID', async () => {
      const service = new TokenService({ network: 'mainnet' });
      const result = await service.lookupToken(INVALID_TOKEN_ID_SHORT);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token ID format');
      expect(result.requiresManualDecimals).toBe(true);
    });

    it('fetches from BCMR registry and returns metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_BCMR_REGISTRY,
      });

      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://test.bcmr.com/registry.json'],
        otrUrls: [],
      });

      const result = await service.lookupToken(VALID_TOKEN_ID);

      expect(result.success).toBe(true);
      expect(result.hasMetadata).toBe(true);
      expect(result.source).toBe('bcmr');
      expect(result.token.symbol).toBe('TEST');
      expect(result.token.name).toBe('Test Token');
      expect(result.token.decimals).toBe(8);
      expect(result.token.iconUrl).toBe('https://example.com/icon.png');
      expect(result.token.verified).toBe(true);
      expect(result.requiresManualDecimals).toBe(false);
    });

    it('falls back to OTR when BCMR fails', async () => {
      // BCMR fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      // OTR succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_OTR_TOKENS,
      });

      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://test.bcmr.com/registry.json'],
        otrUrls: ['https://test.otr.com/tokens'],
      });

      const result = await service.lookupToken(VALID_TOKEN_ID);

      expect(result.success).toBe(true);
      expect(result.source).toBe('otr');
      expect(result.token.symbol).toBe('TEST');
      expect(result.token.decimals).toBe(8);
    });

    it('returns requiresManualDecimals when no metadata found', async () => {
      // Both registries return empty
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ identities: {} }),
      });

      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://test.bcmr.com/registry.json'],
        otrUrls: [],
      });

      const result = await service.lookupToken(VALID_TOKEN_ID);

      expect(result.success).toBe(true);
      expect(result.hasMetadata).toBe(false);
      expect(result.requiresManualDecimals).toBe(true);
      // When no metadata found from any source, source is 'unknown'
      expect(result.source).toBe('unknown');
    });

    it('normalizes token ID to lowercase', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_BCMR_REGISTRY,
      });

      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://test.bcmr.com/registry.json'],
        otrUrls: [],
      });

      const result = await service.lookupToken(VALID_TOKEN_ID.toUpperCase());

      expect(result.token.tokenId).toBe(VALID_TOKEN_ID.toLowerCase());
    });

    it('handles HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://test.bcmr.com/registry.json'],
        otrUrls: ['https://test.otr.com/tokens'],
      });

      const result = await service.lookupToken(VALID_TOKEN_ID);

      // Should still succeed but with no metadata
      expect(result.success).toBe(true);
      expect(result.hasMetadata).toBe(false);
      expect(result.requiresManualDecimals).toBe(true);
    });

    it('handles timeout errors', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));

      const service = new TokenService({
        network: 'mainnet',
        bcmrUrls: ['https://test.bcmr.com/registry.json'],
        otrUrls: [],
      });

      const result = await service.lookupToken(VALID_TOKEN_ID);

      expect(result.success).toBe(true);
      expect(result.hasMetadata).toBe(false);
    });
  });

  describe('setManualMetadata', () => {
    it('stores manual metadata', async () => {
      const service = new TokenService({ network: 'mainnet' });

      const result = await service.setManualMetadata(VALID_TOKEN_ID, {
        symbol: 'CUSTOM',
        name: 'Custom Token',
        decimals: 6,
      });

      expect(result.success).toBe(true);
      expect(result.source).toBe('manual');
      expect(result.token.symbol).toBe('CUSTOM');
      expect(result.token.decimals).toBe(6);
      expect(result.requiresManualDecimals).toBe(false);
    });

    it('returns error for invalid token ID', async () => {
      const service = new TokenService({ network: 'mainnet' });

      const result = await service.setManualMetadata(INVALID_TOKEN_ID_SHORT, {
        decimals: 8,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid token ID format');
    });

    it('normalizes token ID in result', async () => {
      const service = new TokenService({ network: 'mainnet' });

      const result = await service.setManualMetadata(VALID_TOKEN_ID.toUpperCase(), {
        decimals: 4,
      });

      expect(result.success).toBe(true);
      expect(result.token.tokenId).toBe(VALID_TOKEN_ID.toLowerCase());
    });
  });

  describe('setNetwork', () => {
    it('updates network configuration', () => {
      const service = new TokenService({ network: 'mainnet' });

      // Should not throw
      expect(() => service.setNetwork('testnet')).not.toThrow();
    });
  });
});

describe('getTokenService', () => {
  beforeEach(() => {
    resetTokenService();
  });

  afterEach(() => {
    resetTokenService();
  });

  it('returns singleton instance', () => {
    const service1 = getTokenService('mainnet');
    const service2 = getTokenService('mainnet');
    expect(service1).toBe(service2);
  });

  it('updates network on existing instance', () => {
    const service1 = getTokenService('mainnet');
    const service2 = getTokenService('testnet');
    expect(service1).toBe(service2);
  });
});
