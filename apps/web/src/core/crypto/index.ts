/**
 * Crypto module exports
 *
 * Provides encryption, key derivation, and app lock functionality.
 */

// Key derivation
export {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  DEFAULT_PBKDF2_ITERATIONS,
  deriveKey,
  deriveKeyBytes,
  generateSalt,
  hashDerivedKey,
  hexToBytes,
  KEY_LENGTH,
  SALT_LENGTH,
  verifyPassphrase,
} from './kdf';

// AES-GCM encryption
export type { EncryptedData } from './aes';
export {
  decrypt,
  decryptWithPassphrase,
  deserializeEncrypted,
  encrypt,
  encryptWithPassphrase,
  generateIv,
  IV_LENGTH,
  reEncrypt,
  serializeEncrypted,
} from './aes';

// App lock
export type { LockConfig, LockState } from './lock';
export { AppLockManager, getLockManager, resetLockManager } from './lock';
