/**
 * Unlock Transaction Builder (P2SH-CLTV)
 *
 * Builds and signs transactions that spend lockbox outputs.
 * This is separate from the normal signer because P2SH spending requires:
 * - scriptCode = redeemScript (not the P2SH script)
 * - scriptSig = <sig> <pubkey> <redeemScript> (not just <sig> <pubkey>)
 * - nLockTime >= unlockTime encoded in the script
 * - nSequence < 0xffffffff (non-final, to enable locktime)
 */
import {
  type Sha256,
  hashTransaction,
  hexToBin,
  instantiateSecp256k1,
  instantiateSha256,
} from '@bitauth/libauth';
import { HDKey } from '@scure/bip32';

import type { ChainAdapter } from '@/core/adapters/chain/ChainAdapter';
import type { Network } from '@/core/db/types';
import { MIN_DUST_SATOSHIS } from '@/core/tx/feeEstimator';
import type { TxOutput } from '@/core/tx/tokenTxBuilder';
import {
  buildP2PKHScript,
  buildTokenPrefix,
  bytesToHex,
  hexToBytes,
} from '@/core/tx/tokenTxBuilder';
import { decodeCashAddr, encodeCashAddr } from '@/core/wallet/cashaddr';
import { getDerivationPath, mnemonicToSeed, normalizeMnemonic } from '@/core/wallet/mnemonic';

// ============================================================================
// Types
// ============================================================================

/** Claim bundle entry for a single tranche */
export interface ClaimTranche {
  trancheId: string;
  beneficiaryAddress: string;
  unlockTime: number;
  amountBase: string;
  tokenCategory: string;
  lockbox: {
    lockAddress: string;
    redeemScriptHex: string;
    outpoint: { txid: string; vout: number };
    satoshis: number;
  };
}

/** Full claim bundle exported by operator */
export interface ClaimBundle {
  version: 1;
  campaignId: string;
  campaignName: string;
  network: Network;
  token: { tokenId: string; symbol?: string; decimals?: number };
  tranches: ClaimTranche[];
  exportedAt: number;
}

/** Parameters for building an unlock transaction */
export interface UnlockParams {
  tranche: ClaimTranche;
  network: Network;
  /** Beneficiary's mnemonic for signing */
  mnemonic: string;
  /** Account index (BIP44), default 0 */
  accountIndex?: number;
  /** Address index, default 0 */
  addressIndex?: number;
  /** Destination address for unlocked tokens (usually the beneficiary's own address) */
  destinationAddress: string;
  /** Fee rate in sat/byte */
  feeRateSatPerByte?: number;
  /** Chain adapter for broadcasting */
  adapter?: ChainAdapter;
}

/**
 * Parameters for building an unlock transaction payload that can be signed by
 * an external wallet (e.g. browser extension provider).
 */
export interface UnlockExternalSigningParams {
  tranche: ClaimTranche;
  network: Network;
  destinationAddress: string;
  feeRateSatPerByte?: number;
}

export interface UnlockSourceOutput {
  outpointIndex: number;
  outpointTransactionHash: Uint8Array;
  sequenceNumber: number;
  unlockingBytecode: Uint8Array;
  valueSatoshis: bigint;
  lockingBytecode: Uint8Array;
  token?: {
    amount: bigint;
    category: Uint8Array;
  };
  contract?: {
    abiFunction: {
      name: string;
      inputs: readonly { name: string; type: string }[];
    };
    redeemScript: Uint8Array;
    artifact: Partial<{
      contractName: string;
      abi: readonly { name: string; inputs: readonly { name: string; type: string }[] }[];
    }>;
  };
}

export interface UnlockSigningPayload {
  unsignedTxHex: string;
  sourceOutputs: UnlockSourceOutput[];
  expectedSignerAddress: string;
}

export interface UnlockPayloadResult {
  success: boolean;
  payload?: UnlockSigningPayload;
  error?: string;
}

