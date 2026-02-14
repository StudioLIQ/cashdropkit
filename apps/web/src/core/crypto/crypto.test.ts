/**
 * Tests for crypto module
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  decrypt,
  decryptWithPassphrase,
  deserializeEncrypted,
  encrypt,
  encryptWithPassphrase,
  reEncrypt,
  serializeEncrypted,
} from './aes';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  deriveKey,
  deriveKeyBytes,
  generateSalt,
  hashDerivedKey,
  hexToBytes,
  verifyPassphrase,
} from './kdf';
import { AppLockManager, getLockManager, resetLockManager } from './lock';

describe('kdf', () => {
  describe('generateSalt', () => {
    it('generates a random salt of correct length', () => {
      const salt = generateSalt();
      const bytes = base64ToBytes(salt);
      expect(bytes.length).toBe(16);
    });

    it('generates unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);
    });

    it('accepts custom length', () => {
      const salt = generateSalt(32);
      const bytes = base64ToBytes(salt);
      expect(bytes.length).toBe(32);
    });
  });

  describe('deriveKey', () => {
    it('derives a CryptoKey from passphrase', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);

      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('derives same key for same passphrase and salt', async () => {
      const salt = generateSalt();
      const key1 = await deriveKey('test-passphrase', salt);
      const key2 = await deriveKey('test-passphrase', salt);

      // CryptoKey objects aren't directly comparable, so we test via encryption
      const testData = 'test data';
      const { iv, ciphertext } = await encrypt(testData, key1);
      const decrypted = await decrypt(ciphertext, iv, key2);
      expect(decrypted).toBe(testData);
    });

    it('derives different keys for different passphrases', async () => {
      const salt = generateSalt();
      const key1 = await deriveKey('passphrase1', salt);
      const key2 = await deriveKey('passphrase2', salt);

      const testData = 'test data';
      const { iv, ciphertext } = await encrypt(testData, key1);

      // Decryption with wrong key should fail
      await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
    });

    it('derives different keys for different salts', async () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      const key1 = await deriveKey('test-passphrase', salt1);
      const key2 = await deriveKey('test-passphrase', salt2);

      const testData = 'test data';
      const { iv, ciphertext } = await encrypt(testData, key1);

      await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
    });
  });

  describe('deriveKeyBytes', () => {
    it('returns base64-encoded key bytes', async () => {
      const salt = generateSalt();
      const keyBytes = await deriveKeyBytes('test-passphrase', salt);
      const bytes = base64ToBytes(keyBytes);
      expect(bytes.length).toBe(32); // 256 bits
    });
  });

  describe('verifyPassphrase', () => {
    it('returns true for correct passphrase', async () => {
      const salt = generateSalt();
      const keyBytes = await deriveKeyBytes('correct-passphrase', salt);
      const keyHash = await hashDerivedKey(keyBytes);

      const result = await verifyPassphrase('correct-passphrase', salt, keyHash);
      expect(result).toBe(true);
    });

    it('returns false for incorrect passphrase', async () => {
      const salt = generateSalt();
      const keyBytes = await deriveKeyBytes('correct-passphrase', salt);
      const keyHash = await hashDerivedKey(keyBytes);

      const result = await verifyPassphrase('wrong-passphrase', salt, keyHash);
      expect(result).toBe(false);
    });
  });

  describe('encoding utilities', () => {
    it('round-trips bytes through base64', () => {
      const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
      const base64 = bytesToBase64(original);
      const restored = base64ToBytes(base64);
      expect(restored).toEqual(original);
    });

    it('round-trips bytes through hex', () => {
      const original = new Uint8Array([1, 2, 3, 255, 0, 128]);
      const hex = bytesToHex(original);
      expect(hex).toBe('010203ff0080');
      const restored = hexToBytes(hex);
      expect(restored).toEqual(original);
    });
  });
});

describe('aes', () => {
  describe('encrypt/decrypt', () => {
    it('encrypts and decrypts plaintext', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      const plaintext = 'Hello, World!';

      const { iv, ciphertext } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('handles empty string', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);

      const { iv, ciphertext } = await encrypt('', key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe('');
    });

    it('handles unicode characters', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      const plaintext = 'Hello, \u{1F600} World! \u{4E2D}\u{6587}';

      const { iv, ciphertext } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('handles long text', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      const plaintext = 'A'.repeat(10000);

      const { iv, ciphertext } = await encrypt(plaintext, key);
      const decrypted = await decrypt(ciphertext, iv, key);

      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for same plaintext (random IV)', async () => {
      const salt = generateSalt();
      const key = await deriveKey('test-passphrase', salt);
      const plaintext = 'Hello, World!';

      const result1 = await encrypt(plaintext, key);
      const result2 = await encrypt(plaintext, key);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
    });

    it('fails to decrypt with wrong key', async () => {
      const key1 = await deriveKey('passphrase1', generateSalt());
      const key2 = await deriveKey('passphrase2', generateSalt());

      const { iv, ciphertext } = await encrypt('secret', key1);

      await expect(decrypt(ciphertext, iv, key2)).rejects.toThrow();
    });

    it('fails to decrypt tampered ciphertext', async () => {
      const key = await deriveKey('test-passphrase', generateSalt());
      const { iv, ciphertext } = await encrypt('secret', key);

      // Tamper with ciphertext
      const bytes = base64ToBytes(ciphertext);
      bytes[0] = bytes[0] ^ 0xff;
      const tampered = bytesToBase64(bytes);

      await expect(decrypt(tampered, iv, key)).rejects.toThrow();
    });
  });

  describe('encryptWithPassphrase/decryptWithPassphrase', () => {
    it('encrypts and decrypts with passphrase', async () => {
      const plaintext = 'my secret mnemonic words here';
      const passphrase = 'strong-password-123!';

      const encrypted = await encryptWithPassphrase(plaintext, passphrase);
      const decrypted = await decryptWithPassphrase(encrypted, passphrase);

      expect(decrypted).toBe(plaintext);
    });

    it('fails with wrong passphrase', async () => {
      const encrypted = await encryptWithPassphrase('secret', 'correct-password');

      await expect(decryptWithPassphrase(encrypted, 'wrong-password')).rejects.toThrow();
    });

    it('encrypted data has correct structure', async () => {
      const encrypted = await encryptWithPassphrase('secret', 'password');

      expect(encrypted.version).toBe(1);
      expect(typeof encrypted.ciphertext).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.salt).toBe('string');
      expect(typeof encrypted.iterations).toBe('number');
      expect(encrypted.iterations).toBeGreaterThan(0);
    });
  });

  describe('reEncrypt', () => {
    it('re-encrypts with new passphrase', async () => {
      const plaintext = 'secret data';
      const oldPassphrase = 'old-password';
      const newPassphrase = 'new-password';

      const encrypted = await encryptWithPassphrase(plaintext, oldPassphrase);
      const reEncrypted = await reEncrypt(encrypted, oldPassphrase, newPassphrase);

      // Should decrypt with new passphrase
      const decrypted = await decryptWithPassphrase(reEncrypted, newPassphrase);
      expect(decrypted).toBe(plaintext);

      // Should not decrypt with old passphrase
      await expect(decryptWithPassphrase(reEncrypted, oldPassphrase)).rejects.toThrow();
    });

    it('fails with wrong current passphrase', async () => {
      const encrypted = await encryptWithPassphrase('secret', 'correct-password');

      await expect(reEncrypt(encrypted, 'wrong-password', 'new-password')).rejects.toThrow();
    });
  });

  describe('serialize/deserialize', () => {
    it('round-trips encrypted data through JSON', async () => {
      const encrypted = await encryptWithPassphrase('secret', 'password');
      const json = serializeEncrypted(encrypted);
      const restored = deserializeEncrypted(json);

      expect(restored).toEqual(encrypted);

      // Verify it still decrypts
      const decrypted = await decryptWithPassphrase(restored, 'password');
      expect(decrypted).toBe('secret');
    });

    it('throws on invalid JSON structure', () => {
      expect(() => deserializeEncrypted('{}')).toThrow();
      expect(() => deserializeEncrypted('{"ciphertext": "x"}')).toThrow();
    });
  });
});

describe('lock', () => {
  let manager: AppLockManager;

  beforeEach(() => {
    resetLockManager();
    manager = new AppLockManager();
  });

  afterEach(() => {
    manager.reset();
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts uninitialized', () => {
      expect(manager.getState()).toBe('uninitialized');
      expect(manager.isSetUp()).toBe(false);
    });
  });

  describe('setup', () => {
    it('sets up lock and unlocks', async () => {
      const config = await manager.setup('password123');

      expect(manager.getState()).toBe('unlocked');
      expect(manager.isSetUp()).toBe(true);
      expect(config.salt).toBeTruthy();
      expect(config.keyHash).toBeTruthy();
      expect(config.iterations).toBe(100_000);
      expect(config.autoLockMinutes).toBe(15);
    });

    it('accepts custom settings', async () => {
      const config = await manager.setup('password', 30, 50_000);

      expect(config.autoLockMinutes).toBe(30);
      expect(config.iterations).toBe(50_000);
    });
  });

  describe('lock/unlock', () => {
    beforeEach(async () => {
      await manager.setup('password123');
    });

    it('locks and unlocks', async () => {
      manager.lock();
      expect(manager.getState()).toBe('locked');

      const result = await manager.unlock('password123');
      expect(result).toBe(true);
      expect(manager.getState()).toBe('unlocked');
    });

    it('rejects wrong passphrase', async () => {
      manager.lock();

      const result = await manager.unlock('wrong-password');
      expect(result).toBe(false);
      expect(manager.getState()).toBe('locked');
    });
  });

  describe('loadConfig', () => {
    it('loads existing config and starts locked', async () => {
      // Setup and get config
      const config = await manager.setup('password123');
      manager.reset();

      // Simulate app restart
      manager.loadConfig(config);

      expect(manager.getState()).toBe('locked');
      expect(manager.isSetUp()).toBe(true);

      // Should be able to unlock
      const result = await manager.unlock('password123');
      expect(result).toBe(true);
    });
  });

  describe('changePassphrase', () => {
    beforeEach(async () => {
      await manager.setup('old-password');
    });

    it('changes passphrase', async () => {
      const newConfig = await manager.changePassphrase('old-password', 'new-password');

      expect(newConfig).not.toBeNull();

      // Lock and unlock with new password
      manager.lock();
      const result = await manager.unlock('new-password');
      expect(result).toBe(true);
    });

    it('rejects wrong current passphrase', async () => {
      const result = await manager.changePassphrase('wrong-password', 'new-password');
      expect(result).toBeNull();
    });
  });

  describe('auto-lock', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('auto-locks after timeout', async () => {
      await manager.setup('password', 1); // 1 minute auto-lock

      expect(manager.getState()).toBe('unlocked');

      // Advance past auto-lock time
      vi.advanceTimersByTime(60 * 1000 + 100);

      expect(manager.getState()).toBe('locked');
    });

    it('resets timer on activity', async () => {
      await manager.setup('password', 1);

      // Advance 30 seconds
      vi.advanceTimersByTime(30 * 1000);
      manager.recordActivity();

      // Advance another 45 seconds (would have been past 1 minute total)
      vi.advanceTimersByTime(45 * 1000);

      // Should still be unlocked because activity reset timer
      expect(manager.getState()).toBe('unlocked');

      // Now advance full minute from last activity
      vi.advanceTimersByTime(20 * 1000);
      expect(manager.getState()).toBe('locked');
    });

    it('does not auto-lock when disabled', async () => {
      await manager.setup('password', 0); // 0 = disabled

      vi.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      expect(manager.getState()).toBe('unlocked');
    });
  });

  describe('subscription', () => {
    it('notifies on state change', async () => {
      const listener = vi.fn();
      manager.subscribe(listener);

      await manager.setup('password');
      expect(listener).toHaveBeenCalledWith('unlocked');

      manager.lock();
      expect(listener).toHaveBeenCalledWith('locked');
    });

    it('allows unsubscribe', async () => {
      const listener = vi.fn();
      const unsubscribe = manager.subscribe(listener);

      await manager.setup('password');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.lock();
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe('requireUnlocked', () => {
    it('throws when locked', async () => {
      await manager.setup('password');
      manager.lock();

      expect(() => manager.requireUnlocked()).toThrow('App is locked');
    });

    it('does not throw when unlocked', async () => {
      await manager.setup('password');

      expect(() => manager.requireUnlocked()).not.toThrow();
    });
  });

  describe('singleton', () => {
    it('returns same instance', () => {
      const instance1 = getLockManager();
      const instance2 = getLockManager();
      expect(instance1).toBe(instance2);
    });
  });
});
