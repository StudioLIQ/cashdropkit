/**
 * Mnemonic and HD wallet operations
 *
 * Uses BIP39 for mnemonic generation and BIP32/BIP44 for key derivation.
 * Derives BCH addresses from mnemonic phrases.
 */
import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import type { Network } from '../db/types';
import { encodeCashAddr } from './cashaddr';
import { BIP44_COIN_TYPE, DEFAULT_DERIVATION, type DerivationAccount } from './types';

/**
 * Generate a new random mnemonic phrase
 *
 * @param strength - Entropy bits (128 = 12 words, 256 = 24 words)
 * @returns Mnemonic phrase
 */
export function generateMnemonic(strength: 128 | 256 = 128): string {
  return bip39.generateMnemonic(wordlist, strength);
}

/**
 * Validate a mnemonic phrase
 *
 * @param mnemonic - Mnemonic to validate
 * @returns true if valid BIP39 mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

/**
 * Normalize mnemonic (lowercase, trim, single spaces)
 */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Convert mnemonic to seed
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param passphrase - Optional BIP39 passphrase (not the wallet encryption passphrase)
 * @returns 64-byte seed
 */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  const normalized = normalizeMnemonic(mnemonic);
  return bip39.mnemonicToSeedSync(normalized, passphrase);
}

/**
 * Derive HD master key from seed
 */
export function seedToHDKey(seed: Uint8Array): HDKey {
  return HDKey.fromMasterSeed(seed);
}

/**
 * Hash public key to get pubkey hash (for P2PKH addresses)
 * SHA256 followed by RIPEMD160
 */
async function hash160(data: Uint8Array): Promise<Uint8Array> {
  // SHA256
  const sha256 = await crypto.subtle.digest('SHA-256', data as BufferSource);

  // RIPEMD160 - we'll use a simple implementation since crypto.subtle doesn't support it
  const ripemd160 = await ripemd160Hash(new Uint8Array(sha256));

  return ripemd160;
}

/**
 * RIPEMD-160 hash implementation
 * Based on the RIPEMD-160 specification
 */
async function ripemd160Hash(message: Uint8Array): Promise<Uint8Array> {
  // RIPEMD-160 constants
  const K1 = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  const K2 = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

  const R1 = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2,
    14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13,
    3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
  ];

  const R2 = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12,
    4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5,
    12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
  ];

  const S1 = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9,
    11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15,
    9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
  ];

  const S2 = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7,
    6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6,
    14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
  ];

  function rotl(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  function f(j: number, x: number, y: number, z: number): number {
    if (j < 16) return (x ^ y ^ z) >>> 0;
    if (j < 32) return ((x & y) | (~x & z)) >>> 0;
    if (j < 48) return ((x | ~y) ^ z) >>> 0;
    if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
    return (x ^ (y | ~z)) >>> 0;
  }

  // Pad message
  const msgLen = message.length;
  const bitLen = BigInt(msgLen) * 8n;

  // Calculate padding length
  let padLen = 64 - ((msgLen + 9) % 64);
  if (padLen === 64) padLen = 0;

  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(message);
  padded[msgLen] = 0x80;

  // Append length in little-endian
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, bitLen, true);

  // Initial hash values
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  // Process blocks
  for (let i = 0; i < padded.length; i += 64) {
    const X: number[] = [];
    for (let j = 0; j < 16; j++) {
      X[j] = view.getUint32(i + j * 4, true);
    }

    let al = h0,
      bl = h1,
      cl = h2,
      dl = h3,
      el = h4;
    let ar = h0,
      br = h1,
      cr = h2,
      dr = h3,
      er = h4;

    for (let j = 0; j < 80; j++) {
      const jj = Math.floor(j / 16);
      let tl = (al + f(j, bl, cl, dl) + X[R1[j]] + K1[jj]) >>> 0;
      tl = (rotl(tl, S1[j]) + el) >>> 0;
      al = el;
      el = dl;
      dl = rotl(cl, 10);
      cl = bl;
      bl = tl;

      let tr = (ar + f(79 - j, br, cr, dr) + X[R2[j]] + K2[jj]) >>> 0;
      tr = (rotl(tr, S2[j]) + er) >>> 0;
      ar = er;
      er = dr;
      dr = rotl(cr, 10);
      cr = br;
      br = tr;
    }

    const t = (h1 + cl + dr) >>> 0;
    h1 = (h2 + dl + er) >>> 0;
    h2 = (h3 + el + ar) >>> 0;
    h3 = (h4 + al + br) >>> 0;
    h4 = (h0 + bl + cr) >>> 0;
    h0 = t;
  }

  // Output hash
  const result = new Uint8Array(20);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, h0, true);
  resultView.setUint32(4, h1, true);
  resultView.setUint32(8, h2, true);
  resultView.setUint32(12, h3, true);
  resultView.setUint32(16, h4, true);

  return result;
}

/**
 * Get BIP44 derivation path for BCH
 *
 * @param network - mainnet or testnet
 * @param account - Account index
 * @param addressIndex - Address index within account
 * @returns Full derivation path string
 */
export function getDerivationPath(network: Network, account: number, addressIndex: number): string {
  const coinType = BIP44_COIN_TYPE[network];
  // m / purpose' / coin_type' / account' / change / address_index
  // change = 0 for receiving addresses
  return `m/44'/${coinType}'/${account}'/0/${addressIndex}`;
}

/**
 * Derive a single address from mnemonic
 *
 * @param mnemonic - BIP39 mnemonic
 * @param network - Network (mainnet/testnet)
 * @param account - Account index
 * @param addressIndex - Address index
 * @returns CashAddr format address
 */
export async function deriveAddress(
  mnemonic: string,
  network: Network,
  account: number,
  addressIndex: number
): Promise<string> {
  const seed = mnemonicToSeed(mnemonic);
  const hdKey = seedToHDKey(seed);

  const path = getDerivationPath(network, account, addressIndex);
  const derived = hdKey.derive(path);

  if (!derived.publicKey) {
    throw new Error('Failed to derive public key');
  }

  // Hash the public key to get the pubkey hash
  const pubkeyHash = await hash160(derived.publicKey);

  // Encode as CashAddr
  return encodeCashAddr(network, 'P2PKH', pubkeyHash);
}

/**
 * Derive multiple addresses from mnemonic
 *
 * @param mnemonic - BIP39 mnemonic
 * @param network - Network (mainnet/testnet)
 * @param options - Derivation options
 * @returns Array of addresses
 */
export async function deriveAddresses(
  mnemonic: string,
  network: Network,
  options: DerivationAccount = DEFAULT_DERIVATION
): Promise<string[]> {
  const addresses: string[] = [];

  for (let i = 0; i < options.addressCount; i++) {
    const address = await deriveAddress(mnemonic, network, options.accountIndex, i);
    addresses.push(address);
  }

  return addresses;
}

/**
 * Get the derivation path string for display
 */
export function getDisplayDerivationPath(network: Network, accountIndex: number = 0): string {
  const coinType = BIP44_COIN_TYPE[network];
  return `m/44'/${coinType}'/${accountIndex}'/0/*`;
}
