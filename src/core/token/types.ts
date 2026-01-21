/**
 * Token Metadata Types
 *
 * Types for token metadata lookup and management.
 */
import type { Network, TokenRef } from '../db';

/**
 * Result of a token metadata lookup
 */
export interface TokenLookupResult {
  /** Whether the lookup succeeded */
  success: boolean;

  /** The resolved token reference (with metadata if found) */
  token: TokenRef;

  /** Source of the metadata */
  source: 'bcmr' | 'otr' | 'manual' | 'unknown';

  /** Whether metadata was found */
  hasMetadata: boolean;

  /** Whether manual decimals input is required */
  requiresManualDecimals: boolean;

  /** Any error message from the lookup */
  error?: string;

  /** Whether data came from cache */
  fromCache: boolean;
}

/**
 * BCMR (Bitcoin Cash Metadata Registry) identity
 */
export interface BcmrIdentity {
  name?: string;
  description?: string;
  uris?: {
    icon?: string;
    web?: string;
    [key: string]: string | undefined;
  };
  token?: {
    symbol?: string;
    decimals?: number;
    category?: string;
  };
}

/**
 * BCMR Registry response structure
 */
export interface BcmrRegistry {
  $schema?: string;
  version?: {
    major: number;
    minor: number;
    patch: number;
  };
  latestRevision?: string;
  registryIdentity?: {
    name?: string;
    description?: string;
  };
  identities?: {
    [category: string]: {
      [timestamp: string]: BcmrIdentity;
    };
  };
}

/**
 * OTR (Open Token Registry) token entry
 */
export interface OtrTokenEntry {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  description?: string;
  verified?: boolean;
}

/**
 * Configuration for token metadata service
 */
export interface TokenServiceConfig {
  /** Network to use */
  network: Network;

  /** BCMR registry URLs */
  bcmrUrls?: string[];

  /** OTR registry URLs */
  otrUrls?: string[];

  /** Request timeout in ms */
  timeoutMs?: number;

  /** Cache TTL in ms */
  cacheTtlMs?: number;
}

/**
 * Default BCMR registry URLs by network
 */
export const DEFAULT_BCMR_URLS: Record<Network, string[]> = {
  mainnet: ['https://otr.cash/.well-known/bitcoin-cash-metadata-registry.json'],
  testnet: [],
};

/**
 * Default OTR registry URLs by network
 */
export const DEFAULT_OTR_URLS: Record<Network, string[]> = {
  mainnet: ['https://otr.cash/api/v1/tokens'],
  testnet: [],
};

/**
 * Validates that a string is a valid token category (64 hex chars)
 */
export function isValidTokenCategory(tokenId: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(tokenId);
}

/**
 * Normalizes a token ID to lowercase
 */
export function normalizeTokenId(tokenId: string): string {
  return tokenId.toLowerCase().trim();
}
