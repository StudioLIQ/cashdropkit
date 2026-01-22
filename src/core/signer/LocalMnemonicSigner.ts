/**
 * Local Mnemonic Signer
 *
 * Signs transactions locally using mnemonic-derived keys.
 * Private keys NEVER leave the local runtime.
 */
import {
  type Secp256k1,
  type Sha256,
  hashTransaction,
  hexToBin,
  instantiateSecp256k1,
  instantiateSha256,
} from '@bitauth/libauth';
import { HDKey } from '@scure/bip32';

import type { Network } from '@/core/db/types';
import type { TxInput, TxOutput, UnsignedTransaction } from '@/core/tx/tokenTxBuilder';
import { buildTokenPrefix, bytesToHex, hexToBytes } from '@/core/tx/tokenTxBuilder';
import { encodeCashAddr } from '@/core/wallet/cashaddr';
import {
  getDerivationPath,
  mnemonicToSeed,
  normalizeMnemonic,
  validateMnemonic,
} from '@/core/wallet/mnemonic';

import type {
  AddressDerivation,
  MnemonicSigner,
  SignedInput,
  SignedTransaction,
  SigningOptions,
  SigningResult,
} from './Signer';
import { DEFAULT_SIGHASH_TYPE, SIGHASH } from './Signer';

// ============================================================================
// Constants
// ============================================================================

/**
 * Sequence number for standard transaction (non-RBF, allows locktime)
 */
const DEFAULT_SEQUENCE = 0xfffffffe;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Encode a 32-bit unsigned integer as little-endian bytes
 */
function encodeUint32LE(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  const view = new DataView(buf.buffer);
  view.setUint32(0, value, true);
  return buf;
}

/**
 * Encode a 64-bit bigint as little-endian bytes
 */
function encodeBigInt64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, value, true);
  return buf;
}

/**
 * Encode a compact size (varint) for Bitcoin scripts
 */
function encodeCompactSizeBytes(value: number): Uint8Array {
  if (value < 253) {
    return new Uint8Array([value]);
  } else if (value <= 0xffff) {
    const buf = new Uint8Array(3);
    buf[0] = 253;
    buf[1] = value & 0xff;
    buf[2] = (value >> 8) & 0xff;
    return buf;
  } else if (value <= 0xffffffff) {
    const buf = new Uint8Array(5);
    buf[0] = 254;
    const view = new DataView(buf.buffer);
    view.setUint32(1, value, true);
    return buf;
  } else {
    throw new Error('Value too large for CompactSize');
  }
}

/**
 * Concatenate multiple Uint8Arrays
 */
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

/**
 * Reverse a Uint8Array (for endianness conversion)
 */
function reverseBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes).reverse();
}

/**
 * Hash160 (SHA256 + RIPEMD160) implementation
 */
async function hash160(data: Uint8Array): Promise<Uint8Array> {
  // SHA256 - create a copy to ensure proper ArrayBuffer
  const buffer = new Uint8Array(data).buffer;
  const sha256 = await crypto.subtle.digest('SHA-256', buffer);

  // RIPEMD160 - using our own implementation since WebCrypto doesn't support it
  return ripemd160(new Uint8Array(sha256));
}

/**
 * RIPEMD-160 hash implementation
 */
function ripemd160(message: Uint8Array): Uint8Array {
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

  const msgLen = message.length;
  const bitLen = BigInt(msgLen) * 8n;

  let padLen = 64 - ((msgLen + 9) % 64);
  if (padLen === 64) padLen = 0;

  const padded = new Uint8Array(msgLen + 1 + padLen + 8);
  padded.set(message);
  padded[msgLen] = 0x80;

  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, bitLen, true);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

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
 * Encode a UTXO for signing serialization (value + token_prefix + locking_bytecode)
 */
function encodeUtxoForSigning(input: TxInput): Uint8Array {
  const parts: Uint8Array[] = [];

  // Value (8 bytes, little-endian)
  parts.push(encodeBigInt64LE(input.satoshis));

  // Token prefix (if present)
  if (input.token) {
    const tokenPrefix = buildTokenPrefix(input.token.category, input.token.amount);
    parts.push(tokenPrefix);
  }

  // Locking script
  const scriptBytes = hexToBytes(input.scriptPubKey);
  parts.push(encodeCompactSizeBytes(scriptBytes.length));
  parts.push(scriptBytes);

  return concatBytes(...parts);
}

