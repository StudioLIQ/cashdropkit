/**
 * Signer Interface
 *
 * Defines the contract for transaction signing implementations.
 * All signing happens locally - secrets never leave the client runtime.
 */
import type { UnsignedTransaction } from '../tx/tokenTxBuilder';

// ============================================================================
// Types
// ============================================================================

/**
 * Signed input with signature and public key
 */
export interface SignedInput {
  /** Transaction ID of the input */
  txid: string;
  /** Output index */
  vout: number;
  /** ScriptSig (unlocking script) containing signature + pubkey */
  scriptSig: string;
  /** Sequence number */
  sequence: number;
}

/**
 * Signed transaction ready for broadcast
 */
export interface SignedTransaction {
  /** Transaction version */
  version: number;
  /** Signed inputs */
  inputs: SignedInput[];
  /** Outputs (unchanged from unsigned) */
  outputs: Array<{
    satoshis: bigint;
    lockingScript: string;
  }>;
  /** Locktime */
  locktime: number;
  /** Raw transaction hex for broadcasting */
  txHex: string;
  /** Transaction ID (double SHA256 of raw tx, reversed) */
  txid: string;
}

/**
 * Signing options
 */
export interface SigningOptions {
  /** SIGHASH type (default: SIGHASH_ALL | SIGHASH_FORKID = 0x41) */
  sigHashType?: number;
}

/**
 * Result of signing operation
 */
export interface SigningResult {
  success: boolean;
  transaction?: SignedTransaction;
  error?: string;
}

/**
 * Mapping of address to derivation index
 * Used to find the correct private key for each input
 */
export interface AddressDerivation {
  /** CashAddr address */
  address: string;
  /** Account index in BIP44 path */
  accountIndex: number;
  /** Address index within account */
  addressIndex: number;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * SIGHASH flags for BCH
 */
export const SIGHASH = {
  /** Sign all inputs and outputs */
  ALL: 0x01,
  /** Sign no outputs */
  NONE: 0x02,
  /** Sign only the output at the same index as input */
  SINGLE: 0x03,
  /** Sign only this input */
  ANYONECANPAY: 0x80,
  /** BCH fork ID flag (required for replay protection) */
  FORKID: 0x40,
} as const;

/**
 * Default SIGHASH type for BCH: ALL | FORKID
 */
export const DEFAULT_SIGHASH_TYPE = SIGHASH.ALL | SIGHASH.FORKID;

// ============================================================================
// Signer Interface
// ============================================================================

/**
 * Signer interface for transaction signing
 *
 * Implementations must:
 * - Never transmit private keys/mnemonic off-device
 * - Sign locally using derived keys
 * - Support multiple inputs with different derivation paths
 */
export interface Signer {
  /**
   * Sign an unsigned transaction
   *
   * @param tx - Unsigned transaction to sign
   * @param addressDerivations - Mapping of input addresses to derivation paths
   * @param options - Optional signing parameters
   * @returns Signed transaction or error
   */
  sign(
    tx: UnsignedTransaction,
    addressDerivations: AddressDerivation[],
    options?: SigningOptions
  ): Promise<SigningResult>;

  /**
   * Get the public key for an address
   *
   * @param derivation - Derivation path info
   * @returns Public key as hex string
   */
  getPublicKey(derivation: AddressDerivation): Promise<string>;

  /**
   * Verify that this signer can sign for the given address
   *
   * @param address - Address to check
   * @param derivation - Derivation path info
   * @returns true if address matches derived address
   */
  canSign(address: string, derivation: AddressDerivation): Promise<boolean>;
}

/**
 * Extended interface for mnemonic-based signers
 */
export interface MnemonicSigner extends Signer {
  /**
   * Get the mnemonic (for backup/export purposes)
   * Should only be called when explicitly needed
   */
  getMnemonic(): string;

  /**
   * Clear sensitive data from memory
   * Call when done with signing operations
   */
  destroy(): void;
}
