/**
 * Electrum Chain Adapter
 *
 * ChainAdapter implementation using Electrum protocol over WebSocket.
 * Compatible with Fulcrum servers that support CashTokens.
 */
import type { Network } from '../../../db/types';
import { type AddressType, decodeCashAddr } from '../../../wallet/cashaddr';
import type { ChainAdapter } from '../ChainAdapter';
import {
  type AddressBalance,
  type BlockInfo,
  type BroadcastResult,
  type ChainAdapterConfig,
  ChainAdapterError,
  type ChainTip,
  DEFAULT_ADAPTER_CONFIG,
  type TokenBalance,
  type TokenUtxo,
  type TxStatus,
  type TxStatusType,
  type Utxo,
} from '../types';
import { ElectrumClient } from './ElectrumClient';
import type { ElectrumBalance, ElectrumTransaction, ElectrumUtxo } from './types';

/**
 * Extended config for Electrum adapter
 */
export interface ElectrumAdapterConfig extends ChainAdapterConfig {
  /** WebSocket URL (e.g., wss://electrum.bitcoincash.network:50004) */
  wsUrl: string;
}

/**
 * Default Electrum endpoints
 */
export const DEFAULT_ELECTRUM_ENDPOINTS: Record<Network, string> = {
  mainnet: 'wss://electrum.bitcoincash.network:50004',
  testnet: 'wss://chipnet.imaginary.cash:50004',
};

/**
 * Electrum Chain Adapter
 *
 * Implements ChainAdapter interface using Fulcrum/ElectrumX servers.
 * Supports CashTokens via token_data in UTXO responses.
 */
export class ElectrumAdapter implements ChainAdapter {
  readonly name = 'electrum';
  readonly network: Network;
  readonly config: ChainAdapterConfig;

  private readonly client: ElectrumClient;
  private readonly wsUrl: string;

  constructor(config: ElectrumAdapterConfig) {
    this.network = config.network;
    this.wsUrl = config.wsUrl || DEFAULT_ELECTRUM_ENDPOINTS[config.network];

    this.config = {
      ...DEFAULT_ADAPTER_CONFIG,
      ...config,
    };

    this.client = new ElectrumClient({
      url: this.wsUrl,
      timeout: this.config.timeout,
    });
  }

  /**
   * Ensure client is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.client.isConnected()) {
      await this.client.connect();
      // Negotiate protocol version
      await this.client.request<[string, string]>('server.version', [
        'CashDropKit',
        ['1.4', '1.5'],
      ]);
    }
  }

  /**
   * Execute request with retry logic
   */
  private async withRetry<T>(fn: () => Promise<T>, retries?: number): Promise<T> {
    const maxRetries = retries ?? this.config.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        const isRetryable = this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries - 1) {
          throw this.wrapError(error);
        }