// ============================================================================
// Signer Implementation
// ============================================================================

/**
 * Local mnemonic signer implementation
 *
 * Signs transactions using BIP32/BIP44 derived keys from a mnemonic.
 * Private keys are derived in memory and never transmitted.
 */
export class LocalMnemonicSigner implements MnemonicSigner {
  private readonly mnemonic: string;
  private readonly network: Network;
  private readonly hdKey: HDKey;
  private secp256k1: Secp256k1 | null = null;
  private sha256: Sha256 | null = null;
  private destroyed = false;

  /**
   * Create a new LocalMnemonicSigner
   *
   * @param mnemonic - BIP39 mnemonic phrase
   * @param network - Network (mainnet/testnet)
   */
  constructor(mnemonic: string, network: Network) {
    const normalized = normalizeMnemonic(mnemonic);

    if (!validateMnemonic(normalized)) {
      throw new Error('Invalid mnemonic phrase');
    }

    this.mnemonic = normalized;
    this.network = network;

    // Derive master HD key
    const seed = mnemonicToSeed(normalized);
    this.hdKey = HDKey.fromMasterSeed(seed);
  }

  /**
   * Initialize crypto libraries (secp256k1, sha256)
   */
  private async initCrypto(): Promise<void> {
    if (!this.secp256k1) {
      this.secp256k1 = await instantiateSecp256k1();
    }
    if (!this.sha256) {
      this.sha256 = await instantiateSha256();
    }
  }

  /**
   * Get the mnemonic phrase
   */
  getMnemonic(): string {
    this.checkDestroyed();
    return this.mnemonic;
  }

  /**
   * Clear sensitive data from memory
   */
  destroy(): void {
    this.destroyed = true;
    // Note: JavaScript doesn't allow explicit memory clearing
    // The mnemonic will be garbage collected eventually
  }

  private checkDestroyed(): void {
    if (this.destroyed) {
      throw new Error('Signer has been destroyed');
    }
  }

  /**
   * Derive a private key for the given derivation info
   */
  private derivePrivateKey(derivation: AddressDerivation): Uint8Array {
    const path = getDerivationPath(this.network, derivation.accountIndex, derivation.addressIndex);
    const derived = this.hdKey.derive(path);

    if (!derived.privateKey) {
      throw new Error('Failed to derive private key');
    }

    return derived.privateKey;
  }

  /**
   * Derive a public key for the given derivation info
   */
  private derivePublicKey(derivation: AddressDerivation): Uint8Array {
    const path = getDerivationPath(this.network, derivation.accountIndex, derivation.addressIndex);
    const derived = this.hdKey.derive(path);

    if (!derived.publicKey) {
      throw new Error('Failed to derive public key');
    }

    return derived.publicKey;
  }

  /**
   * Get the public key for an address
   */
  async getPublicKey(derivation: AddressDerivation): Promise<string> {
    this.checkDestroyed();
    const pubkey = this.derivePublicKey(derivation);
    return bytesToHex(pubkey);
  }

  /**
   * Verify that this signer can sign for the given address
   */
  async canSign(address: string, derivation: AddressDerivation): Promise<boolean> {
    this.checkDestroyed();

    try {
      const pubkey = this.derivePublicKey(derivation);
      const pubkeyHash = await hash160(pubkey);
      const derivedAddress = encodeCashAddr(this.network, 'P2PKH', pubkeyHash);

      // Normalize both addresses for comparison
      const normalizedAddress = address.toLowerCase();
      const normalizedDerived = derivedAddress.toLowerCase();

      return normalizedAddress === normalizedDerived;
    } catch {
      return false;
    }
  }

