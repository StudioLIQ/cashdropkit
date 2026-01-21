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
