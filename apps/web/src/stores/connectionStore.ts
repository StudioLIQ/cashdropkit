/**
 * Connection Store
 *
 * Zustand store for chain connection state management.
 * Handles connection status, health checks, and retry controls.
 */
import { create } from 'zustand';

import type { Network } from '@/core/db/types';

/**
 * Connection status types
 * - connected: Successfully communicating with provider
 * - degraded: Intermittent issues (some requests failing)
 * - offline: Unable to reach provider
 */
export type ConnectionStatus = 'connected' | 'degraded' | 'offline';

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
 * Connection state
 */
export interface ConnectionState {
  // Status
  status: ConnectionStatus;
  network: Network;

  // Health tracking
  lastHealthCheck: HealthCheckResult | null;
  consecutiveFailures: number;
  isChecking: boolean;

  // Retry state
  isRetrying: boolean;
  retryCount: number;
  maxRetries: number;

  // Error info
  lastError: string | null;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setNetwork: (network: Network) => void;
  recordHealthCheck: (result: HealthCheckResult) => void;
  startRetry: () => void;
  stopRetry: () => void;
  incrementRetry: () => void;
  resetRetry: () => void;
  setChecking: (isChecking: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

/**
 * Thresholds for status determination
 */
const DEGRADED_THRESHOLD = 2; // failures before degraded
const OFFLINE_THRESHOLD = 5; // failures before offline

/**
 * Calculate status from consecutive failures
 */
function statusFromFailures(failures: number): ConnectionStatus {
  if (failures >= OFFLINE_THRESHOLD) return 'offline';
  if (failures >= DEGRADED_THRESHOLD) return 'degraded';
  return 'connected';
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  // Initial state
  status: 'offline', // Start offline until first health check
  network: 'testnet',
  lastHealthCheck: null,
  consecutiveFailures: 0,
  isChecking: false,
  isRetrying: false,
  retryCount: 0,
  maxRetries: 5,
  lastError: null,

  // Set status directly
  setStatus: (status) => set({ status }),

  // Set network (triggers reconnection in service)
  setNetwork: (_network) =>
    set({
      network: 'testnet',
      status: 'offline',
      consecutiveFailures: 0,
      lastHealthCheck: null,
      lastError: null,
    }),

  // Record health check result
  recordHealthCheck: (result) => {
    const state = get();

    if (result.healthy) {
      set({
        lastHealthCheck: result,
        consecutiveFailures: 0,
        status: 'connected',
        lastError: null,
        retryCount: 0,
        isRetrying: false,
      });
    } else {
      const newFailures = state.consecutiveFailures + 1;
      const newStatus = statusFromFailures(newFailures);

      set({
        lastHealthCheck: result,
        consecutiveFailures: newFailures,
        status: newStatus,
        lastError: result.error || 'Health check failed',
      });
    }
  },

  // Retry controls
  startRetry: () => set({ isRetrying: true, retryCount: 0 }),
  stopRetry: () => set({ isRetrying: false }),
  incrementRetry: () =>
    set((state) => ({
      retryCount: state.retryCount + 1,
      isRetrying: state.retryCount + 1 < state.maxRetries,
    })),
  resetRetry: () => set({ retryCount: 0, isRetrying: false }),

  // Checking state
  setChecking: (isChecking) => set({ isChecking }),

  // Set error
  setError: (error) => set({ lastError: error }),

  // Reset all state
  reset: () =>
    set({
      status: 'offline',
      lastHealthCheck: null,
      consecutiveFailures: 0,
      isChecking: false,
      isRetrying: false,
      retryCount: 0,
      lastError: null,
    }),
}));

/**
 * Selector for display-friendly status info
 */
export function getStatusInfo(status: ConnectionStatus): {
  label: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case 'connected':
      return {
        label: 'Connected',
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-500',
      };
    case 'degraded':
      return {
        label: 'Degraded',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500',
      };
    case 'offline':
      return {
        label: 'Offline',
        color: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-500',
      };
  }
}
