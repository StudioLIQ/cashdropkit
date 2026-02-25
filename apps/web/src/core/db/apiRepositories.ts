/**
 * API-backed Repository Adapters
 *
 * Implements the same port interfaces as DexieRepositories,
 * but delegates to the Railway API instead of IndexedDB.
 *
 * Note: Wallet repo is intentionally NOT provided here —
 * wallets with encrypted mnemonics MUST stay browser-only (LocalVault).
 * TokenMetadata and Settings also remain local-only for now.
 */

import type {
  AirdropCampaign,
  LogEntry,
  LogLevel,
  Network,
  VestingCampaign,
} from './types';

import { apiClient } from './apiClient';

// ============================================================================
// Types for API responses
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface PaginatedData<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** API returns Drizzle rows with potentially mixed casing */
type ApiRow = Record<string, unknown>;

// ============================================================================
// Airdrop Campaign Repository (API)
// ============================================================================

export const apiAirdropRepo = {
  async create(campaign: AirdropCampaign): Promise<string> {
    await apiClient.post<ApiResponse<{ id: string }>>('/api/v1/campaigns', {
      id: campaign.id,
      name: campaign.name,
      network: campaign.network,
      tokenId: campaign.token.tokenId,
      tokenSymbol: campaign.token.symbol,
      tokenName: campaign.token.name,
      tokenDecimals: campaign.token.decimals,
      mode: campaign.mode,
      amountUnit: campaign.amountUnit,
      recipients: campaign.recipients,
    });
    return campaign.id;
  },

  async update(campaign: AirdropCampaign): Promise<void> {
    await apiClient.patch<ApiResponse<void>>(`/api/v1/campaigns/${campaign.id}`, {
      name: campaign.name,
      recipients: campaign.recipients,
      feeRateSatPerByte: campaign.settings.feeRateSatPerByte,
      dustSatPerOutput: campaign.settings.dustSatPerOutput,
      maxOutputsPerTx: campaign.settings.maxOutputsPerTx,
      maxInputsPerTx: campaign.settings.maxInputsPerTx,
      allowMergeDuplicates: campaign.settings.allowMergeDuplicates,
      sourceWalletId: campaign.funding.sourceWalletId,
      plan: campaign.plan,
      execution: campaign.execution,
      tags: campaign.tags,
      notes: campaign.notes,
    });
  },

  async getById(id: string): Promise<AirdropCampaign | undefined> {
    try {
      const res = await apiClient.get<ApiResponse<ApiRow>>(`/api/v1/campaigns/${id}`);
      return res.data ? mapApiCampaignToLocal(res.data) : undefined;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return undefined;
      throw err;
    }
  },

  async getAll(): Promise<AirdropCampaign[]> {
    const res = await apiClient.get<ApiResponse<PaginatedData<ApiRow>>>('/api/v1/campaigns?pageSize=100');
    return (res.data?.items ?? []).map(mapApiCampaignToLocal);
  },

  async getByNetwork(network: Network): Promise<AirdropCampaign[]> {
    const res = await apiClient.get<ApiResponse<PaginatedData<ApiRow>>>(
      `/api/v1/campaigns?network=${network}&pageSize=100`,
    );
    return (res.data?.items ?? []).map(mapApiCampaignToLocal);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<ApiResponse<void>>(`/api/v1/campaigns/${id}`);
  },

  async patch(id: string, updates: Partial<AirdropCampaign>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.recipients !== undefined) body.recipients = updates.recipients;
    if (updates.settings !== undefined) {
      body.feeRateSatPerByte = updates.settings.feeRateSatPerByte;
      body.dustSatPerOutput = updates.settings.dustSatPerOutput;
      body.maxOutputsPerTx = updates.settings.maxOutputsPerTx;
      body.maxInputsPerTx = updates.settings.maxInputsPerTx;
      body.allowMergeDuplicates = updates.settings.allowMergeDuplicates;
    }
    if (updates.funding !== undefined) {
      body.sourceWalletId = updates.funding.sourceWalletId;
    }
    if (updates.plan !== undefined) body.plan = updates.plan;
    if (updates.execution !== undefined) body.execution = updates.execution;
    if (updates.tags !== undefined) body.tags = updates.tags;
    if (updates.notes !== undefined) body.notes = updates.notes;
    if (updates.token !== undefined) {
      // Token updates are stored in the campaign row
      body.tokenId = updates.token.tokenId;
      body.tokenSymbol = updates.token.symbol;
      body.tokenName = updates.token.name;
      body.tokenDecimals = updates.token.decimals;
    }

    await apiClient.patch<ApiResponse<void>>(`/api/v1/campaigns/${id}`, body);
  },
};

