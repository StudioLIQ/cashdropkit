/**
 * Secret Field Filter — Non-custodial enforcement
 *
 * Ensures mnemonic, private keys, and encryption material NEVER reach the server.
 * Applied to all incoming API payloads before processing.
 *
 * Policy: If a forbidden field is detected, the request is REJECTED (fail-closed).
 */

/** Fields that must NEVER appear in API requests */
const FORBIDDEN_FIELDS = new Set([
  // Mnemonic / seed
  'mnemonic',
  'seedPhrase',
  'seed_phrase',
  'encryptedMnemonic',
  'encrypted_mnemonic',
  'mnemonicSalt',
  'mnemonic_salt',
  'mnemonicIv',
  'mnemonic_iv',

  // Private keys
  'privateKey',
  'private_key',
  'privKey',
  'priv_key',
  'secretKey',
  'secret_key',
  'signingKey',
  'signing_key',
  'wif',

  // Encryption material
  'encryptionKey',
  'encryption_key',
  'derivedKey',
  'derived_key',
  'passphrase',
  'password',
  'pin',
  'aesKey',
  'aes_key',
  'pbkdf2Salt',
  'pbkdf2_salt',

  // Raw transaction hex (signed — contains signature material)
  'signedTxHex',
  'signed_tx_hex',
  'rawSignedTx',
  'raw_signed_tx',
]);

export interface SecretFilterResult {
  safe: boolean;
  violations: string[];
}

/**
 * Recursively scan an object for forbidden fields.
 * Returns list of forbidden field paths found.
 */
export function scanForSecrets(
  obj: unknown,
  path: string = '',
  maxDepth: number = 10,
): string[] {
  if (maxDepth <= 0 || obj === null || obj === undefined) {
    return [];
  }

  if (typeof obj !== 'object') {
    return [];
  }

  const violations: string[] = [];

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      violations.push(...scanForSecrets(obj[i], `${path}[${i}]`, maxDepth - 1));
    }
  } else {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const fullPath = path ? `${path}.${key}` : key;

      if (FORBIDDEN_FIELDS.has(key)) {
        violations.push(fullPath);
      }

      violations.push(
        ...scanForSecrets((obj as Record<string, unknown>)[key], fullPath, maxDepth - 1),
      );
    }
  }

  return violations;
}

/**
 * Validate that a request body contains no secret/sensitive fields.
 * Returns { safe: true } if clean, or { safe: false, violations: [...] } if secrets detected.
 */
export function filterSecrets(body: unknown): SecretFilterResult {
  const violations = scanForSecrets(body);
  return {
    safe: violations.length === 0,
    violations,
  };
}

/**
 * Strip forbidden fields from an object (defensive, for responses).
 * Use this on outbound data as a second layer of defense.
 */
export function stripSecretFields(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...obj };
  for (const key of Object.keys(cleaned)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      delete cleaned[key];
    } else if (typeof cleaned[key] === 'object' && cleaned[key] !== null) {
      cleaned[key] = stripSecretFields(cleaned[key] as Record<string, unknown>);
    }
  }
  return cleaned;
}
