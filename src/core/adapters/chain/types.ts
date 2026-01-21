/**
 * Chain Adapter Types
 *
 * Core types for blockchain data interaction.
 * These types are provider-agnostic.
 */
import type { Network } from '../../db/types';

// ============================================================================
// Basic Types
// ============================================================================

/**
 * Outpoint reference (txid + vout)
 */
export interface Outpoint {
  txid: string;
  vout: number;
}

/**
 * Create outpoint ID string for use as unique key
 */
export function outpointId(outpoint: Outpoint): string {
  return `${outpoint.txid}:${outpoint.vout}`;
}

/**
 * Parse outpoint ID string
 */
export function parseOutpointId(id: string): Outpoint {
  const [txid, voutStr] = id.split(':');
  return { txid, vout: parseInt(voutStr, 10) };
}

// ============================================================================
// UTXO Types
// ============================================================================

/**
 * Basic BCH UTXO (no token)
 */
export interface Utxo {
  txid: string;
  vout: number;
  satoshis: bigint;
  scriptPubKey: string; // hex
  confirmations: number;
  blockHeight?: number;
}

/**
 * CashToken data attached to a UTXO
 */
export interface CashToken {
  /** Token category (genesis txid) */
  category: string;

  /** Token amount (fungible tokens) */
  amount: bigint;

  /** NFT commitment (if NFT) */
  nftCommitment?: string;

  /** NFT capability (none/mutable/minting) */
  nftCapability?: 'none' | 'mutable' | 'minting';
}

/**
 * Token UTXO (BCH with CashToken attached)
 */
export interface TokenUtxo extends Utxo {
  token: CashToken;
}

/**
 * Check if UTXO has a token
 */
export function isTokenUtxo(utxo: Utxo | TokenUtxo): utxo is TokenUtxo {
  return 'token' in utxo && utxo.token !== undefined;
}

/**
 * Check if token UTXO is an NFT
 */
export function isNftUtxo(utxo: TokenUtxo): boolean {
  return utxo.token.nftCommitment !== undefined || utxo.token.nftCapability !== undefined;
}

/**
 * Check if token UTXO is fungible only (no NFT)
 */
export function isFungibleUtxo(utxo: TokenUtxo): boolean {
  return !isNftUtxo(utxo);
}

// ============================================================================
// Transaction Status
// ============================================================================

/**
 * Transaction status in the network
 */
export type TxStatusType =
  | 'UNKNOWN' // Never seen or not found
  | 'MEMPOOL' // In mempool, unconfirmed
  | 'CONFIRMED' // At least 1 confirmation
  | 'DROPPED'; // Was in mempool, now gone (suspected dropped)

/**
 * Transaction status result
 */
export interface TxStatus {
  txid: string;
  status: TxStatusType;
  confirmations: number;
  blockHeight?: number;
  blockHash?: string;
  timestamp?: number;
  fee?: bigint;
  size?: number;
}

// ============================================================================
// Block Info
// ============================================================================

/**
 * Block information
 */
export interface BlockInfo {
  height: number;
  hash: string;
  timestamp: number;
  size: number;
  txCount: number;
  previousHash: string;
}

/**
 * Chain tip info (latest block)
 */
export interface ChainTip {
  height: number;
  hash: string;
  timestamp: number;
}

// ============================================================================
// Address Balance
// ============================================================================

/**
 * Address balance summary
 */
export interface AddressBalance {
  address: string;
  confirmed: bigint;
  unconfirmed: bigint;
  total: bigint;
}

/**
 * Token balance for an address
 */
export interface TokenBalance {
  category: string;
  fungibleAmount: bigint;
  nftCount: number;
}

// ============================================================================
// Broadcast Result
// ============================================================================

/**
 * Result of broadcasting a transaction
 */
export interface BroadcastResult {
  success: boolean;
  txid?: string;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// Adapter Configuration
// ============================================================================

/**
 * Chain adapter configuration
 */
export interface ChainAdapterConfig {
  network: Network;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_ADAPTER_CONFIG: Partial<ChainAdapterConfig> = {
  timeout: 30000, // 30 seconds
  retries: 3,
  retryDelay: 1000, // 1 second
};

// ============================================================================
// Errors
// ============================================================================

/**
 * Chain adapter error types
 */
export type ChainAdapterErrorType =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'NOT_FOUND'
  | 'INVALID_RESPONSE'
  | 'BROADCAST_FAILED'
  | 'PROVIDER_ERROR'
  | 'UNKNOWN';

/**
 * Chain adapter error
 */
export class ChainAdapterError extends Error {
  readonly type: ChainAdapterErrorType;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(type: ChainAdapterErrorType, message: string, details?: unknown) {
    super(message);
    this.name = 'ChainAdapterError';
    this.type = type;
    this.details = details;

    // Determine if error is retryable
    this.retryable = ['NETWORK_ERROR', 'TIMEOUT', 'RATE_LIMIT'].includes(type);
  }
}
