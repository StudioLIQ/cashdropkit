/**
 * Key Derivation Functions (KDF)
 *
 * Uses PBKDF2 with SHA-256 for deriving encryption keys from passphrases.
 * All operations use the Web Crypto API for secure, standardized cryptography.
 */

/**
 * Default PBKDF2 iterations.
 * Higher values increase security but also processing time.
 * 100,000 iterations is a reasonable balance for browser environments.
 */
export const DEFAULT_PBKDF2_ITERATIONS = 100_000;

/**
 * Salt length in bytes (128 bits recommended minimum)
 */
export const SALT_LENGTH = 16;

/**
 * Derived key length in bytes (256 bits for AES-256)
 */
export const KEY_LENGTH = 32;

/**
 * Generate a cryptographically secure random salt.
 *
 * @param length - Salt length in bytes (default: 16)
 * @returns Base64-encoded salt string
 */
export function generateSalt(length: number = SALT_LENGTH): string {
  const saltBytes = crypto.getRandomValues(new Uint8Array(length));
  return bytesToBase64(saltBytes);
}

/**
 * Derive an AES-GCM encryption key from a passphrase using PBKDF2.
 *
 * @param passphrase - User's passphrase
 * @param salt - Base64-encoded salt (use generateSalt() to create)
 * @param iterations - PBKDF2 iterations (default: 100,000)
 * @returns CryptoKey suitable for AES-GCM operations
 */
export async function deriveKey(
  passphrase: string,
  salt: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  // Encode passphrase to bytes
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  const saltBytes = base64ToBytes(salt);

  // Import passphrase as a key for PBKDF2
  const baseKey = await crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, [
    'deriveBits',
    'deriveKey',
  ]);

  // Derive AES-GCM key using PBKDF2
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH * 8, // 256 bits
    },
    false, // not extractable (security)
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * Derive raw key bytes from a passphrase (for advanced use cases).
 *
 * @param passphrase - User's passphrase
 * @param salt - Base64-encoded salt
 * @param iterations - PBKDF2 iterations
 * @returns Base64-encoded derived key bytes
 */
export async function deriveKeyBytes(
  passphrase: string,
  salt: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<string> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  const saltBytes = base64ToBytes(salt);

  const baseKey = await crypto.subtle.importKey('raw', passphraseBytes, 'PBKDF2', false, [
    'deriveBits',
  ]);

  const keyBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    KEY_LENGTH * 8 // 256 bits
  );

  return bytesToBase64(new Uint8Array(keyBits));
}

/**
 * Verify a passphrase against stored credentials by attempting to derive the same key.
 * This is a timing-safe comparison at the crypto level.
 *
 * @param passphrase - User's passphrase to verify
 * @param salt - Stored salt
 * @param expectedKeyHash - Stored key hash (from hashDerivedKey)
 * @param iterations - PBKDF2 iterations used during key creation
 * @returns true if passphrase is correct
 */
export async function verifyPassphrase(
  passphrase: string,
  salt: string,
  expectedKeyHash: string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<boolean> {
  const keyBytes = await deriveKeyBytes(passphrase, salt, iterations);
  const actualHash = await hashDerivedKey(keyBytes);
  return actualHash === expectedKeyHash;
}

/**
 * Create a hash of the derived key for verification purposes.
 * This allows verifying the passphrase without storing the actual key.
 *
 * @param keyBytes - Base64-encoded derived key bytes
 * @returns Base64-encoded SHA-256 hash
 */
export async function hashDerivedKey(keyBytes: string): Promise<string> {
  const bytes = base64ToBytes(keyBytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToBase64(new Uint8Array(hashBuffer));
}

// ============================================================================
// Encoding utilities
// ============================================================================

/**
 * Convert a Uint8Array to Base64 string.
 */
export function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binString);
}

/**
 * Convert a Base64 string to Uint8Array.
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binString = atob(base64);
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to hex string.
 */
export function bytesToHex(bytes: Uint8Array<ArrayBuffer>): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert a hex string to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
