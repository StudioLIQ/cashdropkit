/**
 * Lockbox Script Generator (P2SH_CLTV_P2PKH)
 *
 * Generates deterministic redeemScripts and P2SH addresses for CLTV-based
 * time-locked token vesting.
 *
 * Script template:
 *   <unlockTime> OP_CHECKLOCKTIMEVERIFY OP_DROP
 *   OP_DUP OP_HASH160 <pubkeyHash> OP_EQUALVERIFY OP_CHECKSIG
 *
 * Spending conditions:
 *   - nLockTime >= unlockTime
 *   - beneficiary signature required
 *   - nSequence must be non-final (< 0xffffffff) to enable locktime
 */
import type { Network } from '@/core/db/types';
import { encodeCashAddr } from '@/core/wallet/cashaddr';

import { bytesToHex, hexToBytes } from './tokenTxBuilder';

// ============================================================================
// Opcodes
// ============================================================================

const OP_DUP = 0x76;
const OP_HASH160 = 0xa9;
const OP_EQUALVERIFY = 0x88;
const OP_CHECKSIG = 0xac;
const OP_CHECKLOCKTIMEVERIFY = 0xb1;
const OP_DROP = 0x75;

// ============================================================================
// Types
// ============================================================================

/**
 * Lockbox script generation parameters
 */
export interface LockboxParams {
  /** Unix timestamp for unlock time (seconds) */
  unlockTime: number;
  /** Beneficiary's public key hash (20 bytes hex) */
  beneficiaryPkh: string;
  /** Network for address generation */
  network: Network;
}

/**
 * Generated lockbox info
 */
export interface LockboxResult {
  /** Hex-encoded redeemScript */
  redeemScriptHex: string;
  /** P2SH address for the lockbox */
  lockAddress: string;
  /** Script hash (20 bytes hex) used in P2SH address */
  scriptHash: string;
  /** The unlock time encoded in the script */
  unlockTime: number;
  /** The beneficiary pubkey hash */
  beneficiaryPkh: string;
}

// ============================================================================
// Script Encoding Helpers
// ============================================================================

/**
 * Encode a number as Bitcoin Script minimal push (CScriptNum format).
 * Used for OP_CHECKLOCKTIMEVERIFY operand.
 *
 * Bitcoin script encodes numbers in little-endian with sign bit.
 * For locktime values (always positive, up to 2^32-1),
 * we need to handle values correctly.
 */
export function encodeScriptNumber(value: number): Uint8Array {
  if (value < 0) {
    throw new Error('Locktime must be non-negative');
  }

  if (value === 0) {
    return new Uint8Array([]); // OP_0 is handled by push opcode
  }

  // Encode as little-endian bytes
  const result: number[] = [];
  let remaining = value;

  while (remaining > 0) {
    result.push(remaining & 0xff);
    remaining >>>= 8;
  }

  // If the most significant byte has its high bit set,
  // add a 0x00 byte to ensure it's treated as positive
  if (result[result.length - 1] & 0x80) {
    result.push(0x00);
  }

  return new Uint8Array(result);
}

/**
 * Build a push data opcode for small data
 */
function pushData(data: Uint8Array): Uint8Array {
  if (data.length === 0) {
    return new Uint8Array([0x00]); // OP_0
  }

  if (data.length >= 1 && data.length <= 75) {
    // Direct push: length byte + data
    const result = new Uint8Array(1 + data.length);
    result[0] = data.length;
    result.set(data, 1);
    return result;
  }

  if (data.length <= 255) {
    // OP_PUSHDATA1
    const result = new Uint8Array(2 + data.length);
    result[0] = 0x4c;
    result[1] = data.length;
    result.set(data, 2);
    return result;
  }

  throw new Error(`Data too large for push: ${data.length} bytes`);
}

// ============================================================================
// Hash Utilities
// ============================================================================

/**
 * SHA-256 hash
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(hash);
}

/**
 * RIPEMD-160 hash (pure JS implementation for browser compatibility)
 * Adapted from standard RIPEMD-160 reference.
 */
