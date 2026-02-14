import { describe, expect, it } from 'vitest';

import {
  computeChecksum,
  getContractEntry,
  loadManifest,
  validateChainId,
  validateManifest,
  verifyChecksum,
} from './index.js';

describe('contract registry', () => {
  describe('loadManifest', () => {
    it('loads mainnet manifest', () => {
      const manifest = loadManifest('mainnet');
      expect(manifest.version).toBe('1.0.0');
      expect(Object.keys(manifest.entries).length).toBeGreaterThan(0);
    });

    it('loads testnet manifest', () => {
      const manifest = loadManifest('testnet');
      expect(manifest.version).toBe('1.0.0');
    });

    it('throws for unknown network', () => {
      expect(() => loadManifest('regtest')).toThrow('Unknown network');
    });
  });

  describe('getContractEntry', () => {
    it('returns electrum entry', () => {
      const entry = getContractEntry('mainnet', 'electrum-primary');
      expect(entry.name).toBe('Electrum Primary');
      expect(entry.chainId).toBe('mainnet');
    });

    it('throws for unknown entry', () => {
      expect(() => getContractEntry('mainnet', 'nonexistent')).toThrow('not found');
    });
  });

  describe('checksum', () => {
    it('computes deterministic checksum', () => {
      const entry = getContractEntry('mainnet', 'electrum-primary');
      const cs1 = computeChecksum(entry);
      const cs2 = computeChecksum(entry);
      expect(cs1).toBe(cs2);
      expect(cs1.length).toBe(16);
    });

    it('verifyChecksum returns true when no checksum set', () => {
      const entry = getContractEntry('mainnet', 'electrum-primary');
      expect(verifyChecksum(entry)).toBe(true);
    });

    it('verifyChecksum returns true for matching checksum', () => {
      const entry = { ...getContractEntry('mainnet', 'electrum-primary') };
      entry.checksum = computeChecksum(entry);
      expect(verifyChecksum(entry)).toBe(true);
    });

    it('verifyChecksum returns false for wrong checksum', () => {
      const entry = { ...getContractEntry('mainnet', 'electrum-primary') };
      entry.checksum = 'wrong_checksum_val';
      expect(verifyChecksum(entry)).toBe(false);
    });
  });

  describe('validateChainId', () => {
    it('passes for matching network', () => {
      const entry = getContractEntry('mainnet', 'electrum-primary');
      expect(() => validateChainId(entry, 'mainnet')).not.toThrow();
    });

    it('throws for mismatched network', () => {
      const entry = getContractEntry('mainnet', 'electrum-primary');
      expect(() => validateChainId(entry, 'testnet')).toThrow('Chain ID mismatch');
    });
  });

  describe('validateManifest', () => {
    it('returns no errors for valid mainnet manifest', () => {
      expect(validateManifest('mainnet')).toEqual([]);
    });

    it('returns no errors for valid testnet manifest', () => {
      expect(validateManifest('testnet')).toEqual([]);
    });
  });
});
