/**
 * Repository Port interfaces (port/adapter pattern)
 *
 * Domain logic depends only on these interfaces, not on Dexie or Postgres directly.
 * Implementations: DexieAdapter (browser), ApiAdapter (hosted), PostgresAdapter (server).
 */
import type {
  AirdropCampaign,
  AppSettings,
  LogEntry,
  LogLevel,
  Network,
  TokenMetadataCache,
  VestingCampaign,
  Wallet,
} from './types';

// ============================================================================
// Wallet Repository Port
// ============================================================================

export interface WalletRepository {
  create(wallet: Wallet): Promise<string>;
  update(wallet: Wallet): Promise<void>;
  getById(id: string): Promise<Wallet | undefined>;
  getAll(): Promise<Wallet[]>;
  getByNetwork(network: Network): Promise<Wallet[]>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Airdrop Campaign Repository Port
// ============================================================================

export interface AirdropRepository {
  create(campaign: AirdropCampaign): Promise<string>;
  update(campaign: AirdropCampaign): Promise<void>;
  getById(id: string): Promise<AirdropCampaign | undefined>;
  getAll(): Promise<AirdropCampaign[]>;
  getByNetwork(network: Network): Promise<AirdropCampaign[]>;
  delete(id: string): Promise<void>;
  patch(id: string, updates: Partial<AirdropCampaign>): Promise<void>;
}

// ============================================================================
// Vesting Campaign Repository Port
// ============================================================================

export interface VestingRepository {
  create(campaign: VestingCampaign): Promise<string>;
  update(campaign: VestingCampaign): Promise<void>;
  getById(id: string): Promise<VestingCampaign | undefined>;
  getAll(): Promise<VestingCampaign[]>;
  getByNetwork(network: Network): Promise<VestingCampaign[]>;
  delete(id: string): Promise<void>;
  patch(id: string, updates: Partial<VestingCampaign>): Promise<void>;
}

// ============================================================================
// Log Repository Port
// ============================================================================

export interface LogRepository {
  add(entry: Omit<LogEntry, 'id'>): Promise<number>;
  log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
    campaignId?: string,
    batchId?: string
  ): Promise<number>;
  getRecent(limit?: number): Promise<LogEntry[]>;
  getByCampaign(campaignId: string, limit?: number): Promise<LogEntry[]>;
  getByLevel(level: LogLevel, limit?: number): Promise<LogEntry[]>;
  clearOlderThan(timestamp: number): Promise<number>;
  clearAll(): Promise<void>;
}

// ============================================================================
// Settings Repository Port
// ============================================================================

export interface SettingsRepository {
  get(): Promise<AppSettings>;
  update(updates: Partial<Omit<AppSettings, 'id'>>): Promise<void>;
  reset(): Promise<void>;
}

// ============================================================================
// Token Metadata Cache Repository Port
// ============================================================================

export interface TokenMetadataRepository {
  get(tokenId: string, network: Network): Promise<TokenMetadataCache | undefined>;
  set(
    tokenId: string,
    network: Network,
    metadata: Omit<TokenMetadataCache, 'id' | 'tokenId' | 'network' | 'fetchedAt' | 'expiresAt'>,
    ttlMs?: number
  ): Promise<void>;
  delete(tokenId: string, network: Network): Promise<void>;
  getAllByNetwork(network: Network): Promise<TokenMetadataCache[]>;
  clearExpired(): Promise<number>;
  clearAll(): Promise<void>;
  searchBySymbol(symbol: string, network: Network): Promise<TokenMetadataCache[]>;
}

// ============================================================================
// Aggregate Repository Registry
// ============================================================================

export interface RepositoryRegistry {
  wallet: WalletRepository;
  airdrop: AirdropRepository;
  vesting: VestingRepository;
  log: LogRepository;
  settings: SettingsRepository;
  tokenMetadata: TokenMetadataRepository;
}
