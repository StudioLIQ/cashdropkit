/**
 * Unlock Transaction Builder Tests
 */
import { describe, expect, it } from 'vitest';

import type { ClaimBundle, ClaimTranche } from './unlockTxBuilder';
import {
  filterTranchesForAddress,
  getTrancheStatus,
  isTrancheUnlockable,
  parseClaimBundle,
} from './unlockTxBuilder';

// ============================================================================
// Test Data
// ============================================================================

function makeClaimTranche(overrides?: Partial<ClaimTranche>): ClaimTranche {
  return {
    trancheId: 't1',
    beneficiaryAddress: 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
    unlockTime: 1700000000,
    amountBase: '100000',
    tokenCategory: 'a'.repeat(64),
    lockbox: {
      lockAddress: 'bchtest:ptest123',
      redeemScriptHex: 'aabbccdd',
      outpoint: { txid: 'ee'.repeat(32), vout: 0 },
      satoshis: 800,
    },
    ...overrides,
  };
}

function makeClaimBundle(tranches: ClaimTranche[]): ClaimBundle {
  return {
    version: 1,
    campaignId: 'c1',
    campaignName: 'Test Campaign',
    network: 'testnet',
    token: { tokenId: 'a'.repeat(64), symbol: 'TEST', decimals: 0 },
    tranches,
    exportedAt: Date.now(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('unlockTxBuilder', () => {
  describe('isTrancheUnlockable', () => {
    it('should return true for past unlock times', () => {
      expect(isTrancheUnlockable(1000000000)).toBe(true); // 2001
    });

    it('should return false for future unlock times', () => {
      expect(isTrancheUnlockable(9999999999)).toBe(false); // 2286
    });
  });

  describe('getTrancheStatus', () => {
    it('should return UNLOCKABLE for past times', () => {
      expect(getTrancheStatus(1000000000)).toBe('UNLOCKABLE');
    });

    it('should return LOCKED for future times', () => {
      expect(getTrancheStatus(9999999999)).toBe('LOCKED');
    });
  });

  describe('parseClaimBundle', () => {
    it('should parse a valid claim bundle', () => {
      const bundle = makeClaimBundle([makeClaimTranche()]);
      const json = JSON.stringify(bundle);
      const parsed = parseClaimBundle(json);

      expect(parsed.version).toBe(1);
      expect(parsed.campaignId).toBe('c1');
      expect(parsed.tranches).toHaveLength(1);
    });

    it('should throw for invalid version', () => {
      const json = JSON.stringify({ version: 2, tranches: [] });
      expect(() => parseClaimBundle(json)).toThrow('version');
    });

    it('should throw for missing tranches', () => {
      const json = JSON.stringify({ version: 1 });
      expect(() => parseClaimBundle(json)).toThrow('tranches');
    });

    it('should throw for invalid JSON', () => {
      expect(() => parseClaimBundle('not json')).toThrow();
    });
  });

  describe('filterTranchesForAddress', () => {
    it('should filter tranches for matching address', () => {
      const addr1 = 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc';
      const addr2 = 'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdpn3jdgd';

      const bundle = makeClaimBundle([
        makeClaimTranche({ trancheId: 't1', beneficiaryAddress: addr1 }),
        makeClaimTranche({ trancheId: 't2', beneficiaryAddress: addr2 }),
        makeClaimTranche({ trancheId: 't3', beneficiaryAddress: addr1 }),
      ]);

      const filtered = filterTranchesForAddress(bundle, addr1);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].trancheId).toBe('t1');
      expect(filtered[1].trancheId).toBe('t3');
    });

    it('should return empty for no matches', () => {
      const bundle = makeClaimBundle([makeClaimTranche()]);
      const filtered = filterTranchesForAddress(
        bundle,
        'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqdpn3jdgd'
      );
      expect(filtered).toHaveLength(0);
    });

    it('should be case-insensitive', () => {
      const addr = 'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc';
      const bundle = makeClaimBundle([makeClaimTranche({ beneficiaryAddress: addr })]);

      const filtered = filterTranchesForAddress(bundle, addr.toUpperCase());
      expect(filtered).toHaveLength(1);
    });
  });
});
