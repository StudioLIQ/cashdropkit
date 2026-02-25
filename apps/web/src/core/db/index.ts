// Database instance
export { CashDropDatabase, closeDb, deleteDb, getDb } from './db';

// Repository Ports (interfaces)
export type {
  AirdropRepository,
  LogRepository,
  RepositoryRegistry,
  SettingsRepository,
  TokenMetadataRepository,
  VestingRepository,
  WalletRepository,
} from './ports';

// Dexie Repository Adapters (default implementations)
export {
  airdropRepo,
  logRepo,
  settingsRepo,
  tokenMetadataRepo,
  vestingRepo,
  walletRepo,
} from './repositories';

// API Repository Adapters (hosted mode)
export { apiAirdropRepo, apiLogRepo, apiVestingRepo } from './apiRepositories';

// API Client
export { ApiError, getApiBaseUrl, initApiClient, isApiAvailable } from './apiClient';

// Repository Provider (selects Dexie or API based on env)
export {
  getAirdropRepo,
  getLogRepo,
  getRepositoryRegistry,
  getSettingsRepo,
  getTokenMetadataRepo,
  getVestingRepo,
  getWalletRepo,
} from './repositoryProvider';

// Types
export type {
  AirdropCampaign,
  AirdropFunding,
  AirdropSettings,
  AppSettings,
  BatchPlan,
  BeneficiaryRow,
  ConfirmationStatus,
  DistributionPlan,
  ExecutionState,
  ExecutionStatus,
  LogEntry,
  LogLevel,
  Network,
  OutpointRef,
  RecipientRow,
  RecipientStatus,
  TokenMetadataCache,
  TokenRef,
  TrancheRow,
  TrancheStatus,
  VestingCampaign,
  VestingPlan,
  VestingSettings,
  Wallet,
} from './types';

// Migrations and utilities
export { exportAllData, getCurrentVersion, getDbStats, verifyDatabase } from './migrations';
