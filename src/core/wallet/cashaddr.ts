/**
 * CashAddr encoding/decoding for Bitcoin Cash
 *
 * Based on the CashAddr specification:
 * https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md
 */
import type { Network } from '../db/types';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/**
 * Polymod for Bech32/CashAddr checksum
 */
function polymod(values: number[]): bigint {
  const GENERATORS: bigint[] = [
    0x98f2bc8e61n,
    0x79b76d99e2n,
    0xf33e5fb3c4n,
    0xae2eabe2a8n,
    0x1e4f43e470n,
  ];

  let chk = 1n;
  for (const value of values) {
    const top = chk >> 35n;
    chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(value);
    for (let i = 0; i < 5; i++) {
      if ((top >> BigInt(i)) & 1n) {
        chk ^= GENERATORS[i];
      }
    }
  }
  return chk ^ 1n;
}

/**
 * Expand prefix for checksum calculation
 */
function prefixExpand(prefix: string): number[] {
  const result: number[] = [];
  for (const char of prefix) {
    result.push(char.charCodeAt(0) & 0x1f);
  }
  result.push(0);
  return result;
}

/**
 * Convert 8-bit bytes to 5-bit groups
 */
function convertBits(data: Uint8Array, fromBits: number, toBits: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      result.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      result.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv) !== 0) {
    throw new Error('Invalid bit conversion');
  }

  return result;
}

/**
 * Calculate CashAddr checksum
 */
function createChecksum(prefix: string, payload: number[]): number[] {
  const prefixData = prefixExpand(prefix);
  const values = [...prefixData, ...payload, 0, 0, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values);
  const result: number[] = [];
  for (let i = 0; i < 8; i++) {
    result.push(Number((mod >> BigInt(5 * (7 - i))) & 0x1fn));
  }
  return result;
}

/**
 * Verify CashAddr checksum
 */
function verifyChecksum(prefix: string, payload: number[]): boolean {
  const prefixData = prefixExpand(prefix);
  return polymod([...prefixData, ...payload]) === 0n;
}

/**
 * CashAddr type byte
 * 0x00 = P2PKH (20-byte hash)
 * 0x08 = P2SH (20-byte hash)
 */
export type AddressType = 'P2PKH' | 'P2SH';

const TYPE_BITS: Record<AddressType, number> = {
  P2PKH: 0x00,
  P2SH: 0x08,
};

const SIZE_BITS: Record<number, number> = {
  20: 0x00,
  24: 0x01,
  28: 0x02,
  32: 0x03,
  40: 0x04,
  48: 0x05,
  56: 0x06,
  64: 0x07,
};

/**
 * Get prefix for network
 */
export function getPrefix(network: Network): string {
  return network === 'mainnet' ? 'bitcoincash' : 'bchtest';
}

/**
 * Encode a hash to CashAddr format
 *
 * @param network - Network (mainnet/testnet)
 * @param type - Address type (P2PKH/P2SH)
 * @param hash - 20-byte hash (pubkey hash or script hash)
 * @returns CashAddr formatted address
 */
export function encodeCashAddr(network: Network, type: AddressType, hash: Uint8Array): string {
  if (hash.length !== 20) {
    throw new Error(`Invalid hash length: ${hash.length}, expected 20`);
  }

  const prefix = getPrefix(network);
  const versionByte = TYPE_BITS[type] | SIZE_BITS[hash.length];

  // Create payload: version byte + hash, converted to 5-bit groups
  const payload = convertBits(new Uint8Array([versionByte, ...hash]), 8, 5, true);
  const checksum = createChecksum(prefix, payload);

  // Encode to string
  const combined = [...payload, ...checksum];
  let result = prefix + ':';
  for (const value of combined) {
    result += CHARSET[value];
  }

  return result;
}

/**
 * Decode a CashAddr address
 *
 * @param address - CashAddr formatted address
 * @returns Decoded address info
 * @throws Error if invalid
 */
export function decodeCashAddr(address: string): {
  prefix: string;
  type: AddressType;
  hash: Uint8Array;
  network: Network;
} {
  // Normalize: lowercase, handle missing prefix
  const normalized = address.toLowerCase();

  // Find separator
  const sepIndex = normalized.indexOf(':');
  let prefix: string;
  let payload: string;

  if (sepIndex === -1) {
    // No prefix, try to infer
    // Check if it starts with 'q' or 'p' (mainnet) or '2' (testnet P2SH)
    if (normalized.startsWith('q') || normalized.startsWith('p')) {
      prefix = 'bitcoincash';
      payload = normalized;
    } else {
      prefix = 'bchtest';
      payload = normalized;
    }
  } else {
    prefix = normalized.slice(0, sepIndex);
    payload = normalized.slice(sepIndex + 1);
  }

  // Decode payload
  const data: number[] = [];
  for (const char of payload) {
    const index = CHARSET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid character in address: ${char}`);
    }
    data.push(index);
  }

  // Verify checksum
  if (!verifyChecksum(prefix, data)) {
    throw new Error('Invalid checksum');
  }

  // Remove checksum (last 8 values)
  const payloadData = data.slice(0, -8);

  // Convert from 5-bit to 8-bit
  const converted = convertBits(new Uint8Array(payloadData), 5, 8, false);

  // Extract version byte and hash
  const versionByte = converted[0];
  const hash = new Uint8Array(converted.slice(1));

  // Parse version byte
  const typeBits = versionByte & 0x78;
  const sizeBits = versionByte & 0x07;

  let type: AddressType;
  if (typeBits === TYPE_BITS.P2PKH) {
    type = 'P2PKH';
  } else if (typeBits === TYPE_BITS.P2SH) {
    type = 'P2SH';
  } else {
    throw new Error(`Unknown address type: ${typeBits}`);
  }

  // Verify size
  const expectedSize = Object.entries(SIZE_BITS).find(([, bits]) => bits === sizeBits)?.[0];
  if (!expectedSize || hash.length !== parseInt(expectedSize, 10)) {
    throw new Error(`Invalid hash size: ${hash.length}`);
  }

  // Determine network
  let network: Network;
  if (prefix === 'bitcoincash') {
    network = 'mainnet';
  } else if (prefix === 'bchtest') {
    network = 'testnet';
  } else {
    throw new Error(`Unknown prefix: ${prefix}`);
  }

  return { prefix, type, hash, network };
}

/**
 * Validate a CashAddr address
 *
 * @param address - Address to validate
 * @param expectedNetwork - Optional expected network
 * @returns true if valid
 */
export function isValidCashAddr(address: string, expectedNetwork?: Network): boolean {
  try {
    const decoded = decodeCashAddr(address);
    if (expectedNetwork && decoded.network !== expectedNetwork) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize a CashAddr address to canonical form (with prefix)
 */
export function normalizeCashAddr(address: string): string {
  const decoded = decodeCashAddr(address);
  return encodeCashAddr(decoded.network, decoded.type, decoded.hash);
}
