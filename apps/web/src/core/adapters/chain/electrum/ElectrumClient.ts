/**
 * Electrum WebSocket Client
 *
 * Handles WebSocket connection to Fulcrum/ElectrumX servers.
 * Implements JSON-RPC 2.0 protocol with automatic reconnection.
 */
import {
  ConnectionState,
  DEFAULT_ELECTRUM_CONFIG,
  type ElectrumClientConfig,
  type ElectrumRequest,
  type ElectrumResponse,
} from './types';

/**
 * Pending request tracking
 */
interface PendingRequest<T = unknown> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  method: string;
}

/**
 * Electrum WebSocket Client
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Request timeout handling
 * - Ping/keepalive support
 * - Promise-based API
 */
export class ElectrumClient {
  private readonly config: Required<ElectrumClientConfig>;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private connectPromise: Promise<void> | null = null;
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;

  constructor(config: ElectrumClientConfig) {
    this.config = {
      ...DEFAULT_ELECTRUM_CONFIG,
      ...config,
    };
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Connect to the Electrum server
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.doConnect();
    });

    return this.connectPromise;
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.cleanup();
    this.state = 'disconnected';
    this.connectPromise = null;
    this.connectResolve = null;
    this.connectReject = null;
  }

  /**
   * Make a JSON-RPC request
   */
  async request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    // Ensure connected
    if (!this.isConnected()) {
      await this.connect();
    }

    return new Promise<T>((resolve, reject) => {
      const id = ++this.requestId;

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.config.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        method,
      });

      const request: ElectrumRequest = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      try {
        this.ws?.send(JSON.stringify(request));
      } catch (error) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Internal: perform connection
   */
  private doConnect(): void {
    this.state = 'connecting';

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.startPing();
        this.connectResolve?.();
        this.connectPromise = null;
        this.connectResolve = null;
        this.connectReject = null;
      };

      this.ws.onclose = () => {
        this.handleDisconnect();
      };

      this.ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        // onclose will be called after onerror
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    } catch (error) {
      this.handleDisconnect(error as Error);
    }
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(error?: Error): void {
    this.stopPing();

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error || new Error('Connection closed'));
      this.pendingRequests.delete(id);
    }

    // If we were connecting, reject the connect promise
    if (this.connectReject && this.state === 'connecting') {
      this.connectReject(error || new Error('Connection failed'));
      this.connectPromise = null;
      this.connectResolve = null;
      this.connectReject = null;
    }

    // Attempt reconnection if we were connected
    if (this.state === 'connected' || this.state === 'reconnecting') {
      this.attemptReconnect();
    } else {
      this.state = 'disconnected';
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.state = 'disconnected';
      console.error('Max reconnection attempts reached');
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const response: ElectrumResponse = JSON.parse(data);

      // Check if it's a response to a pending request
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(
            new Error(`Electrum error: ${response.error.message} (${response.error.code})`)
          );
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  /**
   * Start ping interval
   */
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(async () => {
      try {
        await this.request('server.ping');
      } catch {
        // Ping failed, connection will be handled by disconnect handler
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopPing();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
      this.pendingRequests.delete(id);
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