export interface UnlockResult {
  success: boolean;
  txid?: string;
  txHex?: string;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const SIGHASH_ALL = 0x01;
const SIGHASH_FORKID = 0x40;
const DEFAULT_SIGHASH_TYPE = SIGHASH_ALL | SIGHASH_FORKID;
const DEFAULT_SEQUENCE = 0xfffffffe; // Non-final, enables locktime
const ESTIMATED_UNLOCK_TX_SIZE = 350; // Conservative estimate for single-input P2SH unlock

// ============================================================================
// Unlock Transaction Builder
// ============================================================================

/**
 * Build an unsigned unlock transaction + source output metadata for extension
 * wallet signing.
 */
export async function buildUnlockSigningPayload(
  params: UnlockExternalSigningParams
): Promise<UnlockPayloadResult> {
  const { tranche, network, destinationAddress, feeRateSatPerByte = 1 } = params;

  try {
    const now = Math.floor(Date.now() / 1000);
    if (now < tranche.unlockTime) {
      return {
        success: false,
        error: `Tranche is still locked until ${new Date(tranche.unlockTime * 1000).toISOString()}`,
      };
    }

    const inputSatoshis = BigInt(tranche.lockbox.satoshis);
    const fee = BigInt(Math.ceil(ESTIMATED_UNLOCK_TX_SIZE * feeRateSatPerByte * 1.15));
    const outputSatoshis = inputSatoshis - fee;

    if (outputSatoshis < MIN_DUST_SATOSHIS) {
      return {
        success: false,
        error: `Output amount ${outputSatoshis} is below dust threshold after fee ${fee}`,
      };
    }

    const redeemScript = hexToBytes(tranche.lockbox.redeemScriptHex);
    const tokenAmount = BigInt(tranche.amountBase);
    const destDecoded = decodeCashAddr(destinationAddress);
    if (destDecoded.network !== network) {
      return {
        success: false,
        error: `Destination address network (${destDecoded.network}) does not match campaign network (${network})`,
      };
    }
    const destPubkeyHash = destDecoded.hash;

    const tokenPrefix = buildTokenPrefix(tranche.tokenCategory, tokenAmount);
    const p2pkhScript = buildP2PKHScript(destPubkeyHash);
    const outputLockingScript = new Uint8Array(tokenPrefix.length + p2pkhScript.length);
    outputLockingScript.set(tokenPrefix, 0);
    outputLockingScript.set(p2pkhScript, tokenPrefix.length);

    const outputs: TxOutput[] = [
      {
        satoshis: outputSatoshis,
        lockingScript: bytesToHex(outputLockingScript),
        token: {
          category: tranche.tokenCategory,
          amount: tokenAmount,
        },
      },
    ];

    const unsignedTxHex = serializeUnlockTransaction(
      tranche.lockbox.outpoint.txid,
      tranche.lockbox.outpoint.vout,
      new Uint8Array(),
      DEFAULT_SEQUENCE,
      outputs,
      tranche.unlockTime
    );

    const sha256 = await instantiateSha256();
    const p2shScript = hexToBytes('a914' + bytesToHex(hash160(sha256, redeemScript)) + '87');
    const sourceLockingScript = new Uint8Array(tokenPrefix.length + p2shScript.length);
    sourceLockingScript.set(tokenPrefix, 0);
    sourceLockingScript.set(p2shScript, tokenPrefix.length);

    return {
      success: true,
      payload: {
        unsignedTxHex,
        expectedSignerAddress: tranche.beneficiaryAddress,
        sourceOutputs: [
          {
            outpointIndex: tranche.lockbox.outpoint.vout,
            outpointTransactionHash: hexToBytes(tranche.lockbox.outpoint.txid),
            sequenceNumber: DEFAULT_SEQUENCE,
            unlockingBytecode: new Uint8Array(),
            valueSatoshis: inputSatoshis,
            lockingBytecode: sourceLockingScript,
            token: {
              amount: tokenAmount,
              category: hexToBytes(tranche.tokenCategory),
            },
            contract: {
              abiFunction: {
                name: 'unlock',
                inputs: [],
              },
              redeemScript,
              artifact: {
                contractName: 'CashDropLockbox',
              },
            },
          },
        ],
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build, sign, and optionally broadcast an unlock transaction for a lockbox tranche.
 */
export async function buildAndSignUnlockTx(params: UnlockParams): Promise<UnlockResult> {
  const {
    tranche,
    network,
    mnemonic,
    accountIndex = 0,
    addressIndex = 0,
    destinationAddress,
    feeRateSatPerByte = 1,
    adapter,
  } = params;

  try {
    // 1. Verify unlock time
    const now = Math.floor(Date.now() / 1000);
    if (now < tranche.unlockTime) {
      return {
        success: false,
        error: `Tranche is still locked until ${new Date(tranche.unlockTime * 1000).toISOString()}`,
      };
    }

    // 2. Derive keys from mnemonic
    const normalized = normalizeMnemonic(mnemonic);
    const seed = mnemonicToSeed(normalized);
    const hdKey = HDKey.fromMasterSeed(seed);
    const path = getDerivationPath(network, accountIndex, addressIndex);
    const derived = hdKey.derive(path);

    if (!derived.privateKey || !derived.publicKey) {
      return { success: false, error: 'Failed to derive keys from mnemonic' };
    }

    const privateKey = derived.privateKey;
    const publicKey = derived.publicKey;

    // 3. Verify derived address matches beneficiary
    const secp256k1 = await instantiateSecp256k1();
    const sha256 = await instantiateSha256();

    const pubkeyHash = hash160(sha256, publicKey);
    const derivedAddress = encodeCashAddr(network, 'P2PKH', pubkeyHash);

    if (derivedAddress.toLowerCase() !== tranche.beneficiaryAddress.toLowerCase()) {
      return {
        success: false,
        error: `Derived address ${derivedAddress} does not match beneficiary ${tranche.beneficiaryAddress}`,
      };
    }

    // 4. Calculate fee and outputs
    const inputSatoshis = BigInt(tranche.lockbox.satoshis);
    const fee = BigInt(Math.ceil(ESTIMATED_UNLOCK_TX_SIZE * feeRateSatPerByte * 1.15));
    const outputSatoshis = inputSatoshis - fee;

    if (outputSatoshis < MIN_DUST_SATOSHIS) {
      return {
        success: false,
        error: `Output amount ${outputSatoshis} is below dust threshold after fee ${fee}`,
      };
    }

    // 5. Build the unsigned transaction structure
    const redeemScript = hexToBytes(tranche.lockbox.redeemScriptHex);
    const tokenAmount = BigInt(tranche.amountBase);

    // Output: send tokens + remaining BCH to destination
    const destDecoded = decodeCashAddr(destinationAddress);
    const destPubkeyHash = destDecoded.hash;

    // Build token output locking script (P2PKH with token prefix)
    const tokenPrefix = buildTokenPrefix(tranche.tokenCategory, tokenAmount);
    const p2pkhScript = buildP2PKHScript(destPubkeyHash);
    const outputLockingScript = new Uint8Array(tokenPrefix.length + p2pkhScript.length);
    outputLockingScript.set(tokenPrefix, 0);
    outputLockingScript.set(p2pkhScript, tokenPrefix.length);

    const outputs: TxOutput[] = [
      {
        satoshis: outputSatoshis,
        lockingScript: bytesToHex(outputLockingScript),
        token: {
          category: tranche.tokenCategory,
          amount: tokenAmount,
        },
      },
    ];

    // 6. Compute BIP143 sighash with redeemScript as scriptCode
    const sigHash = computeP2SHSigHash(
      sha256,
      tranche.lockbox.outpoint.txid,
      tranche.lockbox.outpoint.vout,
      inputSatoshis,
      redeemScript,
      tranche.tokenCategory,
      tokenAmount,
      outputs,
      tranche.unlockTime, // nLockTime
      DEFAULT_SIGHASH_TYPE
    );

    // 7. Sign
    const signatureResult = secp256k1.signMessageHashDER(privateKey, sigHash);
    if (typeof signatureResult === 'string') {
      return { success: false, error: `Signing failed: ${signatureResult}` };
    }

    // 8. Build P2SH scriptSig: <sig+type> <pubkey> <redeemScript>
    const signatureWithType = concatBytes(signatureResult, new Uint8Array([DEFAULT_SIGHASH_TYPE]));
    const scriptSig = buildP2SHScriptSig(signatureWithType, publicKey, redeemScript);

    // 9. Serialize the full transaction
    const txHex = serializeUnlockTransaction(
      tranche.lockbox.outpoint.txid,
      tranche.lockbox.outpoint.vout,
      scriptSig,
      DEFAULT_SEQUENCE,
      outputs,
      tranche.unlockTime
    );

    // 10. Compute txid
    const txid = hashTransaction(hexToBin(txHex));

    // 11. Broadcast if adapter provided
    if (adapter) {
      const broadcastResult = await adapter.broadcast(txHex);
      if (!broadcastResult.success) {
        return {
          success: false,
          txid,
          txHex,
          error: `Broadcast failed: ${broadcastResult.error}`,
        };
      }
    }

    return { success: true, txid, txHex };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// BIP143 Sighash for P2SH
// ============================================================================

function computeP2SHSigHash(
  sha256: Sha256,
  inputTxid: string,
  inputVout: number,
  inputSatoshis: bigint,
  redeemScript: Uint8Array,
  tokenCategory: string,
  tokenAmount: bigint,
  outputs: TxOutput[],
  nLockTime: number,
  sigHashType: number
): Uint8Array {
  // BIP143 preimage components:
  // 1. nVersion (4 bytes)
  const nVersion = encodeUint32LE(2);

  // 2. hashPrevouts
  const outpoint = concatBytes(reverseBytes(hexToBytes(inputTxid)), encodeUint32LE(inputVout));
  const hashPrevouts = sha256.hash(sha256.hash(outpoint));

  // 3. hashUtxos (BCH-specific) - UTXO being spent
  const tokenPrefix = buildTokenPrefix(tokenCategory, tokenAmount);
  const p2shScript = hexToBytes('a914' + bytesToHex(hash160(sha256, redeemScript)) + '87');
  const utxoBytes = concatBytes(
    encodeBigInt64LE(inputSatoshis),
    encodeCompactSize(tokenPrefix.length + p2shScript.length),
    tokenPrefix,
    p2shScript
  );
  const hashUtxos = sha256.hash(sha256.hash(utxoBytes));

  // 4. hashSequence
  const sequenceBytes = encodeUint32LE(DEFAULT_SEQUENCE);
  const hashSequence = sha256.hash(sha256.hash(sequenceBytes));

  // 5. Outpoint (already computed)

  // 6. Token prefix of the UTXO being spent
  const outputTokenPrefix = buildTokenPrefix(tokenCategory, tokenAmount);

  // 7. scriptCode = redeemScript
  const scriptCodeWithLen = concatBytes(encodeCompactSize(redeemScript.length), redeemScript);

  // 8. value
  const value = encodeBigInt64LE(inputSatoshis);

  // 9. nSequence
  const nSequenceField = encodeUint32LE(DEFAULT_SEQUENCE);

  // 10. hashOutputs
  const outputParts: Uint8Array[] = [];
  for (const output of outputs) {
    const lockingScriptBytes = hexToBytes(output.lockingScript);
    outputParts.push(
      encodeBigInt64LE(output.satoshis),
      encodeCompactSize(lockingScriptBytes.length),
      lockingScriptBytes
    );
  }
  const hashOutputs = sha256.hash(sha256.hash(concatBytes(...outputParts)));

  // 11. nLocktime
  const nLocktimeBytes = encodeUint32LE(nLockTime);

  // 12. sighash type
  const sigHashTypeBytes = encodeUint32LE(sigHashType);

  // Construct preimage
  const preimage = concatBytes(
    nVersion,
    hashPrevouts,
    hashUtxos,
    hashSequence,
    outpoint,
    outputTokenPrefix,
    scriptCodeWithLen,
    value,
    nSequenceField,
    hashOutputs,
    nLocktimeBytes,
    sigHashTypeBytes
  );

  // Double SHA-256
  return sha256.hash(sha256.hash(preimage));
}

// ============================================================================
// ScriptSig Assembly
// ============================================================================

/**
 * Build P2SH scriptSig: <sig+type> <pubkey> <redeemScript>
 */
function buildP2SHScriptSig(
  signature: Uint8Array,
  pubkey: Uint8Array,
  redeemScript: Uint8Array
): Uint8Array {
  const parts: Uint8Array[] = [];

  // Signature push
  parts.push(pushDataOpcode(signature));
  parts.push(signature);

  // Public key push
  parts.push(new Uint8Array([pubkey.length]));
  parts.push(pubkey);

  // RedeemScript push (serialized)
  parts.push(pushDataOpcode(redeemScript));
  parts.push(redeemScript);

  return concatBytes(...parts);
}

function pushDataOpcode(data: Uint8Array): Uint8Array {
  if (data.length < 76) {
    return new Uint8Array([data.length]);
  } else if (data.length <= 255) {
    return new Uint8Array([0x4c, data.length]); // OP_PUSHDATA1
  } else {
    return new Uint8Array([0x4d, data.length & 0xff, data.length >> 8]); // OP_PUSHDATA2
  }
}

// ============================================================================
// Transaction Serialization
// ============================================================================

function serializeUnlockTransaction(
  inputTxid: string,
  inputVout: number,
  scriptSig: Uint8Array,
  sequence: number,
  outputs: TxOutput[],
  locktime: number
): string {
  const parts: Uint8Array[] = [];

  // Version (4 bytes)
  parts.push(encodeUint32LE(2));

  // Input count (1)
  parts.push(new Uint8Array([1]));

  // Input
  parts.push(reverseBytes(hexToBytes(inputTxid))); // txid (reversed)
  parts.push(encodeUint32LE(inputVout)); // vout
  parts.push(encodeCompactSize(scriptSig.length)); // scriptSig length
  parts.push(scriptSig); // scriptSig
  parts.push(encodeUint32LE(sequence)); // sequence

  // Output count
  parts.push(encodeCompactSize(outputs.length));

  // Outputs
  for (const output of outputs) {
    parts.push(encodeBigInt64LE(output.satoshis));
    const lockingScript = hexToBytes(output.lockingScript);
    parts.push(encodeCompactSize(lockingScript.length));
    parts.push(lockingScript);
  }

  // Locktime
  parts.push(encodeUint32LE(locktime));

  return bytesToHex(concatBytes(...parts));
}

// ============================================================================
// Encoding Helpers
// ============================================================================

function hash160(sha256: Sha256, data: Uint8Array): Uint8Array {
  // Import ripemd160 from lockboxScripts
  const sha = sha256.hash(data);
  return ripemd160(sha);
}

/**
 * RIPEMD-160 (minimal inline for browser compatibility)
 */
function ripemd160(message: Uint8Array): Uint8Array {
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

  const msgLen = message.length;
  const bitLen = msgLen * 8;
  const paddingLen = (((55 - msgLen) % 64) + 64) % 64;
  const padded = new Uint8Array(msgLen + 1 + paddingLen + 8);
  padded.set(message);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bitLen >>> 0, true);
  view.setUint32(padded.length - 4, 0, true);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

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

  const result = new Uint8Array(20);
  const rv = new DataView(result.buffer);
  rv.setUint32(0, h0, true);
  rv.setUint32(4, h1, true);
  rv.setUint32(8, h2, true);
  rv.setUint32(12, h3, true);
  rv.setUint32(16, h4, true);
  return result;
}

function encodeUint32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, true);
  return buf;
}

function encodeBigInt64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, value, true);
  return buf;
}

function encodeCompactSize(value: number | bigint): Uint8Array {
  const n = Number(value);
  if (n < 253) return new Uint8Array([n]);
  if (n < 0x10000) {
    const buf = new Uint8Array(3);
    buf[0] = 253;
    buf[1] = n & 0xff;
    buf[2] = (n >> 8) & 0xff;
    return buf;
  }
  const buf = new Uint8Array(5);
  buf[0] = 254;
  const view = new DataView(buf.buffer);
  view.setUint32(1, n, true);
  return buf;
}

function reverseBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes).reverse();
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ============================================================================
// Tranche Status Helpers
// ============================================================================

/**
 * Determine if a tranche is unlockable (current time >= unlock time)
 */
export function isTrancheUnlockable(unlockTime: number): boolean {
  return Math.floor(Date.now() / 1000) >= unlockTime;
}

/**
 * Get tranche status label
 */
export function getTrancheStatus(unlockTime: number): 'LOCKED' | 'UNLOCKABLE' {
  return isTrancheUnlockable(unlockTime) ? 'UNLOCKABLE' : 'LOCKED';
}

/**
 * Parse a claim bundle from JSON string
 */
export function parseClaimBundle(json: string): ClaimBundle {
  const parsed = JSON.parse(json);

  if (!parsed.version || parsed.version !== 1) {
    throw new Error('Invalid claim bundle version');
  }

  if (!parsed.tranches || !Array.isArray(parsed.tranches)) {
    throw new Error('Invalid claim bundle: missing tranches');
  }

  return parsed as ClaimBundle;
}

/**
 * Filter tranches for a specific beneficiary address
 */
export function filterTranchesForAddress(bundle: ClaimBundle, address: string): ClaimTranche[] {
  const normalized = address.toLowerCase();
  return bundle.tranches.filter((t) => t.beneficiaryAddress.toLowerCase() === normalized);
}
