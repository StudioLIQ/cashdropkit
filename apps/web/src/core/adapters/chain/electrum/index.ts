/**
 * Electrum Chain Adapter Module
 *
 * Exports the Electrum adapter and related utilities.
 */

export {
  ElectrumAdapter,
  createElectrumAdapter,
  DEFAULT_ELECTRUM_ENDPOINTS,
} from './ElectrumAdapter';
export type { ElectrumAdapterConfig } from './ElectrumAdapter';

export { ElectrumClient } from './ElectrumClient';

export type {
  ConnectionState,
  ConnectionEvent,
  ElectrumClientConfig,
  ElectrumRequest,
  ElectrumResponse,
  ElectrumError,
  ElectrumUtxo,
  ElectrumTokenData,
  ElectrumNftData,
  ElectrumBalance,
  ElectrumHistoryItem,
  ElectrumTransaction,
  ElectrumTxInput,
  ElectrumTxOutput,
  ElectrumBlockHeader,
  ParsedBlockHeader,
  ElectrumServerFeatures,
} from './types';
