import { describe, expect, it } from 'vitest';

import { filterSecrets, scanForSecrets, stripSecretFields } from './secretFilter.js';

describe('secretFilter', () => {
  describe('scanForSecrets', () => {
    it('returns empty array for clean object', () => {
      const obj = { name: 'test', network: 'mainnet', tokenId: 'abc123' };
      expect(scanForSecrets(obj)).toEqual([]);
    });

    it('detects mnemonic field', () => {
      const obj = { name: 'test', mnemonic: 'abandon abandon ...' };
      expect(scanForSecrets(obj)).toEqual(['mnemonic']);
    });

    it('detects privateKey field', () => {
      const obj = { privateKey: '0xabc123' };
      expect(scanForSecrets(obj)).toEqual(['privateKey']);
    });

    it('detects nested secret fields', () => {
      const obj = { wallet: { encryptedMnemonic: 'encrypted...' } };
      expect(scanForSecrets(obj)).toEqual(['wallet.encryptedMnemonic']);
    });

    it('detects secrets in arrays', () => {
      const obj = { wallets: [{ id: '1', privateKey: 'key' }] };
      expect(scanForSecrets(obj)).toEqual(['wallets[0].privateKey']);
    });

    it('detects multiple violations', () => {
      const obj = { mnemonic: 'test', passphrase: 'pass', secretKey: 'key' };
      const violations = scanForSecrets(obj);
      expect(violations).toContain('mnemonic');
      expect(violations).toContain('passphrase');
      expect(violations).toContain('secretKey');
    });

    it('detects snake_case variants', () => {
      const obj = { private_key: 'key', seed_phrase: 'phrase', encryption_key: 'enc' };
      const violations = scanForSecrets(obj);
      expect(violations).toContain('private_key');
      expect(violations).toContain('seed_phrase');
      expect(violations).toContain('encryption_key');
    });

    it('handles null and undefined gracefully', () => {
      expect(scanForSecrets(null)).toEqual([]);
      expect(scanForSecrets(undefined)).toEqual([]);
    });

    it('handles deeply nested objects within depth limit', () => {
      const deep = { a: { b: { c: { d: { mnemonic: 'secret' } } } } };
      const violations = scanForSecrets(deep);
      expect(violations).toEqual(['a.b.c.d.mnemonic']);
    });

    it('respects maxDepth to prevent infinite recursion', () => {
      const deep = { a: { b: { c: { mnemonic: 'secret' } } } };
      const violations = scanForSecrets(deep, '', 2);
      expect(violations).toEqual([]); // mnemonic is at depth 4, limit is 2
    });
  });

  describe('filterSecrets', () => {
    it('returns safe=true for clean payload', () => {
      const result = filterSecrets({ name: 'Test Campaign', network: 'mainnet' });
      expect(result.safe).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('returns safe=false with violations for secret payload', () => {
      const result = filterSecrets({ name: 'Test', mnemonic: 'abandon ...' });
      expect(result.safe).toBe(false);
      expect(result.violations).toContain('mnemonic');
    });
  });

  describe('stripSecretFields', () => {
    it('removes forbidden fields from object', () => {
      const obj = { name: 'test', mnemonic: 'secret', network: 'mainnet' };
      const cleaned = stripSecretFields(obj);
      expect(cleaned).toEqual({ name: 'test', network: 'mainnet' });
    });

    it('removes nested forbidden fields', () => {
      const obj = { wallet: { id: '1', privateKey: 'key', name: 'My Wallet' } };
      const cleaned = stripSecretFields(obj);
      expect(cleaned.wallet).toEqual({ id: '1', name: 'My Wallet' });
    });

    it('preserves non-secret fields', () => {
      const obj = { name: 'test', tokenId: 'abc', decimals: 8 };
      const cleaned = stripSecretFields(obj);
      expect(cleaned).toEqual(obj);
    });
  });
});
