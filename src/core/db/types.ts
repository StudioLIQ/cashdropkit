/**
 * Core database types for CashDrop Kit
 * Based on PROJECT.md domain model
 */

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
// Wallet
// ============================================================================

export interface Wallet {
  id: string; // uuid
  name: string;
  createdAt: number;
  updatedAt: number;
  network: Network;

  type: 'mnemonic' | 'watch-only';

  // Encrypted mnemonic (AES-GCM), only for type='mnemonic'
  encryptedMnemonic?: string;
  mnemonicSalt?: string;
  mnemonicIv?: string;

  // Derived addresses (cache)
  derivationPath?: string;
  addresses?: string[];

  // For watch-only
  watchAddress?: string;
}

// ============================================================================
// Outpoint Reference
// ============================================================================

export interface OutpointRef {
  txid: string;
  vout: number;
}

// ============================================================================
// Airdrop Campaign
// ============================================================================

export type RecipientStatus = 'PENDING' | 'PLANNED' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'SKIPPED';

export interface RecipientRow {
  id: string; // stable deterministic row id
  address: string; // normalized cashaddr
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
  selectedTokenUtxos?: string[]; // outpoint ids
  selectedBchUtxos?: string[];
}

export interface BatchPlan {
  id: string;
  recipients: string[]; // RecipientRow.id
  estimatedFeeSat: string; // bigint as string
  estimatedSizeBytes: number;
  tokenInputs: OutpointRef[];
  bchInputs: OutpointRef[];
  outputsCount: number;
  txid?: string; // post execution
}

export interface DistributionPlan {
  generatedAt: number;
  totalRecipients: number;
  totalTokenAmountBase: string; // bigint as string

  estimated: {
    txCount: number;
    totalFeeSat: string; // bigint as string
    totalDustSat: string; // bigint as string
    requiredBchSat: string; // bigint as string
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
    }
  >;

  debug?: {
    storeRawTxHex?: boolean;
  };
}

export interface AirdropCampaign {
  id: string; // uuid
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
  unlockTime: number; // unix seconds
  amountBase: string; // bigint as string

  lockbox: {
    lockAddress?: string; // P2SH address
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
    amountsBasePerTranche: string[]; // bigint as string array
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
// Logs
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id?: number; // auto-increment
  timestamp: number;
  level: LogLevel;
  category: string; // e.g., 'executor', 'planner', 'adapter'
  message: string;
  data?: Record<string, unknown>;
  campaignId?: string;
  batchId?: string;
}

// ============================================================================
// Settings
// ============================================================================

export interface AppSettings {
  id: string; // always 'default'
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
// Token Metadata Cache
// ============================================================================

export interface TokenMetadataCache {
  /** Composite key: tokenId:network (e.g., "abc123:mainnet") */
  id: string;
  tokenId: string;
  network: Network;

  /** Metadata fields (all optional as they may not be available) */
  symbol?: string;
  name?: string;
  decimals?: number;
  description?: string;
  iconUrl?: string;

  /** Source of the metadata (e.g., 'bcmr', 'otr', 'manual') */
  source: 'bcmr' | 'otr' | 'manual' | 'unknown';

  /** Whether the token is verified by a trusted registry */
  verified: boolean;

  /** Cache management */
  fetchedAt: number;
  expiresAt: number;

  /** If fetch failed, store error for debugging */
  fetchError?: string;
}
