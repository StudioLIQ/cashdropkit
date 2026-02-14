/**
 * ChainAdapter Interface
 *
 * Abstract interface for blockchain data providers.
 * All chain interactions go through this interface.
 *
 * Key principles:
 * - Provider-agnostic: implementations can use different APIs
 * - Never transmit secrets: private keys/mnemonics stay local
 * - Fail-closed: errors should be explicit, not silent
 * - Retryable: transient failures should be handled gracefully
 */
import type { Network } from '../../db/types';
import type {
  AddressBalance,
  BlockInfo,
  BroadcastResult,
  ChainAdapterConfig,
  ChainTip,
  TokenBalance,
  TokenUtxo,
  TxStatus,
  Utxo,
} from './types';

/**
 * Chain Adapter Interface
 *
 * Implementations must:
 * - Be stateless (can be instantiated multiple times)
 * - Handle retries internally based on config
 * - Throw ChainAdapterError for failures
 * - Support both mainnet and testnet
 */
export interface ChainAdapter {
  /**
   * Adapter name for identification
   */
  readonly name: string;

  /**
   * Network this adapter is configured for
   */
  readonly network: Network;

  /**
   * Configuration used by this adapter
   */
  readonly config: ChainAdapterConfig;

  // ==========================================================================
  // UTXO Methods
  // ==========================================================================

  /**
   * Get all UTXOs for an address (both BCH-only and token UTXOs)
   *
   * @param address - CashAddr format address
   * @returns Array of UTXOs (may include TokenUtxos)
   */
  getUtxos(address: string): Promise<(Utxo | TokenUtxo)[]>;

  /**
   * Get only BCH UTXOs (no tokens attached)
   *
   * @param address - CashAddr format address
   * @returns Array of BCH-only UTXOs
   */
  getBchUtxos(address: string): Promise<Utxo[]>;

  /**
   * Get only token UTXOs (has CashToken attached)
   *
   * @param address - CashAddr format address
   * @param category - Optional: filter by token category
   * @returns Array of token UTXOs
   */
  getTokenUtxos(address: string, category?: string): Promise<TokenUtxo[]>;

  // ==========================================================================
  // Balance Methods
  // ==========================================================================

  /**
   * Get BCH balance for an address
   *
   * @param address - CashAddr format address
   * @returns Balance summary
   */
  getBalance(address: string): Promise<AddressBalance>;

  /**
   * Get token balances for an address
   *
   * @param address - CashAddr format address
   * @param category - Optional: filter by token category
   * @returns Array of token balances
   */
  getTokenBalances(address: string, category?: string): Promise<TokenBalance[]>;

  // ==========================================================================
  // Transaction Methods
  // ==========================================================================

  /**
   * Broadcast a signed transaction
   *
   * @param rawTxHex - Raw transaction in hex format
   * @returns Broadcast result with txid or error
   */
  broadcast(rawTxHex: string): Promise<BroadcastResult>;

  /**
   * Get transaction status
   *
   * @param txid - Transaction ID
   * @returns Transaction status
   */
  getTxStatus(txid: string): Promise<TxStatus>;

  /**
   * Get raw transaction hex
   *
   * @param txid - Transaction ID
   * @returns Raw transaction hex or null if not found
   */
  getRawTx(txid: string): Promise<string | null>;

  // ==========================================================================
  // Block/Chain Methods
  // ==========================================================================

  /**
   * Get current chain tip
   *
   * @returns Current chain tip info
   */
  getChainTip(): Promise<ChainTip>;

  /**
   * Get block info by height
   *
   * @param height - Block height
   * @returns Block info or null if not found
   */
  getBlock(height: number): Promise<BlockInfo | null>;

  /**
   * Get block info by hash
   *
   * @param hash - Block hash
   * @returns Block info or null if not found
   */
  getBlockByHash(hash: string): Promise<BlockInfo | null>;

  // ==========================================================================
  // Health/Status Methods
  // ==========================================================================

  /**
   * Check if the adapter is healthy/connected
   *
   * @returns true if healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get estimated fee rate
   *
   * @param confirmTarget - Target confirmations (1-25)
   * @returns Estimated sat/byte fee rate
   */
  estimateFeeRate(confirmTarget?: number): Promise<number>;
}

/**
 * Factory function type for creating chain adapters
 */
export type ChainAdapterFactory = (config: ChainAdapterConfig) => ChainAdapter;

/**
 * Registry of available chain adapters
 */
export interface ChainAdapterRegistry {
  /**
   * Get adapter by name
   */
  get(name: string): ChainAdapterFactory | undefined;

  /**
   * Register an adapter factory
   */
  register(name: string, factory: ChainAdapterFactory): void;

  /**
   * Get list of registered adapter names
   */
  list(): string[];
}

/**
 * Create a simple chain adapter registry
 */
export function createAdapterRegistry(): ChainAdapterRegistry {
  const factories = new Map<string, ChainAdapterFactory>();

  return {
    get(name: string): ChainAdapterFactory | undefined {
      return factories.get(name);
    },

    register(name: string, factory: ChainAdapterFactory): void {
      factories.set(name, factory);
    },

    list(): string[] {
      return Array.from(factories.keys());
    },
  };
}

/**
 * Global adapter registry instance
 */
export const adapterRegistry = createAdapterRegistry();
