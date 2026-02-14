/**
 * Drizzle ORM schema for CashDrop Kit API
 *
 * Tables: wallets, airdrop_campaigns, vesting_campaigns, execution_logs, token_cache, settings
 * Security: NO secret fields (mnemonic, private keys) — those stay in browser LocalVault
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

// ============================================================================
// Enums
// ============================================================================

export const networkEnum = pgEnum('network', ['mainnet', 'testnet']);
export const walletTypeEnum = pgEnum('wallet_type', ['mnemonic', 'watch-only']);
export const campaignModeEnum = pgEnum('campaign_mode', ['FT', 'NFT']);
export const amountUnitEnum = pgEnum('amount_unit', ['base', 'display']);
export const roundingEnum = pgEnum('rounding', ['floor', 'round', 'ceil']);
export const utxoSelectionEnum = pgEnum('utxo_selection', ['auto', 'manual']);
export const recipientStatusEnum = pgEnum('recipient_status', [
  'PENDING',
  'PLANNED',
  'SENT',
  'CONFIRMED',
  'FAILED',
  'SKIPPED',
]);
export const executionStatusEnum = pgEnum('execution_status', [
  'READY',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
]);
export const confirmationStatusEnum = pgEnum('confirmation_status', [
  'UNKNOWN',
  'SEEN',
  'CONFIRMED',
  'DROPPED',
]);
export const trancheStatusEnum = pgEnum('tranche_status', [
  'PLANNED',
  'CREATED',
  'CONFIRMED',
  'UNLOCKED',
]);
export const vestingTemplateEnum = pgEnum('vesting_template', [
  'CLIFF_ONLY',
  'MONTHLY_TRANCHES',
  'CUSTOM_TRANCHES',
]);
export const lockScriptTypeEnum = pgEnum('lock_script_type', ['P2SH_CLTV_P2PKH']);
export const logLevelEnum = pgEnum('log_level', ['debug', 'info', 'warn', 'error']);
export const tokenSourceEnum = pgEnum('token_source', ['bcmr', 'otr', 'manual', 'unknown']);

// ============================================================================
// Wallets (public metadata only — NO secrets)
// ============================================================================

export const wallets = pgTable(
  'wallets',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    network: networkEnum('network').notNull(),
    type: walletTypeEnum('type').notNull(),
    derivationPath: varchar('derivation_path', { length: 128 }),
    addresses: jsonb('addresses').$type<string[]>(),
    watchAddress: varchar('watch_address', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('wallets_user_id_idx').on(table.userId)],
);

// ============================================================================
// Airdrop Campaigns
// ============================================================================

export const airdropCampaigns = pgTable(
  'airdrop_campaigns',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    network: networkEnum('network').notNull(),

    // Token reference
    tokenId: varchar('token_id', { length: 64 }).notNull(),
    tokenSymbol: varchar('token_symbol', { length: 32 }),
    tokenName: varchar('token_name', { length: 128 }),
    tokenDecimals: integer('token_decimals'),
    tokenIconUrl: text('token_icon_url'),
    tokenVerified: boolean('token_verified').default(false),

    mode: campaignModeEnum('mode').notNull().default('FT'),
    amountUnit: amountUnitEnum('amount_unit').notNull().default('base'),

    // Recipients stored as JSONB array
    recipients: jsonb('recipients').$type<unknown[]>().notNull().default([]),

    // Settings
    feeRateSatPerByte: integer('fee_rate_sat_per_byte').notNull().default(1),
    dustSatPerOutput: integer('dust_sat_per_output').notNull().default(546),
    maxOutputsPerTx: integer('max_outputs_per_tx').notNull().default(80),
    maxInputsPerTx: integer('max_inputs_per_tx').notNull().default(50),
    allowMergeDuplicates: boolean('allow_merge_duplicates').notNull().default(false),
    rounding: roundingEnum('rounding').notNull().default('floor'),

    // Funding
    sourceWalletId: varchar('source_wallet_id', { length: 36 }),
    tokenUtxoSelection: utxoSelectionEnum('token_utxo_selection').notNull().default('auto'),
    bchUtxoSelection: utxoSelectionEnum('bch_utxo_selection').notNull().default('auto'),
    selectedTokenUtxos: jsonb('selected_token_utxos').$type<string[]>(),
    selectedBchUtxos: jsonb('selected_bch_utxos').$type<string[]>(),

    // Plan (JSONB)
    plan: jsonb('plan'),

    // Execution state (JSONB)
    execution: jsonb('execution'),

    tags: jsonb('tags').$type<string[]>(),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('airdrop_campaigns_user_id_idx').on(table.userId),
    index('airdrop_campaigns_network_idx').on(table.network),
  ],
);

// ============================================================================
// Vesting Campaigns
// ============================================================================

export const vestingCampaigns = pgTable(
  'vesting_campaigns',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    network: networkEnum('network').notNull(),

    // Token reference
    tokenId: varchar('token_id', { length: 64 }).notNull(),
    tokenSymbol: varchar('token_symbol', { length: 32 }),
    tokenName: varchar('token_name', { length: 128 }),
    tokenDecimals: integer('token_decimals'),
    tokenIconUrl: text('token_icon_url'),
    tokenVerified: boolean('token_verified').default(false),

    template: vestingTemplateEnum('template').notNull(),
    schedule: jsonb('schedule').notNull(),

    beneficiaries: jsonb('beneficiaries').$type<unknown[]>().notNull().default([]),

    // Settings
    feeRateSatPerByte: integer('fee_rate_sat_per_byte').notNull().default(1),
    dustSatPerOutput: integer('dust_sat_per_output').notNull().default(546),
    lockScriptType: lockScriptTypeEnum('lock_script_type')
      .notNull()
      .default('P2SH_CLTV_P2PKH'),

    sourceWalletId: varchar('source_wallet_id', { length: 36 }),

    // Plan (JSONB)
    plan: jsonb('plan'),

    // Execution state (JSONB)
    execution: jsonb('execution'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('vesting_campaigns_user_id_idx').on(table.userId),
    index('vesting_campaigns_network_idx').on(table.network),
  ],
);

// ============================================================================
// Execution Logs
// ============================================================================

export const executionLogs = pgTable(
  'execution_logs',
  {
    id: serial('id').primaryKey(),
    userId: varchar('user_id', { length: 64 }).notNull(),
    campaignId: varchar('campaign_id', { length: 36 }),
    batchId: varchar('batch_id', { length: 36 }),
    level: logLevelEnum('level').notNull().default('info'),
    category: varchar('category', { length: 64 }).notNull(),
    message: text('message').notNull(),
    data: jsonb('data'),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('execution_logs_user_id_idx').on(table.userId),
    index('execution_logs_campaign_id_idx').on(table.campaignId),
    index('execution_logs_timestamp_idx').on(table.timestamp),
  ],
);

// ============================================================================
// Token Metadata Cache
// ============================================================================

export const tokenCache = pgTable(
  'token_cache',
  {
    /** Composite key: tokenId:network */
    id: varchar('id', { length: 140 }).primaryKey(),
    tokenId: varchar('token_id', { length: 64 }).notNull(),
    network: networkEnum('network').notNull(),
    symbol: varchar('symbol', { length: 32 }),
    name: varchar('name', { length: 128 }),
    decimals: integer('decimals'),
    description: text('description'),
    iconUrl: text('icon_url'),
    source: tokenSourceEnum('source').notNull().default('unknown'),
    verified: boolean('verified').notNull().default(false),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    fetchError: text('fetch_error'),
  },
  (table) => [
    index('token_cache_token_id_idx').on(table.tokenId),
    index('token_cache_expires_at_idx').on(table.expiresAt),
  ],
);

// ============================================================================
// App Settings (per user)
// ============================================================================

export const appSettings = pgTable('app_settings', {
  id: varchar('id', { length: 64 }).primaryKey(), // userId or 'default'
  userId: varchar('user_id', { length: 64 }).notNull(),
  network: networkEnum('network').notNull().default('mainnet'),
  autoLockMinutes: integer('auto_lock_minutes').notNull().default(15),
  requirePasswordForSigning: boolean('require_password_for_signing').notNull().default(true),
  defaultFeeRateSatPerByte: integer('default_fee_rate_sat_per_byte').notNull().default(1),
  defaultDustSatPerOutput: integer('default_dust_sat_per_output').notNull().default(546),
  defaultMaxOutputsPerTx: integer('default_max_outputs_per_tx').notNull().default(80),
  lastActiveWalletId: varchar('last_active_wallet_id', { length: 36 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