// ============================================================================
// Vesting Campaign Repository (API)
// ============================================================================

export const apiVestingRepo = {
  async create(campaign: VestingCampaign): Promise<string> {
    await apiClient.post<ApiResponse<{ id: string }>>('/api/v1/vesting', {
      id: campaign.id,
      name: campaign.name,
      network: campaign.network,
      tokenId: campaign.token.tokenId,
      tokenSymbol: campaign.token.symbol,
      tokenName: campaign.token.name,
      tokenDecimals: campaign.token.decimals,
      template: campaign.template,
      schedule: campaign.schedule,
      beneficiaries: campaign.beneficiaries,
    });
    return campaign.id;
  },

  async update(campaign: VestingCampaign): Promise<void> {
    await apiClient.patch<ApiResponse<void>>(`/api/v1/vesting/${campaign.id}`, {
      name: campaign.name,
      beneficiaries: campaign.beneficiaries,
      plan: campaign.plan,
      execution: campaign.execution,
    });
  },

  async getById(id: string): Promise<VestingCampaign | undefined> {
    try {
      const res = await apiClient.get<ApiResponse<ApiRow>>(`/api/v1/vesting/${id}`);
      return res.data ? mapApiVestingToLocal(res.data) : undefined;
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 404) return undefined;
      throw err;
    }
  },

  async getAll(): Promise<VestingCampaign[]> {
    const res = await apiClient.get<ApiResponse<PaginatedData<ApiRow>>>('/api/v1/vesting?pageSize=100');
    return (res.data?.items ?? []).map(mapApiVestingToLocal);
  },

  async getByNetwork(network: Network): Promise<VestingCampaign[]> {
    const res = await apiClient.get<ApiResponse<PaginatedData<ApiRow>>>(
      `/api/v1/vesting?network=${network}&pageSize=100`,
    );
    return (res.data?.items ?? []).map(mapApiVestingToLocal);
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete<ApiResponse<void>>(`/api/v1/vesting/${id}`);
  },

  async patch(id: string, updates: Partial<VestingCampaign>): Promise<void> {
    const body: Record<string, unknown> = {};
    if (updates.name !== undefined) body.name = updates.name;
    if (updates.beneficiaries !== undefined) body.beneficiaries = updates.beneficiaries;
    if (updates.plan !== undefined) body.plan = updates.plan;
    if (updates.execution !== undefined) body.execution = updates.execution;

    await apiClient.patch<ApiResponse<void>>(`/api/v1/vesting/${id}`, body);
  },
};

// ============================================================================
// Log Repository (API)
// ============================================================================

export const apiLogRepo = {
  async add(entry: Omit<LogEntry, 'id'>): Promise<number> {
    // Logs are written locally for now; API log push is optional
    console.log(`[${entry.level}][${entry.category}] ${entry.message}`);
    return 0;
  },

  async log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
    _campaignId?: string,
    _batchId?: string,
  ): Promise<number> {
    console.log(`[${level}][${category}] ${message}`, data || '');
    return 0;
  },

  async getRecent(_limit?: number): Promise<LogEntry[]> {
    return [];
  },

  async getByCampaign(_campaignId: string, _limit?: number): Promise<LogEntry[]> {
    return [];
  },

  async getByLevel(_level: LogLevel, _limit?: number): Promise<LogEntry[]> {
    return [];
  },

  async clearOlderThan(_timestamp: number): Promise<number> {
    return 0;
  },

  async clearAll(): Promise<void> {
    // no-op for API mode
  },
};

// ============================================================================
// Mappers: API row → local domain type
// ============================================================================

/**
 * Map API (Drizzle/Postgres snake_case) campaign row to local domain type.
 * The API returns camelCase JSON from Drizzle select, but column names
 * may differ. We normalize here.
 */
