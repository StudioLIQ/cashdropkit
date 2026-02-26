/**
 * Connection Service
 *
 * Manages chain adapter lifecycle, health checks, and connection status.
 * Provides a singleton interface for the app to interact with the chain.
 */
import type { Network } from '../../db/types';
import type { ChainAdapter } from './ChainAdapter';
import { DEFAULT_ELECTRUM_ENDPOINTS, createElectrumAdapter } from './electrum/ElectrumAdapter';
import type { ElectrumAdapter } from './electrum/ElectrumAdapter';

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  timestamp: number;
}

/**
 * Connection service configuration
 */
export interface ConnectionServiceConfig {
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval: number;
  /** Initial connection timeout in ms (default: 10000) */
  connectionTimeout: number;
  /** Health check timeout in ms (default: 5000) */
  healthCheckTimeout: number;
}

const DEFAULT_CONFIG: ConnectionServiceConfig = {
  healthCheckInterval: 30000, // 30 seconds
  connectionTimeout: 10000, // 10 seconds
  healthCheckTimeout: 5000, // 5 seconds
};

/**
 * Connection event listener
 */
export type ConnectionEventListener = (result: HealthCheckResult) => void;

/**
 * Connection Service
 *
 * Singleton service that manages the chain adapter and health monitoring.
 */
export class ConnectionService {
  private adapter: ElectrumAdapter | null = null;
  private network: Network = 'testnet';
  private config: ConnectionServiceConfig;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<ConnectionEventListener> = new Set();
  private isRunning = false;

  private resolveSupportedNetwork(network: Network): Network {
    return network === 'testnet' ? network : 'testnet';
  }

  constructor(config: Partial<ConnectionServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the current adapter
   */
  getAdapter(): ChainAdapter | null {
    return this.adapter;
  }

  /**
   * Get current network
   */
  getNetwork(): Network {
    return this.network;
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Add health check listener
   */
  addListener(listener: ConnectionEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of health check result
   */
  private notifyListeners(result: HealthCheckResult): void {
    for (const listener of this.listeners) {
      try {
        listener(result);
      } catch (err) {
        console.error('Health check listener error:', err);
      }
    }
  }

  /**
   * Start the connection service for a specific network
   */
  async start(network: Network): Promise<HealthCheckResult> {
    // Stop existing connection if any
    this.stop();

    const targetNetwork = this.resolveSupportedNetwork(network);
    this.network = targetNetwork;
    this.isRunning = true;

    // Create adapter
    this.adapter = createElectrumAdapter({
      network: targetNetwork,
      wsUrl: DEFAULT_ELECTRUM_ENDPOINTS[targetNetwork],
    });

    // Perform initial health check
    const result = await this.performHealthCheck();

    // Start periodic health checks if initial check succeeded or partially succeeded
    if (result.healthy) {
      this.startPeriodicHealthChecks();
    }

    return result;
  }

  /**
   * Stop the connection service
   */
  stop(): void {
    this.isRunning = false;
    this.stopPeriodicHealthChecks();

    if (this.adapter) {
      this.adapter.disconnect();
      this.adapter = null;
    }
  }

  /**
   * Switch to a different network
   */
  async switchNetwork(network: Network): Promise<HealthCheckResult> {
    if (this.network === network && this.adapter) {
      // Same network, just perform health check
      return this.performHealthCheck();
    }

    return this.start(network);
  }

  /**
   * Perform a single health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    if (!this.adapter) {
      const result: HealthCheckResult = {
        healthy: false,
        error: 'No adapter configured',
        timestamp: Date.now(),
      };
      this.notifyListeners(result);
      return result;
    }

    const startTime = Date.now();

    try {
      // Use Promise.race to implement timeout
      const healthCheck = this.adapter.isHealthy();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), this.config.healthCheckTimeout)
      );

      const healthy = await Promise.race([healthCheck, timeout]);
      const latencyMs = Date.now() - startTime;

      const result: HealthCheckResult = {
        healthy,
        latencyMs,
        timestamp: Date.now(),
      };

      this.notifyListeners(result);

      // Restart periodic checks if they stopped and we're healthy
      if (healthy && this.isRunning && !this.healthCheckInterval) {
        this.startPeriodicHealthChecks();
      }

      return result;
    } catch (error) {
      const result: HealthCheckResult = {
        healthy: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      };

      this.notifyListeners(result);
      return result;
    }
  }

  /**
   * Force a retry - disconnects and reconnects
   */
  async retry(): Promise<HealthCheckResult> {
    if (!this.adapter) {
      return this.start(this.network);
    }

    // Disconnect existing
    this.adapter.disconnect();

    // Create new adapter
    this.adapter = createElectrumAdapter({
      network: this.network,
      wsUrl: DEFAULT_ELECTRUM_ENDPOINTS[this.network],
    });

    // Perform health check
    return this.performHealthCheck();
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    this.stopPeriodicHealthChecks();

    this.healthCheckInterval = setInterval(async () => {
      if (!this.isRunning) {
        this.stopPeriodicHealthChecks();
        return;
      }

      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop periodic health checks
   */
  private stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get connection info for display
   */
  getConnectionInfo(): {
    network: Network;
    endpoint: string;
    adapterName: string;
  } | null {
    if (!this.adapter) return null;

    return {
      network: this.network,
      endpoint: DEFAULT_ELECTRUM_ENDPOINTS[this.network],
      adapterName: this.adapter.name,
    };
  }
}

/**
 * Singleton instance
 */
let connectionServiceInstance: ConnectionService | null = null;

/**
 * Get the singleton connection service instance
 */
export function getConnectionService(): ConnectionService {
  if (!connectionServiceInstance) {
    connectionServiceInstance = new ConnectionService();
  }
  return connectionServiceInstance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetConnectionService(): void {
  if (connectionServiceInstance) {
    connectionServiceInstance.stop();
    connectionServiceInstance = null;
  }
}
