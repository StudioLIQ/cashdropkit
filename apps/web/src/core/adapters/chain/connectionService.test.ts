/**
 * Connection Service Tests
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConnectionService,
  getConnectionService,
  resetConnectionService,
} from './connectionService';

// Mock the ElectrumAdapter
vi.mock('./electrum/ElectrumAdapter', () => ({
  createElectrumAdapter: vi.fn(() => ({
    name: 'electrum',
    network: 'testnet',
    isHealthy: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn(),
  })),
  DEFAULT_ELECTRUM_ENDPOINTS: {
    mainnet: 'wss://mainnet.example.com',
    testnet: 'wss://testnet.example.com',
  },
}));

describe('ConnectionService', () => {
  let service: ConnectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetConnectionService();
    service = new ConnectionService({
      healthCheckInterval: 1000,
      healthCheckTimeout: 500,
    });
  });

  afterEach(() => {
    service.stop();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      const defaultService = new ConnectionService();
      expect(defaultService).toBeDefined();
      expect(defaultService.getNetwork()).toBe('testnet');
      defaultService.stop();
    });

    it('should create service with custom config', () => {
      const customService = new ConnectionService({
        healthCheckInterval: 5000,
        connectionTimeout: 3000,
      });
      expect(customService).toBeDefined();
      customService.stop();
    });
  });

  describe('start', () => {
    it('should start connection and perform health check', async () => {
      const result = await service.start('testnet');
      expect(result.healthy).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(service.isActive()).toBe(true);
    });

    it('should stop existing connection when starting new one', async () => {
      await service.start('testnet');
      const result = await service.start('mainnet');
      expect(result.healthy).toBe(true);
      expect(service.getNetwork()).toBe('mainnet');
    });
  });

  describe('stop', () => {
    it('should stop the service', async () => {
      await service.start('testnet');
      service.stop();
      expect(service.isActive()).toBe(false);
      expect(service.getAdapter()).toBeNull();
    });
  });

  describe('switchNetwork', () => {
    it('should switch to different network', async () => {
      await service.start('testnet');
      const result = await service.switchNetwork('mainnet');
      expect(result.healthy).toBe(true);
      expect(service.getNetwork()).toBe('mainnet');
    });

    it('should perform health check if same network', async () => {
      await service.start('testnet');
      const result = await service.switchNetwork('testnet');
      expect(result.healthy).toBe(true);
    });
  });

  describe('performHealthCheck', () => {
    it('should return unhealthy if no adapter', async () => {
      const result = await service.performHealthCheck();
      expect(result.healthy).toBe(false);
      expect(result.error).toBe('No adapter configured');
    });

    it('should return health check result', async () => {
      await service.start('testnet');
      const result = await service.performHealthCheck();
      expect(result.healthy).toBe(true);
      expect(result.latencyMs).toBeDefined();
    });
  });

  describe('retry', () => {
    it('should reconnect and perform health check', async () => {
      await service.start('testnet');
      const result = await service.retry();
      expect(result.healthy).toBe(true);
    });

    it('should start service if not running', async () => {
      const result = await service.retry();
      expect(result.healthy).toBe(true);
    });
  });

  describe('listeners', () => {
    it('should notify listeners of health check results', async () => {
      const listener = vi.fn();
      service.addListener(listener);
      await service.start('testnet');
      expect(listener).toHaveBeenCalled();
    });

    it('should remove listener when unsubscribe called', async () => {
      const listener = vi.fn();
      const unsubscribe = service.addListener(listener);
      unsubscribe();
      await service.start('testnet');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getConnectionInfo', () => {
    it('should return null if no adapter', () => {
      expect(service.getConnectionInfo()).toBeNull();
    });

    it('should return connection info when adapter exists', async () => {
      await service.start('testnet');
      const info = service.getConnectionInfo();
      expect(info).not.toBeNull();
      expect(info?.network).toBe('testnet');
      expect(info?.adapterName).toBe('electrum');
    });
  });
});

describe('getConnectionService (singleton)', () => {
  afterEach(() => {
    resetConnectionService();
  });

  it('should return same instance', () => {
    const service1 = getConnectionService();
    const service2 = getConnectionService();
    expect(service1).toBe(service2);
  });

  it('should reset singleton', () => {
    const service1 = getConnectionService();
    resetConnectionService();
    const service2 = getConnectionService();
    expect(service1).not.toBe(service2);
  });
});