function mapApiCampaignToLocal(raw: Record<string, unknown>): AirdropCampaign {
  // The API row has flat token columns; re-compose into nested TokenRef
  return {
    id: (raw.id as string) ?? '',
    name: (raw.name as string) ?? '',
    createdAt: toTimestamp(raw.createdAt ?? raw.created_at),
    updatedAt: toTimestamp(raw.updatedAt ?? raw.updated_at),
    network: ((raw.network as string) ?? 'testnet') as Network,
    token: {
      tokenId: (raw.tokenId ?? raw.token_id ?? '') as string,
      symbol: (raw.tokenSymbol ?? raw.token_symbol) as string | undefined,
      name: (raw.tokenName ?? raw.token_name) as string | undefined,
      decimals: (raw.tokenDecimals ?? raw.token_decimals) as number | undefined,
      iconUrl: (raw.tokenIconUrl ?? raw.token_icon_url) as string | undefined,
      verified: (raw.tokenVerified ?? raw.token_verified ?? false) as boolean,
    },
    mode: ((raw.mode ?? raw.campaign_mode ?? 'FT') as string) as 'FT' | 'NFT',
    amountUnit: ((raw.amountUnit ?? raw.amount_unit ?? 'base') as string) as 'base' | 'display',
    recipients: (raw.recipients as AirdropCampaign['recipients']) ?? [],
    settings: {
      feeRateSatPerByte: asNumber(raw.feeRateSatPerByte ?? raw.fee_rate_sat_per_byte, 1),
      dustSatPerOutput: asNumber(raw.dustSatPerOutput ?? raw.dust_sat_per_output, 546),
      maxOutputsPerTx: asNumber(raw.maxOutputsPerTx ?? raw.max_outputs_per_tx, 80),
      maxInputsPerTx: asNumber(raw.maxInputsPerTx ?? raw.max_inputs_per_tx, 50),
      allowMergeDuplicates: Boolean(raw.allowMergeDuplicates ?? raw.allow_merge_duplicates ?? false),
      rounding: ((raw.rounding ?? 'floor') as string) as 'floor' | 'round' | 'ceil',
    },
    funding: {
      sourceWalletId: ((raw.sourceWalletId ?? raw.source_wallet_id ?? '') as string),
      tokenUtxoSelection: ((raw.tokenUtxoSelection ?? raw.token_utxo_selection ?? 'auto') as string) as 'auto' | 'manual',
      bchUtxoSelection: ((raw.bchUtxoSelection ?? raw.bch_utxo_selection ?? 'auto') as string) as 'auto' | 'manual',
      selectedTokenUtxos: (raw.selectedTokenUtxos ?? raw.selected_token_utxos) as string[] | undefined,
      selectedBchUtxos: (raw.selectedBchUtxos ?? raw.selected_bch_utxos) as string[] | undefined,
    },
    plan: (raw.plan as AirdropCampaign['plan']) ?? undefined,
    execution: (raw.execution as AirdropCampaign['execution']) ?? undefined,
    tags: (raw.tags as string[]) ?? undefined,
    notes: (raw.notes as string) ?? undefined,
  };
}

function mapApiVestingToLocal(raw: Record<string, unknown>): VestingCampaign {
  return {
    id: (raw.id as string) ?? '',
    name: (raw.name as string) ?? '',
    createdAt: toTimestamp(raw.createdAt ?? raw.created_at),
    updatedAt: toTimestamp(raw.updatedAt ?? raw.updated_at),
    network: ((raw.network as string) ?? 'testnet') as Network,
    token: {
      tokenId: (raw.tokenId ?? raw.token_id ?? '') as string,
      symbol: (raw.tokenSymbol ?? raw.token_symbol) as string | undefined,
      name: (raw.tokenName ?? raw.token_name) as string | undefined,
      decimals: (raw.tokenDecimals ?? raw.token_decimals) as number | undefined,
      iconUrl: (raw.tokenIconUrl ?? raw.token_icon_url) as string | undefined,
      verified: (raw.tokenVerified ?? raw.token_verified ?? false) as boolean,
    },
    template: ((raw.template ?? 'CLIFF_ONLY') as string) as VestingCampaign['template'],
    schedule: (raw.schedule as VestingCampaign['schedule']) ?? { unlockTimes: [], amountsBasePerTranche: [] },
    beneficiaries: (raw.beneficiaries as VestingCampaign['beneficiaries']) ?? [],
    settings: {
      feeRateSatPerByte: asNumber(raw.feeRateSatPerByte ?? raw.fee_rate_sat_per_byte, 1),
      dustSatPerOutput: asNumber(raw.dustSatPerOutput ?? raw.dust_sat_per_output, 546),
      lockScriptType: 'P2SH_CLTV_P2PKH',
    },
    funding: {
      sourceWalletId: ((raw.sourceWalletId ?? raw.source_wallet_id ?? '') as string),
    },
    plan: (raw.plan as VestingCampaign['plan']) ?? undefined,
    execution: (raw.execution as VestingCampaign['execution']) ?? undefined,
  };
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
  }
  return Date.now();
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return isNaN(n) ? fallback : n;
  }
  return fallback;
}
