CREATE TYPE "public"."amount_unit" AS ENUM('base', 'display');--> statement-breakpoint
CREATE TYPE "public"."campaign_mode" AS ENUM('FT', 'NFT');--> statement-breakpoint
CREATE TYPE "public"."confirmation_status" AS ENUM('UNKNOWN', 'SEEN', 'CONFIRMED', 'DROPPED');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('READY', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."lock_script_type" AS ENUM('P2SH_CLTV_P2PKH');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('debug', 'info', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."network" AS ENUM('mainnet', 'testnet');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('PENDING', 'PLANNED', 'SENT', 'CONFIRMED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."rounding" AS ENUM('floor', 'round', 'ceil');--> statement-breakpoint
CREATE TYPE "public"."token_source" AS ENUM('bcmr', 'otr', 'manual', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."tranche_status" AS ENUM('PLANNED', 'CREATED', 'CONFIRMED', 'UNLOCKED');--> statement-breakpoint
CREATE TYPE "public"."utxo_selection" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."vesting_template" AS ENUM('CLIFF_ONLY', 'MONTHLY_TRANCHES', 'CUSTOM_TRANCHES');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('mnemonic', 'watch-only');--> statement-breakpoint
CREATE TABLE "airdrop_campaigns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"network" "network" NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"token_symbol" varchar(32),
	"token_name" varchar(128),
	"token_decimals" integer,
	"token_icon_url" text,
	"token_verified" boolean DEFAULT false,
	"mode" "campaign_mode" DEFAULT 'FT' NOT NULL,
	"amount_unit" "amount_unit" DEFAULT 'base' NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fee_rate_sat_per_byte" integer DEFAULT 1 NOT NULL,
	"dust_sat_per_output" integer DEFAULT 546 NOT NULL,
	"max_outputs_per_tx" integer DEFAULT 80 NOT NULL,
	"max_inputs_per_tx" integer DEFAULT 50 NOT NULL,
	"allow_merge_duplicates" boolean DEFAULT false NOT NULL,
	"rounding" "rounding" DEFAULT 'floor' NOT NULL,
	"source_wallet_id" varchar(36),
	"token_utxo_selection" "utxo_selection" DEFAULT 'auto' NOT NULL,
	"bch_utxo_selection" "utxo_selection" DEFAULT 'auto' NOT NULL,
	"selected_token_utxos" jsonb,
	"selected_bch_utxos" jsonb,
	"plan" jsonb,
	"execution" jsonb,
	"tags" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"network" "network" DEFAULT 'mainnet' NOT NULL,
	"auto_lock_minutes" integer DEFAULT 15 NOT NULL,
	"require_password_for_signing" boolean DEFAULT true NOT NULL,
	"default_fee_rate_sat_per_byte" integer DEFAULT 1 NOT NULL,
	"default_dust_sat_per_output" integer DEFAULT 546 NOT NULL,
	"default_max_outputs_per_tx" integer DEFAULT 80 NOT NULL,
	"last_active_wallet_id" varchar(36),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"campaign_id" varchar(36),
	"batch_id" varchar(36),
	"level" "log_level" DEFAULT 'info' NOT NULL,
	"category" varchar(64) NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_cache" (
	"id" varchar(140) PRIMARY KEY NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"network" "network" NOT NULL,
	"symbol" varchar(32),
	"name" varchar(128),
	"decimals" integer,
	"description" text,
	"icon_url" text,
	"source" "token_source" DEFAULT 'unknown' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fetch_error" text
);
--> statement-breakpoint
CREATE TABLE "vesting_campaigns" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"network" "network" NOT NULL,
	"token_id" varchar(64) NOT NULL,
	"token_symbol" varchar(32),
	"token_name" varchar(128),
	"token_decimals" integer,
	"token_icon_url" text,
	"token_verified" boolean DEFAULT false,
	"template" "vesting_template" NOT NULL,
	"schedule" jsonb NOT NULL,
	"beneficiaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fee_rate_sat_per_byte" integer DEFAULT 1 NOT NULL,
	"dust_sat_per_output" integer DEFAULT 546 NOT NULL,
	"lock_script_type" "lock_script_type" DEFAULT 'P2SH_CLTV_P2PKH' NOT NULL,
	"source_wallet_id" varchar(36),
	"plan" jsonb,
	"execution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"network" "network" NOT NULL,
	"type" "wallet_type" NOT NULL,
	"derivation_path" varchar(128),
	"addresses" jsonb,
	"watch_address" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "airdrop_campaigns_user_id_idx" ON "airdrop_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "airdrop_campaigns_network_idx" ON "airdrop_campaigns" USING btree ("network");--> statement-breakpoint
CREATE INDEX "execution_logs_user_id_idx" ON "execution_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "execution_logs_campaign_id_idx" ON "execution_logs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "execution_logs_timestamp_idx" ON "execution_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "token_cache_token_id_idx" ON "token_cache" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "token_cache_expires_at_idx" ON "token_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "vesting_campaigns_user_id_idx" ON "vesting_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vesting_campaigns_network_idx" ON "vesting_campaigns" USING btree ("network");--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");