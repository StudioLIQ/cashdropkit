/**
 * Electrum Protocol Types
 *
 * Types for Electrum JSON-RPC protocol over WebSocket.
 * Compatible with Fulcrum servers that support CashTokens.
 */

// ============================================================================
// JSON-RPC Types
// ============================================================================

/**
 * JSON-RPC request
 */
export interface ElectrumRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

/**
 * JSON-RPC response
 */
export interface ElectrumResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: ElectrumError;
}

/**
 * JSON-RPC error
 */
export interface ElectrumError {
  code: number;
  message: string;
  data?: unknown;
}

// ============================================================================
// Electrum UTXO Types
// ============================================================================

/**
 * Raw UTXO from blockchain.address.listunspent
 * Note: Fulcrum with CashTokens support includes token_data
 */
export interface ElectrumUtxo {
  tx_hash: string;
  tx_pos: number;
  height: number;
  value: number; // satoshis
  token_data?: ElectrumTokenData;
}

/**
 * Token data attached to UTXO (Fulcrum CashTokens format)
 */
export interface ElectrumTokenData {
  category: string; // hex token category (genesis txid)
  amount?: string; // fungible amount as string (can be large)
  nft?: ElectrumNftData;
}

/**
 * NFT data
 */
export interface ElectrumNftData {
  capability: 'none' | 'mutable' | 'minting';
  commitment: string; // hex
}

// ============================================================================
// Electrum Balance Types
// ============================================================================

/**
 * Balance from blockchain.address.get_balance
 */
export interface ElectrumBalance {
  confirmed: number;
  unconfirmed: number;
}

// ============================================================================
// Electrum Transaction Types
// ============================================================================

/**
 * Transaction history item from blockchain.address.get_history
 */
export interface ElectrumHistoryItem {
  tx_hash: string;
  height: number; // 0 or -1 for unconfirmed
  fee?: number;
}

/**
 * Raw transaction from blockchain.transaction.get (verbose)
 */
export interface ElectrumTransaction {
  txid: string;
  hash: string;
  version: number;
  size: number;
  vsize: number;
  locktime: number;
  vin: ElectrumTxInput[];
  vout: ElectrumTxOutput[];
  hex: string;
  blockhash?: string;
  confirmations?: number;
  time?: number;
  blocktime?: number;
  fee?: number;
}

/**
 * Transaction input
 */
export interface ElectrumTxInput {
  txid: string;
  vout: number;
  scriptSig: { asm: string; hex: string };
  sequence: number;
}

/**
 * Transaction output
 */
export interface ElectrumTxOutput {
  value: number;
  n: number;
  scriptPubKey: {
    asm: string;
    hex: string;
    type: string;
    addresses?: string[];
  };
  token_data?: ElectrumTokenData;
}

// ============================================================================
// Electrum Block Types
// ============================================================================

/**
 * Block header from blockchain.block.header
 */
export interface ElectrumBlockHeader {
  height: number;
  hex: string;
}

/**
 * Parsed block header
 */
export interface ParsedBlockHeader {
  version: number;
  previousHash: string;
  merkleRoot: string;
  timestamp: number;
  bits: number;
  nonce: number;
}

// ============================================================================
// Electrum Server Info
// ============================================================================

/**
 * Server version/features from server.version or server.features
 */
export interface ElectrumServerFeatures {
  genesis_hash: string;
  hash_function: string;
  hosts?: Record<string, Record<string, unknown>>;
  protocol_max: string;
  protocol_min: string;
  pruning?: number;
  server_version: string;
}

// ============================================================================
// Electrum Client Configuration
// ============================================================================

/**
 * Electrum client configuration
 */
export interface ElectrumClientConfig {
  url: string;
  timeout?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_ELECTRUM_CONFIG: Required<Omit<ElectrumClientConfig, 'url'>> = {
  timeout: 30000, // 30 seconds
  reconnectDelay: 1000, // 1 second initial delay
  maxReconnectAttempts: 5,
  pingInterval: 60000, // 1 minute
};

// ============================================================================
// Connection State
// ============================================================================

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Connection event types
 */
export type ConnectionEvent = 'connect' | 'disconnect' | 'error' | 'reconnecting';