        // Exponential backoff
        const delay = (this.config.retryDelay ?? 1000) * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw this.wrapError(lastError);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('network') ||
        message.includes('econnrefused') ||
        message.includes('econnreset')
      );
    }
    return false;
  }

  /**
   * Wrap error in ChainAdapterError
   */
  private wrapError(error: unknown): ChainAdapterError {
    if (error instanceof ChainAdapterError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('timeout')) {
      return new ChainAdapterError('TIMEOUT', message, error);
    }
    if (message.includes('connection') || message.includes('network')) {
      return new ChainAdapterError('NETWORK_ERROR', message, error);
    }
    if (message.includes('not found')) {
      return new ChainAdapterError('NOT_FOUND', message, error);
    }

    return new ChainAdapterError('PROVIDER_ERROR', message, error);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // UTXO Methods
  // ==========================================================================

  async getUtxos(address: string): Promise<(Utxo | TokenUtxo)[]> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      const scriptHash = await this.addressToScriptHash(address);
      const utxos = await this.client.request<ElectrumUtxo[]>('blockchain.scripthash.listunspent', [
        scriptHash,
      ]);

      return utxos.map((utxo) => this.convertUtxo(utxo, address));
    });
  }

  async getBchUtxos(address: string): Promise<Utxo[]> {
    const allUtxos = await this.getUtxos(address);
    return allUtxos.filter((utxo): utxo is Utxo => !('token' in utxo));
  }

  async getTokenUtxos(address: string, category?: string): Promise<TokenUtxo[]> {
    const allUtxos = await this.getUtxos(address);
    const tokenUtxos = allUtxos.filter((utxo): utxo is TokenUtxo => 'token' in utxo);

    if (category) {
      return tokenUtxos.filter((utxo) => utxo.token.category === category);
    }
    return tokenUtxos;
  }

  // ==========================================================================
  // Balance Methods
  // ==========================================================================

  async getBalance(address: string): Promise<AddressBalance> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      const scriptHash = await this.addressToScriptHash(address);
      const balance = await this.client.request<ElectrumBalance>(
        'blockchain.scripthash.get_balance',
        [scriptHash]
      );

      return {
        address,
        confirmed: BigInt(balance.confirmed),
        unconfirmed: BigInt(balance.unconfirmed),
        total: BigInt(balance.confirmed + balance.unconfirmed),
      };
    });
  }

  async getTokenBalances(address: string, category?: string): Promise<TokenBalance[]> {
    const tokenUtxos = await this.getTokenUtxos(address, category);

    // Aggregate by category
    const balanceMap = new Map<
      string,
      {
        fungibleAmount: bigint;
        nftCount: number;
      }
    >();

    for (const utxo of tokenUtxos) {
      const cat = utxo.token.category;
      const existing = balanceMap.get(cat) || { fungibleAmount: BigInt(0), nftCount: 0 };

      existing.fungibleAmount += utxo.token.amount;
      if (utxo.token.nftCommitment !== undefined || utxo.token.nftCapability !== undefined) {
        existing.nftCount++;
      }

      balanceMap.set(cat, existing);
    }

    return Array.from(balanceMap.entries()).map(([cat, bal]) => ({
      category: cat,
      fungibleAmount: bal.fungibleAmount,
      nftCount: bal.nftCount,
    }));
  }

  // ==========================================================================
  // Transaction Methods
  // ==========================================================================

  async broadcast(rawTxHex: string): Promise<BroadcastResult> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      try {
        const txid = await this.client.request<string>('blockchain.transaction.broadcast', [
          rawTxHex,
        ]);
        return { success: true, txid };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Parse error code if available
        const codeMatch = message.match(/\((-?\d+)\)/);
        const errorCode = codeMatch ? codeMatch[1] : undefined;

        return {
          success: false,
          error: message,
          errorCode,
        };
      }
    });
  }

  async getTxStatus(txid: string): Promise<TxStatus> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      try {
        // Try to get verbose transaction
        const tx = await this.client.request<ElectrumTransaction | string>(
          'blockchain.transaction.get',
          [txid, true]
        );

        // If we got a string, it's just the hex (non-verbose mode fell through)
        if (typeof tx === 'string') {
          return {
            txid,
            status: 'MEMPOOL' as TxStatusType,
            confirmations: 0,
          };
        }

        const confirmations = tx.confirmations ?? 0;
        let status: TxStatusType;

        if (confirmations > 0) {
          status = 'CONFIRMED';
        } else {
          status = 'MEMPOOL';
        }

        return {
          txid,
          status,
          confirmations,
          blockHeight: tx.blockhash ? undefined : undefined, // Height not directly available
          blockHash: tx.blockhash,
          timestamp: tx.time ?? tx.blocktime,
          fee: tx.fee !== undefined ? BigInt(Math.round(tx.fee * 100000000)) : undefined,
          size: tx.size,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Transaction not found
        if (message.toLowerCase().includes('not found') || message.includes('No such mempool')) {
          return {
            txid,
            status: 'UNKNOWN' as TxStatusType,
            confirmations: 0,
          };
        }
        throw error;
      }
    });
  }

  async getRawTx(txid: string): Promise<string | null> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      try {
        const hex = await this.client.request<string>('blockchain.transaction.get', [txid, false]);
        return hex;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes('not found')) {
          return null;
        }
        throw error;
      }
    });
  }

  // ==========================================================================
  // Block/Chain Methods
  // ==========================================================================

  async getChainTip(): Promise<ChainTip> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      // Subscribe to get the current tip
      const headerHex = await this.client.request<{ height: number; hex: string }>(
        'blockchain.headers.subscribe',
        []
      );

      const header = this.parseBlockHeader(headerHex.hex);

      return {
        height: headerHex.height,
        hash: await this.doubleHash(headerHex.hex),
        timestamp: header.timestamp,
      };
    });
  }

  async getBlock(height: number): Promise<BlockInfo | null> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      try {
        const headerHex = await this.client.request<string>('blockchain.block.header', [height]);

        const header = this.parseBlockHeader(headerHex);
        const hash = await this.doubleHash(headerHex);

        return {
          height,
          hash,
          timestamp: header.timestamp,
          size: 0, // Not available from header
          txCount: 0, // Not available from header
          previousHash: header.previousHash,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes('not found') || message.includes('out of range')) {
          return null;
        }
        throw error;
      }
    });
  }

  async getBlockByHash(hash: string): Promise<BlockInfo | null> {
    // Electrum doesn't directly support getting block by hash
    // We'd need to track this separately or use a different endpoint
    // For now, return null (not supported via this method)
    void hash; // Mark as intentionally unused
    console.warn('getBlockByHash not directly supported by Electrum protocol');
    return null;
  }

  // ==========================================================================
  // Health/Status Methods
  // ==========================================================================

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureConnected();
      await this.client.request('server.ping');
      return true;
    } catch {
      return false;
    }
  }

  async estimateFeeRate(confirmTarget: number = 1): Promise<number> {
    return this.withRetry(async () => {
      await this.ensureConnected();

      try {
        // Electrum returns BTC/kB, we need sat/byte
        const feePerKb = await this.client.request<number>('blockchain.estimatefee', [
          confirmTarget,
        ]);

        if (feePerKb < 0) {
          // -1 means fee estimation is not available
          // Return a reasonable default
          return 1; // 1 sat/byte minimum
        }

        // Convert BTC/kB to sat/byte
        // feePerKb is in BCH, 1 BCH = 100,000,000 sats
        // 1 kB = 1000 bytes
        const satPerByte = Math.ceil((feePerKb * 100000000) / 1000);
        return Math.max(satPerByte, 1); // Ensure minimum 1 sat/byte
      } catch {
        // Fee estimation not available, return default
        return 1;
      }
    });
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Convert CashAddr to scripthash for Electrum queries
   */
  private async addressToScriptHash(address: string): Promise<string> {
    // Decode address using our cashaddr module
    let decoded: { type: AddressType; hash: Uint8Array };
    try {
      decoded = decodeCashAddr(address);
    } catch (error) {
      throw new ChainAdapterError(
        'INVALID_RESPONSE',
        `Invalid address: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Build locking bytecode from address type and hash
    const lockingBytecode = this.buildLockingBytecode(decoded.type, decoded.hash);

    // Hash the locking bytecode (SHA256, then reverse for Electrum)
    const hashBuffer = await crypto.subtle.digest('SHA-256', lockingBytecode.buffer as ArrayBuffer);
    const hashArray = new Uint8Array(hashBuffer);

    // Reverse for Electrum format (little-endian)
    const reversed = hashArray.reverse();
    return Array.from(reversed)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Build locking bytecode from address type and hash
   */
  private buildLockingBytecode(type: AddressType, hash: Uint8Array): Uint8Array {
    if (type === 'P2PKH') {
      // P2PKH: OP_DUP OP_HASH160 <20-byte push> <hash> OP_EQUALVERIFY OP_CHECKSIG
      // Opcodes: 0x76 0xa9 0x14 <hash> 0x88 0xac
      const script = new Uint8Array(25);
      script[0] = 0x76; // OP_DUP
      script[1] = 0xa9; // OP_HASH160
      script[2] = 0x14; // Push 20 bytes
      script.set(hash, 3);
      script[23] = 0x88; // OP_EQUALVERIFY
      script[24] = 0xac; // OP_CHECKSIG
      return script;
    } else {
      // P2SH: OP_HASH160 <20-byte push> <hash> OP_EQUAL
      // Opcodes: 0xa9 0x14 <hash> 0x87
      const script = new Uint8Array(23);
      script[0] = 0xa9; // OP_HASH160
      script[1] = 0x14; // Push 20 bytes
      script.set(hash, 2);
      script[22] = 0x87; // OP_EQUAL
      return script;
    }
  }

  /**
   * Convert Electrum UTXO to our format
   */
  private convertUtxo(electrumUtxo: ElectrumUtxo, address: string): Utxo | TokenUtxo {
    // Derive scriptPubKey from address
    let scriptPubKey = '';
    try {
      const decoded = decodeCashAddr(address);
      const bytecode = this.buildLockingBytecode(decoded.type, decoded.hash);
      scriptPubKey = Array.from(bytecode)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fall back to empty if address parsing fails
    }

    const baseUtxo: Utxo = {
      txid: electrumUtxo.tx_hash,
      vout: electrumUtxo.tx_pos,
      satoshis: BigInt(electrumUtxo.value),
      scriptPubKey,
      confirmations: electrumUtxo.height > 0 ? 1 : 0, // Simplified
      blockHeight: electrumUtxo.height > 0 ? electrumUtxo.height : undefined,
    };

    // Check for token data
    if (electrumUtxo.token_data) {
      const tokenUtxo: TokenUtxo = {
        ...baseUtxo,
        token: {
          category: electrumUtxo.token_data.category,
          amount: electrumUtxo.token_data.amount
            ? BigInt(electrumUtxo.token_data.amount)
            : BigInt(0),
          nftCommitment: electrumUtxo.token_data.nft?.commitment,
          nftCapability: electrumUtxo.token_data.nft?.capability,
        },
      };
      return tokenUtxo;
    }

    return baseUtxo;
  }

  /**
   * Parse block header from hex
   */
  private parseBlockHeader(headerHex: string): {
    version: number;
    previousHash: string;
    merkleRoot: string;
    timestamp: number;
    bits: number;
    nonce: number;
  } {
    // Block header is 80 bytes:
    // 4 bytes version
    // 32 bytes prev hash
    // 32 bytes merkle root
    // 4 bytes timestamp
    // 4 bytes bits
    // 4 bytes nonce

    const hex = headerHex.toLowerCase();

    const version = parseInt(this.reverseHex(hex.slice(0, 8)), 16);
    const previousHash = this.reverseHex(hex.slice(8, 72));
    const merkleRoot = this.reverseHex(hex.slice(72, 136));
    const timestamp = parseInt(this.reverseHex(hex.slice(136, 144)), 16);
    const bits = parseInt(this.reverseHex(hex.slice(144, 152)), 16);
    const nonce = parseInt(this.reverseHex(hex.slice(152, 160)), 16);

    return { version, previousHash, merkleRoot, timestamp, bits, nonce };
  }

  /**
   * Double SHA256 hash (for block hash)
   */
  private async doubleHash(hex: string): Promise<string> {
    if (hex.length % 2 !== 0) {
      throw new Error('Invalid hex input length for doubleHash');
    }

    const inputBytes = this.hexToBytes(hex);
    const firstHash = await crypto.subtle.digest('SHA-256', inputBytes as BufferSource);
    const secondHash = await crypto.subtle.digest('SHA-256', firstHash);

    // Bitcoin block hashes are displayed in little-endian hex.
    return this.reverseHex(this.bytesToHex(new Uint8Array(secondHash)));
  }

  /**
   * Reverse hex string (for little-endian conversion)
   */
  private reverseHex(hex: string): string {
    const bytes = hex.match(/.{2}/g) || [];
    return bytes.reverse().join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    this.client.disconnect();
  }
}

/**
 * Create Electrum adapter factory
 */
export function createElectrumAdapter(config: ElectrumAdapterConfig): ElectrumAdapter {
  return new ElectrumAdapter(config);
}
