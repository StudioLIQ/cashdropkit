/**
 * Token Metadata Service
 *
 * Fetches and caches token metadata from BCMR and OTR registries.
 * Provides fallback for manual decimals input when metadata is unavailable.
 */
import type { Network, TokenMetadataCache, TokenRef } from '../db';
import { tokenMetadataRepo } from '../db';
import {
  type BcmrRegistry,
  DEFAULT_BCMR_URLS,
  DEFAULT_OTR_URLS,
  type OtrTokenEntry,
  type TokenLookupResult,
  type TokenServiceConfig,
  isValidTokenCategory,
  normalizeTokenId,
} from './types';

/** Default request timeout */
const DEFAULT_TIMEOUT_MS = 10000;

/** Default cache TTL: 24 hours */
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Token Metadata Service
 *
 * Singleton service for looking up and caching token metadata.
 */
export class TokenService {
  private config: Required<TokenServiceConfig>;

  /** In-memory cache for BCMR registry data (to avoid repeated fetches) */
  private bcmrCache: Map<string, BcmrRegistry> = new Map();

  /** In-memory cache for OTR token data */
  private otrCache: Map<string, OtrTokenEntry[]> = new Map();

  constructor(config: TokenServiceConfig) {
    this.config = {
      network: config.network,
      bcmrUrls: config.bcmrUrls ?? DEFAULT_BCMR_URLS[config.network],
      otrUrls: config.otrUrls ?? DEFAULT_OTR_URLS[config.network],
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      cacheTtlMs: config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    };
  }

  /**
   * Update the network configuration
   */
  setNetwork(network: Network): void {
    this.config.network = network;
    this.config.bcmrUrls = DEFAULT_BCMR_URLS[network];
    this.config.otrUrls = DEFAULT_OTR_URLS[network];
    // Clear in-memory caches on network change
    this.bcmrCache.clear();
    this.otrCache.clear();
  }

  /**
   * Look up token metadata by tokenId
   *
   * Strategy:
   * 1. Check IndexedDB cache (if not expired)
   * 2. Fetch from BCMR registries
   * 3. Fetch from OTR registries
   * 4. Return with requiresManualDecimals=true if no metadata found
   */
  async lookupToken(tokenId: string): Promise<TokenLookupResult> {
    const normalizedId = normalizeTokenId(tokenId);

    // Validate token ID format
    if (!isValidTokenCategory(normalizedId)) {
      return this.createErrorResult(
        tokenId,
        'Invalid token ID format. Expected 64 hex characters.'
      );
    }

    // Check IndexedDB cache first
    const cached = await this.checkCache(normalizedId);
    if (cached) {
      return cached;
    }

    // Try BCMR registries
    const bcmrResult = await this.fetchFromBcmr(normalizedId);
    if (bcmrResult.success && bcmrResult.hasMetadata) {
      await this.saveToCache(normalizedId, bcmrResult);
      return bcmrResult;
    }

    // Try OTR registries
    const otrResult = await this.fetchFromOtr(normalizedId);
    if (otrResult.success && otrResult.hasMetadata) {
      await this.saveToCache(normalizedId, otrResult);
      return otrResult;
    }

    // No metadata found - return with manual decimals required
    const noMetadataResult: TokenLookupResult = {
      success: true,
      token: {
        tokenId: normalizedId,
        verified: false,
      },
      source: 'unknown',
      hasMetadata: false,
      requiresManualDecimals: true,
      fromCache: false,
    };

    // Cache the "no metadata" result to avoid repeated lookups
    await this.saveToCache(normalizedId, noMetadataResult);

    return noMetadataResult;
  }

  /**
   * Manually set token metadata (for user-provided decimals)
   */
  async setManualMetadata(
    tokenId: string,
    metadata: {
      symbol?: string;
      name?: string;
      decimals: number;
      iconUrl?: string;
    }
  ): Promise<TokenLookupResult> {
    const normalizedId = normalizeTokenId(tokenId);

    if (!isValidTokenCategory(normalizedId)) {
      return this.createErrorResult(tokenId, 'Invalid token ID format.');
    }

    const result: TokenLookupResult = {
      success: true,
      token: {
        tokenId: normalizedId,
        symbol: metadata.symbol,
        name: metadata.name,
        decimals: metadata.decimals,
        iconUrl: metadata.iconUrl,
        verified: false,
      },
      source: 'manual',
      hasMetadata: true,
      requiresManualDecimals: false,
      fromCache: false,
    };

    await this.saveToCache(normalizedId, result);

    return result;
  }

  /**
   * Get cached token metadata without fetching
   */
  async getCached(tokenId: string): Promise<TokenLookupResult | null> {
    const normalizedId = normalizeTokenId(tokenId);
    const cached = await this.checkCache(normalizedId);
    return cached;
  }

  /**
   * Clear cache for a specific token
   */
  async clearCache(tokenId: string): Promise<void> {
    const normalizedId = normalizeTokenId(tokenId);
    await tokenMetadataRepo.delete(normalizedId, this.config.network);
  }

  /**
   * Clear all cached metadata for current network
   */
  async clearAllCache(): Promise<void> {
    const tokens = await tokenMetadataRepo.getAllByNetwork(this.config.network);
    for (const token of tokens) {
      await tokenMetadataRepo.delete(token.tokenId, this.config.network);
    }
    this.bcmrCache.clear();
    this.otrCache.clear();
  }