  /**
   * Sign an unsigned transaction
   */
  async sign(
    tx: UnsignedTransaction,
    addressDerivations: AddressDerivation[],
    options?: SigningOptions
  ): Promise<SigningResult> {
    if (this.destroyed) {
      return { success: false, error: 'Signer has been destroyed' };
    }

    try {
      await this.initCrypto();

      if (!this.secp256k1 || !this.sha256) {
        return { success: false, error: 'Failed to initialize crypto libraries' };
      }

      const sigHashType = options?.sigHashType ?? DEFAULT_SIGHASH_TYPE;

      // Build address to derivation mapping
      const addressToDerivation = new Map<string, AddressDerivation>();
      for (const derivation of addressDerivations) {
        const normalizedAddr = derivation.address.toLowerCase();
        addressToDerivation.set(normalizedAddr, derivation);
      }

      // Prepare transaction components for signing serialization
      const transactionOutpoints = this.encodeAllOutpoints(tx.inputs);
      const transactionSequenceNumbers = this.encodeAllSequenceNumbers(tx.inputs);
      const transactionOutputs = this.encodeAllOutputsForSigning(tx.outputs);
      const transactionUtxos = this.encodeAllUtxos(tx.inputs);

      // Sign each input
      const signedInputs: SignedInput[] = [];

      for (let i = 0; i < tx.inputs.length; i++) {
        const input = tx.inputs[i];

        // Find derivation for this input's address
        const inputAddress = this.scriptPubKeyToAddress(input.scriptPubKey);
        if (!inputAddress) {
          return {
            success: false,
            error: `Cannot determine address for input ${i}`,
          };
        }

        const derivation = addressToDerivation.get(inputAddress.toLowerCase());
        if (!derivation) {
          return {
            success: false,
            error: `No derivation info for input ${i} address: ${inputAddress}`,
          };
        }

        // Derive keys
        const privateKey = this.derivePrivateKey(derivation);
        const publicKey = this.derivePublicKey(derivation);

        // Compute the signature hash
        const sigHash = this.computeSigHash(
          tx,
          i,
          input,
          sigHashType,
          transactionOutpoints,
          transactionSequenceNumbers,
          transactionOutputs,
          transactionUtxos
        );

        // Sign with secp256k1
        const signatureResult = this.secp256k1.signMessageHashDER(privateKey, sigHash);
        if (typeof signatureResult === 'string') {
          return { success: false, error: `Signing failed for input ${i}: ${signatureResult}` };
        }

        // Create scriptSig: <sig + sighash_type> <pubkey>
        const signatureWithType = concatBytes(signatureResult, new Uint8Array([sigHashType]));
        const scriptSig = this.buildP2PKHScriptSig(signatureWithType, publicKey);

        signedInputs.push({
          txid: input.txid,
          vout: input.vout,
          scriptSig: bytesToHex(scriptSig),
          sequence: DEFAULT_SEQUENCE,
        });
      }

      // Encode the full signed transaction
      const txHex = this.encodeSignedTransaction(tx, signedInputs);

      // Compute transaction ID
      const txid = hashTransaction(hexToBin(txHex));

      const signedTx: SignedTransaction = {
        version: tx.version,
        inputs: signedInputs,
        outputs: tx.outputs.map((o) => ({
          satoshis: o.satoshis,
          lockingScript: o.lockingScript,
        })),
        locktime: tx.locktime,
        txHex,
        txid,
      };

      return { success: true, transaction: signedTx };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown signing error';
      return { success: false, error: message };
    }
  }

