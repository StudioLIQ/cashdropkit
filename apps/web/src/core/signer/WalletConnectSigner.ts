/**
 * Extension Wallet Signer
 *
 * Uses browser wallet hooks to sign prepared unsigned transactions.
 */
import { hashTransaction, hexToBin } from '@bitauth/libauth';

import type { UnsignedTransaction } from '@/core/tx/tokenTxBuilder';
import { hexToBytes } from '@/core/tx/tokenTxBuilder';

import type { AddressDerivation, MnemonicSigner, SigningResult } from './Signer';

interface WcSignTransactionResponse {
  signedTransaction: string;
  signedTransactionHash: string;
}

const DEFAULT_SEQUENCE = 0xfffffffe;

type SignTransactionFn = (options: {
  txRequest: {
    transaction: string;
    sourceOutputs: Array<{
      outpointIndex: number;
      outpointTransactionHash: Uint8Array;
      sequenceNumber: number;
      unlockingBytecode: Uint8Array;
      valueSatoshis: bigint;
      lockingBytecode: Uint8Array;
      token?: {
        amount: bigint;
        category: Uint8Array;
        nft?: {
          capability: 'none' | 'mutable' | 'minting';
          commitment: Uint8Array;
        };
      };
    }>;
    broadcast: false;
    userPrompt?: string;
  };
}) => Promise<WcSignTransactionResponse | null>;

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

function encodeCompactSize(value: number): Uint8Array {
  if (value < 253) return new Uint8Array([value]);
  if (value <= 0xffff) {
    return new Uint8Array([253, value & 0xff, (value >> 8) & 0xff]);
  }
  if (value <= 0xffffffff) {
    const buf = new Uint8Array(5);
    buf[0] = 254;
    const view = new DataView(buf.buffer);
    view.setUint32(1, value, true);
    return buf;
  }
  throw new Error('Value too large for CompactSize');
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

function reverseBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes).reverse();
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHex(value: string): string {
  return value.startsWith('0x') ? value.slice(2).toLowerCase() : value.toLowerCase();
}

function serializeUnsignedTransaction(tx: UnsignedTransaction): string {
  const parts: Uint8Array[] = [];

  parts.push(encodeUint32LE(tx.version));
  parts.push(encodeCompactSize(tx.inputs.length));

  for (const input of tx.inputs) {
    parts.push(reverseBytes(hexToBytes(input.txid)));
    parts.push(encodeUint32LE(input.vout));
    parts.push(encodeCompactSize(0));
    parts.push(encodeUint32LE(DEFAULT_SEQUENCE));
  }

  parts.push(encodeCompactSize(tx.outputs.length));
  for (const output of tx.outputs) {
    const lockingScript = hexToBytes(output.lockingScript);
    parts.push(encodeBigInt64LE(output.satoshis));
    parts.push(encodeCompactSize(lockingScript.length));
    parts.push(lockingScript);
  }

  parts.push(encodeUint32LE(tx.locktime));

  return bytesToHex(concatBytes(...parts));
}

function toSourceOutputs(tx: UnsignedTransaction) {
  return tx.inputs.map((input) => ({
    outpointIndex: input.vout,
    outpointTransactionHash: hexToBytes(input.txid),
    sequenceNumber: DEFAULT_SEQUENCE,
    unlockingBytecode: new Uint8Array(),
    valueSatoshis: input.satoshis,
    lockingBytecode: hexToBytes(input.scriptPubKey),
    token: input.token
      ? {
          amount: input.token.amount,
          category: hexToBytes(input.token.category),
          nft:
            input.token.nftCommitment && input.token.nftCapability
              ? {
                  capability: input.token.nftCapability,
                  commitment: hexToBytes(input.token.nftCommitment),
                }
              : undefined,
        }
      : undefined,
  }));
}

export class WalletConnectSigner implements MnemonicSigner {
  private readonly signWithWallet: SignTransactionFn;

  constructor(signWithWallet: SignTransactionFn) {
    this.signWithWallet = signWithWallet;
  }

  async sign(
    tx: UnsignedTransaction,
    addressDerivations: AddressDerivation[]
  ): Promise<SigningResult> {
    try {
      void addressDerivations;
      const unsignedHex = serializeUnsignedTransaction(tx);
      const response = await this.signWithWallet({
        txRequest: {
          transaction: unsignedHex,
          sourceOutputs: toSourceOutputs(tx),
          broadcast: false,
          userPrompt: `Sign CashDrop batch (${tx.outputs.length} outputs)`,
        },
      });

      if (!response) {
        return {
          success: false,
          error: 'Transaction signing was canceled or rejected by wallet',
        };
      }

      const txHex = normalizeHex(response.signedTransaction);
      let txid = normalizeHex(response.signedTransactionHash);
      if (txid.length !== 64) {
        txid = hashTransaction(hexToBin(txHex));
      }

      return {
        success: true,
        transaction: {
          version: tx.version,
          inputs: tx.inputs.map((input) => ({
            txid: input.txid,
            vout: input.vout,
            scriptSig: '',
            sequence: DEFAULT_SEQUENCE,
          })),
          outputs: tx.outputs.map((output) => ({
            satoshis: output.satoshis,
            lockingScript: output.lockingScript,
          })),
          locktime: tx.locktime,
          txHex,
          txid,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Extension wallet signing failed',
      };
    }
  }

  async getPublicKey(): Promise<string> {
    throw new Error('Extension signer does not expose public key derivation');
  }

  async canSign(): Promise<boolean> {
    return true;
  }

  getMnemonic(): string {
    throw new Error('Mnemonic is not available for extension wallet signer');
  }

  destroy(): void {
    // no-op
  }
}

export function createWalletConnectSigner(signWithWallet: SignTransactionFn): WalletConnectSigner {
  return new WalletConnectSigner(signWithWallet);
}