  /**
   * Search cached tokens by symbol
   */
  async searchBySymbol(symbol: string): Promise<TokenRef[]> {
    const results = await tokenMetadataRepo.searchBySymbol(symbol, this.config.network);
    return results.map((r) => this.cacheToTokenRef(r));
  }

  // ============================================================================
  // Private methods
  // ============================================================================

  private async checkCache(tokenId: string): Promise<TokenLookupResult | null> {
    const cached = await tokenMetadataRepo.get(tokenId, this.config.network);
    if (!cached) {
      return null;
    }

    return {
      success: true,
      token: this.cacheToTokenRef(cached),
      source: cached.source,
      hasMetadata: cached.decimals !== undefined,
      requiresManualDecimals: cached.decimals === undefined,
      fromCache: true,
    };
  }

  private async saveToCache(tokenId: string, result: TokenLookupResult): Promise<void> {
    await tokenMetadataRepo.set(
      tokenId,
      this.config.network,
      {
        symbol: result.token.symbol,
        name: result.token.name,
        decimals: result.token.decimals,
        iconUrl: result.token.iconUrl,
        source: result.source,
        verified: result.token.verified ?? false,
      },
      this.config.cacheTtlMs
    );
  }

  private cacheToTokenRef(cached: TokenMetadataCache): TokenRef {
    return {
      tokenId: cached.tokenId,
      symbol: cached.symbol,
      name: cached.name,
      decimals: cached.decimals,
      iconUrl: cached.iconUrl,
      verified: cached.verified,
    };
  }

  private async fetchFromBcmr(tokenId: string): Promise<TokenLookupResult> {
    for (const url of this.config.bcmrUrls) {
      try {
        const registry = await this.fetchBcmrRegistry(url);
        if (!registry?.identities) {
          continue;
        }

        // Look for the token in the registry
        const identity = registry.identities[tokenId];
        if (!identity) {
          continue;
        }

        // Get the latest revision (highest timestamp key)
        const timestamps = Object.keys(identity).sort().reverse();
        if (timestamps.length === 0) {
          continue;
        }

        const latestIdentity = identity[timestamps[0]];
        if (!latestIdentity) {
          continue;
        }

        return {
          success: true,
          token: {
            tokenId,
            symbol: latestIdentity.token?.symbol,
            name: latestIdentity.name,
            decimals: latestIdentity.token?.decimals,
            iconUrl: latestIdentity.uris?.icon,
            verified: true, // BCMR entries are considered verified
          },
          source: 'bcmr',
          hasMetadata: latestIdentity.token?.decimals !== undefined,
          requiresManualDecimals: latestIdentity.token?.decimals === undefined,
          fromCache: false,
        };
      } catch {
        // Continue to next URL on error
        continue;
      }
    }

    return {
      success: true,
      token: { tokenId },
      source: 'bcmr',
      hasMetadata: false,
      requiresManualDecimals: true,
      fromCache: false,
    };
  }

  private async fetchBcmrRegistry(url: string): Promise<BcmrRegistry | null> {
    // Check in-memory cache
    const cached = this.bcmrCache.get(url);
    if (cached) {
      return cached;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as BcmrRegistry;
      this.bcmrCache.set(url, data);
      return data;
    } catch {
      return null;
    }
  }

  private async fetchFromOtr(tokenId: string): Promise<TokenLookupResult> {
    for (const url of this.config.otrUrls) {
      try {
        const tokens = await this.fetchOtrTokens(url);
        if (!tokens) {
          continue;
        }

        // Find the token by ID
        const token = tokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase());
        if (!token) {
          continue;
        }

        return {
          success: true,
          token: {
            tokenId,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            iconUrl: token.icon,
            verified: token.verified ?? false,
          },
          source: 'otr',
          hasMetadata: true,
          requiresManualDecimals: false,
          fromCache: false,
        };
      } catch {
        continue;
      }
    }

    return {
      success: true,
      token: { tokenId },
      source: 'otr',
      hasMetadata: false,
      requiresManualDecimals: true,
      fromCache: false,
    };
  }

  private async fetchOtrTokens(url: string): Promise<OtrTokenEntry[] | null> {
    // Check in-memory cache
    const cached = this.otrCache.get(url);
    if (cached) {
      return cached;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as OtrTokenEntry[];
      this.otrCache.set(url, data);
      return data;
    } catch {
      return null;
    }
  }

  private createErrorResult(tokenId: string, error: string): TokenLookupResult {
    return {
      success: false,
      token: { tokenId },
      source: 'unknown',
      hasMetadata: false,
      requiresManualDecimals: true,
      error,
      fromCache: false,
    };
  }
}

// ============================================================================
// Singleton instance
// ============================================================================

let tokenServiceInstance: TokenService | null = null;

/**
 * Get the token service singleton
 */
export function getTokenService(network: Network = 'testnet'): TokenService {
  if (!tokenServiceInstance) {
    tokenServiceInstance = new TokenService({ network });
  } else if (tokenServiceInstance['config'].network !== network) {
    tokenServiceInstance.setNetwork(network);
  }
  return tokenServiceInstance;
}

/**
 * Reset the token service (for testing)
 */
export function resetTokenService(): void {
  tokenServiceInstance = null;
}
