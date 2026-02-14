/**
 * AES-GCM Encryption/Decryption
 *
 * Provides authenticated encryption using AES-256-GCM.
 * - IV (Initialization Vector): Random 12 bytes per encryption
 * - Auth Tag: 128 bits (built into GCM)
 *
 * Ciphertext format: IV (12 bytes) || ciphertext || auth tag
 * All encoded as Base64 for storage.
 */
import { base64ToBytes, bytesToBase64, deriveKey, generateSalt } from './kdf';

/**
 * IV length in bytes (96 bits, recommended for GCM)
 */
export const IV_LENGTH = 12;

/**
 * Generate a random IV for AES-GCM.
 *
 * @returns Uint8Array of random bytes
 */
export function generateIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * @param plaintext - String to encrypt
 * @param key - CryptoKey from deriveKey()
 * @returns Object with iv and ciphertext (both Base64-encoded)
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<{ iv: string; ciphertext: string }> {
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const iv = generateIv();

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    plaintextBytes
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * @param ciphertext - Base64-encoded ciphertext
 * @param iv - Base64-encoded IV
 * @param key - CryptoKey from deriveKey()
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong key or tampered data)
 */
export async function decrypt(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  const ciphertextBytes = base64ToBytes(ciphertext);
  const ivBytes = base64ToBytes(iv);

  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes,
      },
      key,
      ciphertextBytes
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
  } catch {
    throw new Error('Decryption failed: invalid key or tampered data');
  }
}

/**
 * Encrypted data structure for storage.
 */
export interface EncryptedData {
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded IV */
  iv: string;
  /** Base64-encoded salt (for key derivation) */
  salt: string;
  /** PBKDF2 iterations used */
  iterations: number;
  /** Version for future format changes */
  version: 1;
}

/**
 * Encrypt sensitive data with a passphrase.
 * This is the high-level API for encrypting secrets like mnemonics.
 *
 * @param plaintext - Sensitive data to encrypt
 * @param passphrase - User's passphrase
 * @param iterations - PBKDF2 iterations (default: 100,000)
 * @returns EncryptedData structure ready for storage
 */
export async function encryptWithPassphrase(
  plaintext: string,
  passphrase: string,
  iterations?: number
): Promise<EncryptedData> {
  const salt = generateSalt();
  const key = await deriveKey(passphrase, salt, iterations);
  const { iv, ciphertext } = await encrypt(plaintext, key);

  return {
    ciphertext,
    iv,
    salt,
    iterations: iterations ?? 100_000,
    version: 1,
  };
}

/**
 * Decrypt sensitive data with a passphrase.
 *
 * @param encryptedData - EncryptedData structure from encryptWithPassphrase
 * @param passphrase - User's passphrase
 * @returns Decrypted plaintext
 * @throws Error if passphrase is incorrect or data is tampered
 */
export async function decryptWithPassphrase(
  encryptedData: EncryptedData,
  passphrase: string
): Promise<string> {
  if (encryptedData.version !== 1) {
    throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
  }

  const key = await deriveKey(passphrase, encryptedData.salt, encryptedData.iterations);
  return decrypt(encryptedData.ciphertext, encryptedData.iv, key);
}

/**
 * Re-encrypt data with a new passphrase.
 * Useful for changing the app passphrase.
 *
 * @param encryptedData - Current encrypted data
 * @param currentPassphrase - Current passphrase
 * @param newPassphrase - New passphrase
 * @returns New EncryptedData with new passphrase
 */
export async function reEncrypt(
  encryptedData: EncryptedData,
  currentPassphrase: string,
  newPassphrase: string
): Promise<EncryptedData> {
  // Decrypt with current passphrase
  const plaintext = await decryptWithPassphrase(encryptedData, currentPassphrase);

  // Re-encrypt with new passphrase
  return encryptWithPassphrase(plaintext, newPassphrase, encryptedData.iterations);
}

/**
 * Serialize EncryptedData to JSON string for storage.
 */
export function serializeEncrypted(data: EncryptedData): string {
  return JSON.stringify(data);
}

/**
 * Deserialize EncryptedData from JSON string.
 */
export function deserializeEncrypted(json: string): EncryptedData {
  const data = JSON.parse(json) as EncryptedData;

  // Validate structure
  if (
    typeof data.ciphertext !== 'string' ||
    typeof data.iv !== 'string' ||
    typeof data.salt !== 'string' ||
    typeof data.iterations !== 'number' ||
    typeof data.version !== 'number'
  ) {
    throw new Error('Invalid encrypted data structure');
  }

  return data;
}
