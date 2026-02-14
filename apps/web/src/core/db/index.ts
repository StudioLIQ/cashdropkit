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