function ripemd160(message: Uint8Array): Uint8Array {
  // RIPEMD-160 constants and functions
  const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

  const RL = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2,
    14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13,
    3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
  ];
  const RR = [
    5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12,
    4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5,
    12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
  ];
  const SL = [
    11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9,
    11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15,
    9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
  ];
  const SR = [
    8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7,
    6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6,
    14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
  ];

  function f(j: number, x: number, y: number, z: number): number {
    if (j < 16) return x ^ y ^ z;
    if (j < 32) return (x & y) | (~x & z);
    if (j < 48) return (x | ~y) ^ z;
    if (j < 64) return (x & z) | (y & ~z);
    return x ^ (y | ~z);
  }

  function rotl(x: number, n: number): number {
    return ((x << n) | (x >>> (32 - n))) >>> 0;
  }

  // Padding
  const msgLen = message.length;
  const bitLen = msgLen * 8;
  const paddingLen = (((55 - msgLen) % 64) + 64) % 64;
  const padded = new Uint8Array(msgLen + 1 + paddingLen + 8);
  padded.set(message);
  padded[msgLen] = 0x80;

  // Length in bits (little-endian, 64-bit)
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, 0, true);

  // Initial hash values
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  // Process blocks
  for (let offset = 0; offset < padded.length; offset += 64) {
    const X: number[] = [];
    for (let i = 0; i < 16; i++) {
      X[i] = view.getUint32(offset + i * 4, true);
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
      const jl = Math.floor(j / 16);
      const jr = Math.floor(j / 16);

      let tl = (al + f(j, bl, cl, dl) + X[RL[j]] + KL[jl]) >>> 0;
      tl = (rotl(tl, SL[j]) + el) >>> 0;
      al = el;
      el = dl;
      dl = rotl(cl, 10);
      cl = bl;
      bl = tl;

      let tr = (ar + f(79 - j, br, cr, dr) + X[RR[j]] + KR[jr]) >>> 0;
      tr = (rotl(tr, SR[j]) + er) >>> 0;
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

  // Produce output
  const result = new Uint8Array(20);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0, true);
  rv.setUint32(4, h1, true);
  rv.setUint32(8, h2, true);
  rv.setUint32(12, h3, true);
  rv.setUint32(16, h4, true);

  return result;
}

/**
 * Hash160 = RIPEMD-160(SHA-256(data))
 */
async function hash160(data: Uint8Array): Promise<Uint8Array> {
  const sha = await sha256(data);
  return ripemd160(sha);
}

// ============================================================================
// Lockbox Script Generator
// ============================================================================

/**
 * Build the CLTV lockbox redeemScript
 *
 * Script:
 *   <unlockTime> OP_CHECKLOCKTIMEVERIFY OP_DROP
 *   OP_DUP OP_HASH160 <20-byte pubkeyHash> OP_EQUALVERIFY OP_CHECKSIG
 *
 * @param unlockTime - Unix timestamp (seconds)
 * @param beneficiaryPkh - 20-byte pubkey hash (hex string)
 * @returns redeemScript as Uint8Array
 */
export function buildRedeemScript(unlockTime: number, beneficiaryPkh: string): Uint8Array {
  if (unlockTime <= 0) {
    throw new Error('unlockTime must be positive');
  }

  const pkhBytes = hexToBytes(beneficiaryPkh);
  if (pkhBytes.length !== 20) {
    throw new Error(`Invalid pubkey hash length: ${pkhBytes.length}, expected 20`);
  }

  const lockTimeBytes = encodeScriptNumber(unlockTime);
  const lockTimePush = pushData(lockTimeBytes);

  // Build script:
  // <lockTimePush> OP_CLTV OP_DROP OP_DUP OP_HASH160 <20 pkhBytes> OP_EQUALVERIFY OP_CHECKSIG
  const pkhPush = pushData(pkhBytes);

  const script = new Uint8Array(
    lockTimePush.length +
      2 + // OP_CLTV OP_DROP
      1 +
      1 + // OP_DUP OP_HASH160
      pkhPush.length +
      1 +
      1 // OP_EQUALVERIFY OP_CHECKSIG
  );

  let offset = 0;
  script.set(lockTimePush, offset);
  offset += lockTimePush.length;

  script[offset++] = OP_CHECKLOCKTIMEVERIFY;
  script[offset++] = OP_DROP;
  script[offset++] = OP_DUP;
  script[offset++] = OP_HASH160;

  script.set(pkhPush, offset);
  offset += pkhPush.length;

  script[offset++] = OP_EQUALVERIFY;
  script[offset++] = OP_CHECKSIG;

  return script;
}

/**
 * Generate a lockbox (redeemScript + P2SH address) for CLTV vesting.
 *
 * This is deterministic: same inputs always produce the same output.
 *
 * @param params - Lockbox parameters
 * @returns Lockbox result with redeemScript and address
 */
export async function generateLockbox(params: LockboxParams): Promise<LockboxResult> {
  const { unlockTime, beneficiaryPkh, network } = params;

  // Build redeemScript
  const redeemScript = buildRedeemScript(unlockTime, beneficiaryPkh);
  const redeemScriptHex = bytesToHex(redeemScript);

  // Hash160 of redeemScript for P2SH address
  const scriptHashBytes = await hash160(redeemScript);
  const scriptHash = bytesToHex(scriptHashBytes);

  // Encode as P2SH CashAddr
  const lockAddress = encodeCashAddr(network, 'P2SH', scriptHashBytes);

  return {
    redeemScriptHex,
    lockAddress,
    scriptHash,
    unlockTime,
    beneficiaryPkh,
  };
}

/**
 * Generate lockboxes for multiple tranches for a single beneficiary.
 *
 * @param beneficiaryPkh - Beneficiary pubkey hash (hex)
 * @param unlockTimes - Array of unlock times
 * @param network - Network
 * @returns Array of lockbox results
 */
export async function generateLockboxes(
  beneficiaryPkh: string,
  unlockTimes: number[],
  network: Network
): Promise<LockboxResult[]> {
  const results: LockboxResult[] = [];
  for (const unlockTime of unlockTimes) {
    results.push(await generateLockbox({ unlockTime, beneficiaryPkh, network }));
  }
  return results;
}
