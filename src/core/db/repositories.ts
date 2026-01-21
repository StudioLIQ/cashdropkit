import { getDb } from './db';
import type {
  AirdropCampaign,
  AppSettings,
  LogEntry,
  LogLevel,
  Network,
  VestingCampaign,
  Wallet,
} from './types';

// ============================================================================
// Wallet Repository
// ============================================================================

export const walletRepo = {
  async create(wallet: Wallet): Promise<string> {
    const db = getDb();
    await db.wallets.add(wallet);
    return wallet.id;
  },

  async update(wallet: Wallet): Promise<void> {
    const db = getDb();
    await db.wallets.put(wallet);
  },

  async getById(id: string): Promise<Wallet | undefined> {
    const db = getDb();
    return db.wallets.get(id);
  },

  async getAll(): Promise<Wallet[]> {
    const db = getDb();
    return db.wallets.toArray();
  },

  async getByNetwork(network: Network): Promise<Wallet[]> {
    const db = getDb();
    return db.wallets.where('network').equals(network).toArray();
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.wallets.delete(id);
  },
};

// ============================================================================
// Airdrop Campaign Repository
// ============================================================================

export const airdropRepo = {
  async create(campaign: AirdropCampaign): Promise<string> {
    const db = getDb();
    await db.airdropCampaigns.add(campaign);
    return campaign.id;
  },

  async update(campaign: AirdropCampaign): Promise<void> {
    const db = getDb();
    await db.airdropCampaigns.put(campaign);
  },

  async getById(id: string): Promise<AirdropCampaign | undefined> {
    const db = getDb();
    return db.airdropCampaigns.get(id);
  },

  async getAll(): Promise<AirdropCampaign[]> {
    const db = getDb();
    return db.airdropCampaigns.orderBy('updatedAt').reverse().toArray();
  },

  async getByNetwork(network: Network): Promise<AirdropCampaign[]> {
    const db = getDb();
    return db.airdropCampaigns.where('network').equals(network).reverse().sortBy('updatedAt');
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.airdropCampaigns.delete(id);
  },

  /**
   * Update only specific fields of a campaign
   */
  async patch(id: string, updates: Partial<AirdropCampaign>): Promise<void> {
    const db = getDb();
    await db.airdropCampaigns.update(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
};

// ============================================================================
// Vesting Campaign Repository
// ============================================================================

export const vestingRepo = {
  async create(campaign: VestingCampaign): Promise<string> {
    const db = getDb();
    await db.vestingCampaigns.add(campaign);
    return campaign.id;
  },

  async update(campaign: VestingCampaign): Promise<void> {
    const db = getDb();
    await db.vestingCampaigns.put(campaign);
  },

  async getById(id: string): Promise<VestingCampaign | undefined> {
    const db = getDb();
    return db.vestingCampaigns.get(id);
  },

  async getAll(): Promise<VestingCampaign[]> {
    const db = getDb();
    return db.vestingCampaigns.orderBy('updatedAt').reverse().toArray();
  },

  async getByNetwork(network: Network): Promise<VestingCampaign[]> {
    const db = getDb();
    return db.vestingCampaigns.where('network').equals(network).reverse().sortBy('updatedAt');
  },

  async delete(id: string): Promise<void> {
    const db = getDb();
    await db.vestingCampaigns.delete(id);
  },

  async patch(id: string, updates: Partial<VestingCampaign>): Promise<void> {
    const db = getDb();
    await db.vestingCampaigns.update(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
};

// ============================================================================
// Log Repository
// ============================================================================

export const logRepo = {
  async add(entry: Omit<LogEntry, 'id'>): Promise<number> {
    const db = getDb();
    return db.logs.add(entry as LogEntry) as Promise<number>;
  },

  async log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
    campaignId?: string,
    batchId?: string
  ): Promise<number> {
    return this.add({
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
      campaignId,
      batchId,
    });
  },

  async getRecent(limit = 100): Promise<LogEntry[]> {
    const db = getDb();
    return db.logs.orderBy('timestamp').reverse().limit(limit).toArray();
  },

  async getByCampaign(campaignId: string, limit = 100): Promise<LogEntry[]> {
    const db = getDb();
    return db.logs
      .where('campaignId')
      .equals(campaignId)
      .reverse()
      .sortBy('timestamp')
      .then((logs) => logs.slice(0, limit));
  },

  async getByLevel(level: LogLevel, limit = 100): Promise<LogEntry[]> {
    const db = getDb();
    return db.logs
      .where('level')
      .equals(level)
      .reverse()
      .sortBy('timestamp')
      .then((logs) => logs.slice(0, limit));
  },

  async clearOlderThan(timestamp: number): Promise<number> {
    const db = getDb();
    return db.logs.where('timestamp').below(timestamp).delete();
  },

  async clearAll(): Promise<void> {
    const db = getDb();
    await db.logs.clear();
  },
};

// ============================================================================
// Settings Repository
// ============================================================================

const DEFAULT_SETTINGS: AppSettings = {
  id: 'default',
  network: 'testnet',
  autoLockMinutes: 15,
  requirePasswordForSigning: true,
  defaultFeeRateSatPerByte: 1,
  defaultDustSatPerOutput: 546,
  defaultMaxOutputsPerTx: 80,
  updatedAt: Date.now(),
};

export const settingsRepo = {
  async get(): Promise<AppSettings> {
    const db = getDb();
    const settings = await db.settings.get('default');
    if (!settings) {
      // Initialize with defaults
      await db.settings.add(DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
    return settings;
  },

  async update(updates: Partial<Omit<AppSettings, 'id'>>): Promise<void> {
    const db = getDb();
    const current = await this.get();
    await db.settings.put({
      ...current,
      ...updates,
      id: 'default',
      updatedAt: Date.now(),
    });
  },

  async reset(): Promise<void> {
    const db = getDb();
    await db.settings.put({
      ...DEFAULT_SETTINGS,
      updatedAt: Date.now(),
    });
  },
};