  /**
   * Encode all input outpoints for hashPrevouts
   */
  private encodeAllOutpoints(inputs: TxInput[]): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const input of inputs) {
      // txid (32 bytes, reversed to internal byte order)
      parts.push(reverseBytes(hexToBytes(input.txid)));
      // vout (4 bytes, little-endian)
      parts.push(encodeUint32LE(input.vout));
    }
    return concatBytes(...parts);
  }

  /**
   * Encode all input sequence numbers for hashSequence
   */
  private encodeAllSequenceNumbers(inputs: TxInput[]): Uint8Array {
    const parts: Uint8Array[] = [];
    for (let i = 0; i < inputs.length; i++) {
      parts.push(encodeUint32LE(DEFAULT_SEQUENCE));
    }
    return concatBytes(...parts);
  }

  /**
   * Encode all outputs for hashOutputs
   */
  private encodeAllOutputsForSigning(outputs: TxOutput[]): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const output of outputs) {
      // Value (8 bytes, little-endian)
      parts.push(encodeBigInt64LE(output.satoshis));

      // Locking script with length prefix
      const scriptBytes = hexToBytes(output.lockingScript);
      parts.push(encodeCompactSizeBytes(scriptBytes.length));
      parts.push(scriptBytes);
    }
    return concatBytes(...parts);
  }

  /**
   * Encode all UTXOs for hashUtxos (BCH-specific)
   */
  private encodeAllUtxos(inputs: TxInput[]): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const input of inputs) {
      parts.push(encodeUtxoForSigning(input));
    }
    return concatBytes(...parts);
  }

  /**
   * Compute the signature hash for a specific input (BIP143 for BCH)
   */
  private computeSigHash(
    tx: UnsignedTransaction,
    inputIndex: number,
    input: TxInput,
    sigHashType: number,
    transactionOutpoints: Uint8Array,
    transactionSequenceNumbers: Uint8Array,
    transactionOutputs: Uint8Array,
    transactionUtxos: Uint8Array
  ): Uint8Array {
    if (!this.sha256) {
      throw new Error('SHA256 not initialized');
    }

    const sha256 = this.sha256;

    // Determine which components to include based on sighash type
    const isAnyoneCanPay = (sigHashType & SIGHASH.ANYONECANPAY) !== 0;
    const baseType = sigHashType & 0x1f;
    const isNone = baseType === SIGHASH.NONE;
    const isSingle = baseType === SIGHASH.SINGLE;

    // 1. nVersion (4 bytes)
    const nVersion = encodeUint32LE(tx.version);

    // 2. hashPrevouts (32 bytes)
    let hashPrevouts: Uint8Array;
    if (isAnyoneCanPay) {
      hashPrevouts = new Uint8Array(32); // zeros
    } else {
      hashPrevouts = sha256.hash(sha256.hash(transactionOutpoints));
    }

    // 3. hashUtxos (32 bytes) - BCH specific
    let hashUtxos: Uint8Array;
    if (isAnyoneCanPay) {
      hashUtxos = new Uint8Array(32); // zeros
    } else {
      hashUtxos = sha256.hash(sha256.hash(transactionUtxos));
    }

    // 4. hashSequence (32 bytes)
    let hashSequence: Uint8Array;
    if (isAnyoneCanPay || isSingle || isNone) {
      hashSequence = new Uint8Array(32); // zeros
    } else {
      hashSequence = sha256.hash(sha256.hash(transactionSequenceNumbers));
    }

    // 5. outpoint (36 bytes)
    const outpoint = concatBytes(reverseBytes(hexToBytes(input.txid)), encodeUint32LE(input.vout));

    // 6. Token prefix of the UTXO being spent
    let outputTokenPrefix: Uint8Array;
    if (input.token) {
      outputTokenPrefix = buildTokenPrefix(input.token.category, input.token.amount);
    } else {
      outputTokenPrefix = new Uint8Array(0);
    }

    // 7. scriptCode (the locking script of the UTXO being spent)
    const scriptCode = hexToBytes(input.scriptPubKey);
    const scriptCodeWithLen = concatBytes(encodeCompactSizeBytes(scriptCode.length), scriptCode);

    // 8. value of the output being spent (8 bytes)
    const value = encodeBigInt64LE(input.satoshis);

    // 9. nSequence of the input (4 bytes)
    const nSequence = encodeUint32LE(DEFAULT_SEQUENCE);

    // 10. hashOutputs (32 bytes)
    let hashOutputs: Uint8Array;
    if (isSingle && inputIndex < tx.outputs.length) {
      // Hash only the output at the same index
      const correspondingOutput = tx.outputs[inputIndex];
      const outputBytes = concatBytes(
        encodeBigInt64LE(correspondingOutput.satoshis),
        encodeCompactSizeBytes(hexToBytes(correspondingOutput.lockingScript).length),
        hexToBytes(correspondingOutput.lockingScript)
      );
      hashOutputs = sha256.hash(sha256.hash(outputBytes));
    } else if (isNone || (isSingle && inputIndex >= tx.outputs.length)) {
      hashOutputs = new Uint8Array(32); // zeros
    } else {
      hashOutputs = sha256.hash(sha256.hash(transactionOutputs));
    }

    // 11. nLocktime (4 bytes)
    const nLocktime = encodeUint32LE(tx.locktime);

    // 12. sighash type (4 bytes)
    const sigHashTypeBytes = encodeUint32LE(sigHashType);

    // Construct the preimage
    const preimage = concatBytes(
      nVersion, // 4 bytes
      hashPrevouts, // 32 bytes
      hashUtxos, // 32 bytes (BCH specific)
      hashSequence, // 32 bytes
      outpoint, // 36 bytes
      outputTokenPrefix, // variable (BCH token prefix)
      scriptCodeWithLen, // variable
      value, // 8 bytes
      nSequence, // 4 bytes
      hashOutputs, // 32 bytes
      nLocktime, // 4 bytes
      sigHashTypeBytes // 4 bytes
    );

    // Double SHA256 to get the signature hash
    return sha256.hash(sha256.hash(preimage));
  }

  /**
   * Build a P2PKH scriptSig from signature and public key
   */
  private buildP2PKHScriptSig(signature: Uint8Array, pubkey: Uint8Array): Uint8Array {
    // <sig_length> <signature> <pubkey_length> <pubkey>
    const parts: Uint8Array[] = [];

    // Signature with push opcode
    if (signature.length < 76) {
      parts.push(new Uint8Array([signature.length]));
    } else {
      parts.push(new Uint8Array([0x4c, signature.length])); // OP_PUSHDATA1
    }
    parts.push(signature);

    // Public key with push opcode
    parts.push(new Uint8Array([pubkey.length]));
    parts.push(pubkey);

    return concatBytes(...parts);
  }

  /**
   * Extract address from P2PKH scriptPubKey
   */
  private scriptPubKeyToAddress(scriptPubKey: string): string | null {
    const script = hexToBytes(scriptPubKey);

    // Check for token prefix
    let offset = 0;
    if (script[0] === 0xef) {
      // Skip token prefix: 0xef + 32 byte category + bitfield + varint amount
      offset = 1 + 32 + 1; // prefix + category + bitfield
      // Skip amount (varint)
      while (offset < script.length && (script[offset] & 0x80) !== 0) {
        offset++;
      }
      offset++; // Final byte of amount
    }

    // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    // 76 a9 14 <pubkeyhash> 88 ac
    if (
      script.length >= offset + 25 &&
      script[offset] === 0x76 &&
      script[offset + 1] === 0xa9 &&
      script[offset + 2] === 0x14 &&
      script[offset + 23] === 0x88 &&
      script[offset + 24] === 0xac
    ) {
      const pubkeyHash = script.slice(offset + 3, offset + 23);
      return encodeCashAddr(this.network, 'P2PKH', pubkeyHash);
    }

    return null;
  }

  /**
   * Encode a signed transaction to raw hex
   */
  private encodeSignedTransaction(tx: UnsignedTransaction, signedInputs: SignedInput[]): string {
    const parts: Uint8Array[] = [];

    // Version (4 bytes, little-endian)
    parts.push(encodeUint32LE(tx.version));

    // Input count
    parts.push(encodeCompactSizeBytes(signedInputs.length));

    // Inputs
    for (const input of signedInputs) {
      // Previous txid (32 bytes, reversed)
      parts.push(reverseBytes(hexToBytes(input.txid)));
      // Previous vout (4 bytes)
      parts.push(encodeUint32LE(input.vout));
      // ScriptSig
      const scriptSig = hexToBytes(input.scriptSig);
      parts.push(encodeCompactSizeBytes(scriptSig.length));
      parts.push(scriptSig);
      // Sequence (4 bytes)
      parts.push(encodeUint32LE(input.sequence));
    }

    // Output count
    parts.push(encodeCompactSizeBytes(tx.outputs.length));

    // Outputs
    for (const output of tx.outputs) {
      // Value (8 bytes, little-endian)
      parts.push(encodeBigInt64LE(output.satoshis));
      // Locking script
      const lockingScript = hexToBytes(output.lockingScript);
      parts.push(encodeCompactSizeBytes(lockingScript.length));
      parts.push(lockingScript);
    }

    // Locktime (4 bytes)
    parts.push(encodeUint32LE(tx.locktime));

    return bytesToHex(concatBytes(...parts));
  }
}

/**
 * Create a LocalMnemonicSigner instance
 */
export function createLocalMnemonicSigner(mnemonic: string, network: Network): LocalMnemonicSigner {
  return new LocalMnemonicSigner(mnemonic, network);
}
