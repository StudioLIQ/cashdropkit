// Register Electrum adapter in global registry
import { adapterRegistry } from './ChainAdapter';
import { createElectrumAdapter } from './electrum';
import type { ElectrumAdapterConfig } from './electrum';
import type { ChainAdapterConfig } from './types';

/**
 * Chain Adapter Module Exports
 */

// Types
export type {
  AddressBalance,
  BlockInfo,
  BroadcastResult,
  CashToken,
  ChainAdapterConfig,
  ChainAdapterErrorType,
  ChainTip,
  Outpoint,
  TokenBalance,
  TokenUtxo,
  TxStatus,
  TxStatusType,
  Utxo,
} from './types';

export {
  ChainAdapterError,
  DEFAULT_ADAPTER_CONFIG,
  isFungibleUtxo,
  isNftUtxo,
  isTokenUtxo,
  outpointId,
  parseOutpointId,
} from './types';

// Interface
export type { ChainAdapter, ChainAdapterFactory, ChainAdapterRegistry } from './ChainAdapter';
export { adapterRegistry, createAdapterRegistry } from './ChainAdapter';

// Electrum Adapter
export {
  ElectrumAdapter,
  ElectrumClient,
  createElectrumAdapter,
  DEFAULT_ELECTRUM_ENDPOINTS,
} from './electrum';
export type { ElectrumAdapterConfig } from './electrum';

// Connection Service
export {
  ConnectionService,
  getConnectionService,
  resetConnectionService,
} from './connectionService';
export type {
  ConnectionServiceConfig,
  ConnectionEventListener,
  HealthCheckResult,
} from './connectionService';

adapterRegistry.register('electrum', (config: ChainAdapterConfig) => {
  return createElectrumAdapter(config as ElectrumAdapterConfig);
});
