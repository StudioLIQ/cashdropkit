/**
 * CashTokens Transaction Builder
 *
 * Builds multi-recipient token distribution transactions with:
 * - Multiple token outputs for recipients
 * - Token change output (if needed)
 * - BCH change output (if needed)
 * - Optional OP_RETURN output
 * - Dust lower-bound safeguard
 */
import type { TokenUtxo, Utxo } from '@/core/adapters/chain/types';
import type { Network } from '@/core/db/types';
import { decodeCashAddr } from '@/core/wallet/cashaddr';

import { MIN_DUST_SATOSHIS, estimateFee } from './feeEstimator';

// ============================================================================
// Constants
// ============================================================================

/**
 * CashToken prefix byte (0xef)
 */
export const TOKEN_PREFIX_BYTE = 0xef;

/**
 * Token capability bytes (for NFTs)
 */
export const NFT_CAPABILITY = {
  none: 0x00,
  mutable: 0x01,
  minting: 0x02,
} as const;

/**
 * Token bitfield flags
 */
export const TOKEN_BITFIELD = {
  HAS_AMOUNT: 0x10,
  HAS_NFT: 0x20,
  HAS_COMMITMENT: 0x40,
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Recipient for token distribution
 */
export interface TxRecipient {
  /** Recipient address (CashAddr) */
  address: string;
  /** Token amount to send (base units) */
  tokenAmount: bigint;
  /** Optional memo/label (not stored on chain) */
  memo?: string;
}

/**
 * Input for token transaction
 */
export interface TxInput {
  /** Transaction ID */
  txid: string;
  /** Output index */
  vout: number;
  /** Satoshi value */
  satoshis: bigint;
  /** Locking script (scriptPubKey) */
  scriptPubKey: string;
  /** Token data (if token UTXO) */
  token?: {
    category: string;
    amount: bigint;
    nftCommitment?: string;
    nftCapability?: 'none' | 'mutable' | 'minting';
  };
}

/**
 * Output for token transaction
 */
export interface TxOutput {
  /** Satoshi value */
  satoshis: bigint;
  /** Locking script (hex) */
  lockingScript: string;
  /** Token data (if token output) */
  token?: {
    category: string;
    amount: bigint;
    nftCommitment?: string;
    nftCapability?: 'none' | 'mutable' | 'minting';
  };
}

/**
 * Unsigned transaction structure
 */
export interface UnsignedTransaction {
  /** Version (typically 2) */
  version: number;
  /** Inputs */
  inputs: TxInput[];
  /** Outputs */
  outputs: TxOutput[];
  /** Locktime */
  locktime: number;
  /** Estimated size in bytes */
  estimatedSize: number;
  /** Estimated fee in satoshis */
  estimatedFee: bigint;
}

/**
 * Parameters for building a token distribution transaction
 */
export interface TokenTxParams {
  /** Network (mainnet/testnet) */
  network: Network;
  /** Token category (genesis txid) */
  tokenCategory: string;
  /** Token UTXOs to spend */
  tokenInputs: TokenUtxo[];
  /** BCH UTXOs to spend (for fees) */
  bchInputs: Utxo[];
  /** Recipients with token amounts */
  recipients: TxRecipient[];
  /** Change address for tokens */
  tokenChangeAddress: string;
  /** Change address for BCH */
  bchChangeAddress: string;
  /** Fee rate in sat/byte */
  feeRateSatPerByte: number;
  /** Dust amount per token output (will be enforced to minimum) */
  dustSatPerOutput: bigint;
  /** Optional OP_RETURN data */
  opReturnData?: Uint8Array;
}

/**
 * Result of building a token transaction
 */
export interface TokenTxResult {
  success: boolean;
  transaction?: UnsignedTransaction;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// Script Building Helpers
// ============================================================================

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encode a BigInt as a CompactSize (variable length integer)
 */
export function encodeCompactSize(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error('CompactSize cannot be negative');
  }

  if (value < 253n) {
    return new Uint8Array([Number(value)]);
  } else if (value <= 0xffffn) {
    const buf = new Uint8Array(3);
    buf[0] = 253;
    buf[1] = Number(value & 0xffn);
    buf[2] = Number((value >> 8n) & 0xffn);
    return buf;
  } else if (value <= 0xffffffffn) {
    const buf = new Uint8Array(5);
    buf[0] = 254;
    const view = new DataView(buf.buffer);
    view.setUint32(1, Number(value), true);
    return buf;
  } else {
    const buf = new Uint8Array(9);
    buf[0] = 255;
    const view = new DataView(buf.buffer);
    view.setBigUint64(1, value, true);
    return buf;
  }
}

/**
 * Encode token amount as varint (used in CashToken encoding)
 * Different from CompactSize - uses Bitcoin's VarInt format
 */
export function encodeTokenAmount(amount: bigint): Uint8Array {
  if (amount < 0n) {
    throw new Error('Token amount cannot be negative');
  }

  // Tokens use minimal encoding as varint
  const bytes: number[] = [];
  let remaining = amount;

  do {
    let byte = Number(remaining & 0x7fn);
    remaining = remaining >> 7n;
    if (remaining > 0n) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining > 0n);

  return new Uint8Array(bytes);
}

/**
 * Build a P2PKH locking script from a pubkey hash
 */
export function buildP2PKHScript(pubkeyHash: Uint8Array): Uint8Array {
  // OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
  // 76 a9 14 <hash> 88 ac
  const script = new Uint8Array(25);
  script[0] = 0x76; // OP_DUP
  script[1] = 0xa9; // OP_HASH160
  script[2] = 0x14; // Push 20 bytes
  script.set(pubkeyHash, 3);
  script[23] = 0x88; // OP_EQUALVERIFY
  script[24] = 0xac; // OP_CHECKSIG
  return script;
}

/**
 * Build a CashToken prefix for a fungible token output
 */
export function buildTokenPrefix(category: string, amount: bigint): Uint8Array {
  // Token prefix format:
  // 0xef (prefix byte) + category (32 bytes, reversed) + bitfield + amount (if present)

  const categoryBytes = hexToBytes(category);
  if (categoryBytes.length !== 32) {
    throw new Error('Token category must be 32 bytes (64 hex chars)');
  }

  // Reverse category (little endian)
  const reversedCategory = new Uint8Array(categoryBytes).reverse();

  // Bitfield: just HAS_AMOUNT for fungible tokens
  const bitfield = TOKEN_BITFIELD.HAS_AMOUNT;

  // Encode amount
  const amountBytes = encodeTokenAmount(amount);

  // Combine: prefix + category + bitfield + amount
  const result = new Uint8Array(1 + 32 + 1 + amountBytes.length);
  result[0] = TOKEN_PREFIX_BYTE;
  result.set(reversedCategory, 1);
  result[33] = bitfield;
  result.set(amountBytes, 34);

  return result;
}

/**
 * Build a token output locking script (token prefix + P2PKH)
 */
export function buildTokenP2PKHScript(
  pubkeyHash: Uint8Array,
  category: string,
  amount: bigint
): Uint8Array {
  const tokenPrefix = buildTokenPrefix(category, amount);
  const p2pkhScript = buildP2PKHScript(pubkeyHash);

  // Combine: token prefix + P2PKH script
  const result = new Uint8Array(tokenPrefix.length + p2pkhScript.length);
  result.set(tokenPrefix, 0);
  result.set(p2pkhScript, tokenPrefix.length);

  return result;
}

/**
 * Build an OP_RETURN output script
 */
export function buildOpReturnScript(data: Uint8Array): Uint8Array {
  if (data.length > 220) {
    throw new Error('OP_RETURN data too large (max 220 bytes)');
  }

  // OP_RETURN + push opcode + data
  let pushOpcode: Uint8Array;
  if (data.length <= 75) {
    pushOpcode = new Uint8Array([data.length]);
  } else if (data.length <= 255) {
    pushOpcode = new Uint8Array([0x4c, data.length]); // OP_PUSHDATA1
  } else {
    pushOpcode = new Uint8Array([0x4d, data.length & 0xff, data.length >> 8]); // OP_PUSHDATA2
  }

  const script = new Uint8Array(1 + pushOpcode.length + data.length);
  script[0] = 0x6a; // OP_RETURN
  script.set(pushOpcode, 1);
  script.set(data, 1 + pushOpcode.length);

  return script;
}

/**
 * Get pubkey hash from CashAddr address
 */
export function addressToPubkeyHash(address: string): Uint8Array {
  const decoded = decodeCashAddr(address);
  return decoded.hash;
}

// ============================================================================
// Transaction Builder
// ============================================================================

/**
 * Validate and enforce dust minimum
 */
function enforceDustMinimum(dust: bigint): bigint {
  if (dust < MIN_DUST_SATOSHIS) {
    return MIN_DUST_SATOSHIS;
  }
  return dust;
}

/**
 * Convert UTXO to TxInput
 */
function utxoToInput(utxo: Utxo | TokenUtxo): TxInput {
  const input: TxInput = {
    txid: utxo.txid,
    vout: utxo.vout,
    satoshis: utxo.satoshis,
    scriptPubKey: utxo.scriptPubKey,
  };

  if ('token' in utxo && utxo.token) {
    input.token = {
      category: utxo.token.category,
      amount: utxo.token.amount,
      nftCommitment: utxo.token.nftCommitment,
      nftCapability: utxo.token.nftCapability,
    };
  }

  return input;
}

/**
 * Build a multi-recipient token distribution transaction
 *
 * @param params - Transaction parameters
 * @returns Transaction result with unsigned transaction or error
 */
export function buildTokenTransaction(params: TokenTxParams): TokenTxResult {
  const {
    tokenCategory,
    tokenInputs,
    bchInputs,
    recipients,
    tokenChangeAddress,
    bchChangeAddress,
    feeRateSatPerByte,
    dustSatPerOutput,
    opReturnData,
  } = params;

  const warnings: string[] = [];

  // Enforce dust minimum
  const effectiveDust = enforceDustMinimum(dustSatPerOutput);
  if (effectiveDust > dustSatPerOutput) {
    warnings.push(
      `Dust increased from ${dustSatPerOutput} to ${effectiveDust} satoshis (minimum enforced)`
    );
  }

  // Validate inputs
  if (tokenInputs.length === 0) {
    return { success: false, error: 'No token inputs provided' };
  }

  if (recipients.length === 0) {
    return { success: false, error: 'No recipients provided' };
  }

  // Verify all token inputs match the category
  for (const input of tokenInputs) {
    if (input.token.category !== tokenCategory) {
      return {
        success: false,
        error: `Token input category mismatch: expected ${tokenCategory.slice(0, 8)}..., got ${input.token.category.slice(0, 8)}...`,
      };
    }
  }

  // Calculate token totals
  const totalTokenIn = tokenInputs.reduce((sum, u) => sum + u.token.amount, 0n);
  const totalTokenOut = recipients.reduce((sum, r) => sum + r.tokenAmount, 0n);

  if (totalTokenOut > totalTokenIn) {
    return {
      success: false,
      error: `Insufficient tokens: need ${totalTokenOut}, have ${totalTokenIn}`,
    };
  }

  const tokenChange = totalTokenIn - totalTokenOut;
  const hasTokenChange = tokenChange > 0n;

  // Calculate BCH totals
  const totalBchFromTokenInputs = tokenInputs.reduce((sum, u) => sum + u.satoshis, 0n);
  const totalBchFromBchInputs = bchInputs.reduce((sum, u) => sum + u.satoshis, 0n);
  const totalBchIn = totalBchFromTokenInputs + totalBchFromBchInputs;

  // Estimate fee
  const feeEstimate = estimateFee(
    {
      bchInputCount: bchInputs.length,
      tokenInputCount: tokenInputs.length,
      recipientCount: recipients.length,
      hasTokenChange,
      hasBchChange: true, // Assume we'll have change
      hasOpReturn: !!opReturnData,
      opReturnSize: opReturnData?.length,
    },
    feeRateSatPerByte,
    effectiveDust
  );

  // Calculate BCH outputs
  const dustForRecipients = effectiveDust * BigInt(recipients.length);
  const dustForTokenChange = hasTokenChange ? effectiveDust : 0n;
  const totalDustNeeded = dustForRecipients + dustForTokenChange;
  const totalBchNeeded = totalDustNeeded + feeEstimate.feeWithMargin;

  if (totalBchIn < totalBchNeeded) {
    return {
      success: false,
      error: `Insufficient BCH: need ${totalBchNeeded} satoshis, have ${totalBchIn} satoshis`,
    };
  }

  const bchChange = totalBchIn - totalBchNeeded;
  const hasBchChange = bchChange >= MIN_DUST_SATOSHIS;

  // If BCH change is below dust, add it to fee (don't create dust output)
  const finalFee = hasBchChange ? feeEstimate.feeWithMargin : feeEstimate.feeWithMargin + bchChange;

  // Build inputs
  const inputs: TxInput[] = [...tokenInputs.map(utxoToInput), ...bchInputs.map(utxoToInput)];

  // Build outputs
  const outputs: TxOutput[] = [];

  // 1. Recipient token outputs
  for (const recipient of recipients) {
    const pubkeyHash = addressToPubkeyHash(recipient.address);
    const lockingScript = buildTokenP2PKHScript(pubkeyHash, tokenCategory, recipient.tokenAmount);

    outputs.push({
      satoshis: effectiveDust,
      lockingScript: bytesToHex(lockingScript),
      token: {
        category: tokenCategory,
        amount: recipient.tokenAmount,
      },
    });
  }

  // 2. Token change output (if any)
  if (hasTokenChange) {
    const changeHash = addressToPubkeyHash(tokenChangeAddress);
    const changeLockingScript = buildTokenP2PKHScript(changeHash, tokenCategory, tokenChange);

    outputs.push({
      satoshis: effectiveDust,
      lockingScript: bytesToHex(changeLockingScript),
      token: {
        category: tokenCategory,
        amount: tokenChange,
      },
    });
  }

  // 3. BCH change output (if above dust)
  if (hasBchChange) {
    const bchChangeHash = addressToPubkeyHash(bchChangeAddress);
    const bchChangeLockingScript = buildP2PKHScript(bchChangeHash);

    outputs.push({
      satoshis: bchChange,
      lockingScript: bytesToHex(bchChangeLockingScript),
    });
  }

  // 4. OP_RETURN output (if any)
  if (opReturnData && opReturnData.length > 0) {
    const opReturnScript = buildOpReturnScript(opReturnData);

    outputs.push({
      satoshis: 0n,
      lockingScript: bytesToHex(opReturnScript),
    });
  }

  // Build unsigned transaction
  const transaction: UnsignedTransaction = {
    version: 2,
    inputs,
    outputs,
    locktime: 0,
    estimatedSize: feeEstimate.sizeBytes,
    estimatedFee: finalFee,
  };

  return {
    success: true,
    transaction,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Verify a transaction's token balance
 * Ensures sum(token inputs) >= sum(token outputs)
 */
export function verifyTokenBalance(tx: UnsignedTransaction): {
  valid: boolean;
  tokenInputSum: bigint;
  tokenOutputSum: bigint;
  error?: string;
} {
  const tokenInputSum = tx.inputs.reduce((sum, i) => sum + (i.token?.amount ?? 0n), 0n);

  const tokenOutputSum = tx.outputs.reduce((sum, o) => sum + (o.token?.amount ?? 0n), 0n);

  if (tokenOutputSum > tokenInputSum) {
    return {
      valid: false,
      tokenInputSum,
      tokenOutputSum,
      error: `Token output (${tokenOutputSum}) exceeds input (${tokenInputSum})`,
    };
  }

  return { valid: true, tokenInputSum, tokenOutputSum };
}

/**
 * Verify a transaction's BCH balance
 * Ensures sum(bch inputs) >= sum(bch outputs) + fee
 */
export function verifyBchBalance(tx: UnsignedTransaction): {
  valid: boolean;
  bchInputSum: bigint;
  bchOutputSum: bigint;
  impliedFee: bigint;
  error?: string;
} {
  const bchInputSum = tx.inputs.reduce((sum, i) => sum + i.satoshis, 0n);
  const bchOutputSum = tx.outputs.reduce((sum, o) => sum + o.satoshis, 0n);
  const impliedFee = bchInputSum - bchOutputSum;

  if (impliedFee < 0n) {
    return {
      valid: false,
      bchInputSum,
      bchOutputSum,
      impliedFee,
      error: `BCH output (${bchOutputSum}) exceeds input (${bchInputSum})`,
    };
  }

  return { valid: true, bchInputSum, bchOutputSum, impliedFee };
}
