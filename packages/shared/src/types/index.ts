/**
 * @cashdropkit/shared — Shared types and schemas
 *
 * These types are used by both the web frontend (apps/web) and the API server (apps/api).
 * Domain types originate from core/db/types.ts and are re-exported here for cross-package use.
 */

// ============================================================================
// Network
// ============================================================================

export type Network = 'mainnet' | 'testnet';

// ============================================================================
// Token Reference
// ============================================================================

export interface TokenRef {
  tokenId: string; // category hex
  symbol?: string;
  name?: string;
  decimals?: number;
  iconUrl?: string;
  verified?: boolean;
}

// ============================================================================
// Outpoint Reference
// ============================================================================

export interface OutpointRef {
  txid: string;
  vout: number;
}

// ============================================================================
// Recipient
// ============================================================================

export type RecipientStatus = 'PENDING' | 'PLANNED' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'SKIPPED';

export interface RecipientRow {
  id: string;
  address: string;
  amountBase: string; // bigint serialized as string
  memo?: string;
  sourceLine?: number;

  valid: boolean;
  validationErrors?: string[];

  status: RecipientStatus;
  batchId?: string;
  txid?: string;
  error?: string;
}

// ============================================================================
// Airdrop Campaign
// ============================================================================

export interface AirdropSettings {
  feeRateSatPerByte: number;
  dustSatPerOutput: number;
  maxOutputsPerTx: number;
  maxInputsPerTx: number;
  allowMergeDuplicates: boolean;
  rounding: 'floor' | 'round' | 'ceil';
}

export interface AirdropFunding {
  sourceWalletId: string;
  tokenUtxoSelection: 'auto' | 'manual';
  bchUtxoSelection: 'auto' | 'manual';
  selectedTokenUtxos?: string[];
  selectedBchUtxos?: string[];
}

export interface BatchPlan {
  id: string;
  recipients: string[];
  estimatedFeeSat: string;
  estimatedSizeBytes: number;
  tokenInputs: OutpointRef[];
  bchInputs: OutpointRef[];
  outputsCount: number;
  txid?: string;
}

export interface DistributionPlan {
  generatedAt: number;
  totalRecipients: number;
  totalTokenAmountBase: string;

  estimated: {
    txCount: number;
    totalFeeSat: string;
    totalDustSat: string;
    requiredBchSat: string;
  };

  batches: BatchPlan[];
}

export type ExecutionStatus = 'READY' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
export type ConfirmationStatus = 'UNKNOWN' | 'SEEN' | 'CONFIRMED' | 'DROPPED';

export interface ExecutionState {
  state: ExecutionStatus;
  currentBatchIndex: number;

  broadcast: {
    adapterName: string;
    startedAt?: number;
    lastUpdatedAt?: number;
  };

  failures: {
    batchFailures: { batchId: string; error: string }[];
    recipientFailures: { recipientId: string; error: string }[];
  };

  confirmations: Record<
    string,
    {
      status: ConfirmationStatus;
      confirmations?: number;
      lastCheckedAt: number;
      firstSeenAt?: number;
    }
  >;

  debug?: {
    storeRawTxHex?: boolean;
  };
}

export interface AirdropCampaign {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  network: Network;
  token: TokenRef;

  mode: 'FT' | 'NFT';
  amountUnit: 'base' | 'display';

  recipients: RecipientRow[];

  settings: AirdropSettings;
  funding: AirdropFunding;

  plan?: DistributionPlan;
  execution?: ExecutionState;

  tags?: string[];
  notes?: string;
}

// ============================================================================
// Vesting Campaign
// ============================================================================

export type TrancheStatus = 'PLANNED' | 'CREATED' | 'CONFIRMED' | 'UNLOCKED';

export interface TrancheRow {
  id: string;
  unlockTime: number;
  amountBase: string;

  lockbox: {
    lockAddress?: string;
    redeemScriptHex?: string;
    outpoint?: OutpointRef;
    txid?: string;
    status: TrancheStatus;
  };
}

export interface BeneficiaryRow {
  id: string;
  address: string;
  tranches: TrancheRow[];
  valid: boolean;
  errors?: string[];
}

export interface VestingSettings {
  feeRateSatPerByte: number;
  dustSatPerOutput: number;
  lockScriptType: 'P2SH_CLTV_P2PKH';
}

export interface VestingPlan {
  generatedAt: number;
  totalLockboxes: number;
  estimated: {
    txCount: number;
    totalFeeSat: string;
    totalDustSat: string;
    requiredBchSat: string;
  };
  batches: {
    id: string;
    trancheIds: string[];
    estimatedFeeSat: string;
    estimatedSizeBytes: number;
  }[];
}

export interface VestingCampaign {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  network: Network;
  token: TokenRef;

  template: 'CLIFF_ONLY' | 'MONTHLY_TRANCHES' | 'CUSTOM_TRANCHES';
  schedule: {
    unlockTimes: number[];
    amountsBasePerTranche: string[];
  };

  beneficiaries: BeneficiaryRow[];

  settings: VestingSettings;

  funding: {
    sourceWalletId: string;
  };

  plan?: VestingPlan;
  execution?: ExecutionState;
}

// ============================================================================
// Wallet (public fields only — no secrets)
// ============================================================================

export interface WalletPublic {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  network: Network;
  type: 'mnemonic' | 'watch-only';
  derivationPath?: string;
  addresses?: string[];
  watchAddress?: string;
}

// ============================================================================
// Settings
// ============================================================================

export interface AppSettings {
  id: string;
  network: Network;
  autoLockMinutes: number;
  requirePasswordForSigning: boolean;
  defaultFeeRateSatPerByte: number;
  defaultDustSatPerOutput: number;
  defaultMaxOutputsPerTx: number;
  lastActiveWalletId?: string;
  updatedAt: number;
}

// ============================================================================
// Logs
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id?: number;
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
  campaignId?: string;
  batchId?: string;
}

// ============================================================================
// API Request/Response types
// ============================================================================

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
