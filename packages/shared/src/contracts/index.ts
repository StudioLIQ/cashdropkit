/**
 * External Contract Registry
 *
 * Manages contract addresses/versions for different networks.
 * Shared between FE (apps/web) and BE (apps/api).
 *
 * Design: No on-chain smart contracts in CashDrop Kit MVP.
 * This registry tracks the Electrum/provider endpoints and
 * CLTV lockbox script templates used across networks.
 */

import { createHash } from 'node:crypto';

export interface ContractEntry {
  /** Human-readable identifier */
  name: string;
  /** Network-specific address or endpoint */
  address: string;
  /** Contract/script version */
  version: string;
  /** When this entry was deployed/registered */
  deployedAt: string; // ISO date
  /** Chain identifier (for mismatch guard) */
  chainId: string;
  /** SHA-256 checksum of the entry for integrity verification */
  checksum?: string;
}

export interface ContractManifest {
  version: string;
  updatedAt: string;
  entries: Record<string, ContractEntry>;
}

// ============================================================================
// Default Manifests
// ============================================================================

const MAINNET_MANIFEST: ContractManifest = {
  version: '1.0.0',
  updatedAt: '2026-02-14',
  entries: {
    'electrum-primary': {
      name: 'Electrum Primary',
      address: 'wss://bch.imaginary.cash:50004',
      version: '1.5.x',
      deployedAt: '2024-01-01',
      chainId: 'mainnet',
    },
    'electrum-fallback': {
      name: 'Electrum Fallback',
      address: 'wss://electrum.imaginary.cash:50004',
      version: '1.5.x',
      deployedAt: '2024-01-01',
      chainId: 'mainnet',
    },
    'cltv-lockbox-template': {
      name: 'CLTV Lockbox Script (P2SH_CLTV_P2PKH)',
      address: 'N/A',
      version: '1.0.0',
      deployedAt: '2026-01-01',
      chainId: 'mainnet',
    },
  },
};

const TESTNET_MANIFEST: ContractManifest = {
  version: '1.0.0',
  updatedAt: '2026-02-14',
  entries: {
    'electrum-primary': {
      name: 'Chipnet Electrum',
      address: 'wss://chipnet.imaginary.cash:50004',
      version: '1.5.x',
      deployedAt: '2024-01-01',
      chainId: 'testnet',
    },
    'cltv-lockbox-template': {
      name: 'CLTV Lockbox Script (P2SH_CLTV_P2PKH)',
      address: 'N/A',
      version: '1.0.0',
      deployedAt: '2026-01-01',
      chainId: 'testnet',
    },
  },
};

const MANIFESTS: Record<string, ContractManifest> = {
  mainnet: MAINNET_MANIFEST,
  testnet: TESTNET_MANIFEST,
};

// ============================================================================
// Loader + Validation
// ============================================================================

/**
 * Load the contract manifest for a given network.
 * Throws if the network is unknown.
 */
export function loadManifest(network: string): ContractManifest {
  const manifest = MANIFESTS[network];
  if (!manifest) {
    throw new Error(`Unknown network: ${network}. Available: ${Object.keys(MANIFESTS).join(', ')}`);
  }
  return manifest;
}

/**
 * Get a specific contract entry by name.
 * Throws if not found.
 */
export function getContractEntry(network: string, entryName: string): ContractEntry {
  const manifest = loadManifest(network);
  const entry = manifest.entries[entryName];
  if (!entry) {
    throw new Error(
      `Contract entry '${entryName}' not found in ${network} manifest. ` +
        `Available: ${Object.keys(manifest.entries).join(', ')}`,
    );
  }
  return entry;
}

/**
 * Compute SHA-256 checksum for a contract entry.
 */
export function computeChecksum(entry: ContractEntry): string {
  const data = `${entry.name}:${entry.address}:${entry.version}:${entry.chainId}`;
  return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/**
 * Verify that a contract entry's checksum matches.
 */
export function verifyChecksum(entry: ContractEntry): boolean {
  if (!entry.checksum) return true; // No checksum to verify
  return computeChecksum(entry) === entry.checksum;
}

/**
 * Validate that a contract entry matches the expected network.
 * Prevents chainId mismatch (e.g., using mainnet contract on testnet).
 */
export function validateChainId(entry: ContractEntry, expectedNetwork: string): void {
  if (entry.chainId !== expectedNetwork) {
    throw new Error(
      `Chain ID mismatch: contract '${entry.name}' is for '${entry.chainId}' ` +
        `but current network is '${expectedNetwork}'. Transaction execution blocked.`,
    );
  }
}

/**
 * Load and validate all entries in a manifest.
 * Returns list of validation errors (empty = valid).
 */
export function validateManifest(network: string): string[] {
  const errors: string[] = [];
  const manifest = loadManifest(network);

  for (const [name, entry] of Object.entries(manifest.entries)) {
    // Check chainId consistency
    if (entry.chainId !== network) {
      errors.push(`Entry '${name}': chainId '${entry.chainId}' doesn't match network '${network}'`);
    }

    // Check checksum if present
    if (entry.checksum && !verifyChecksum(entry)) {
      errors.push(`Entry '${name}': checksum verification failed`);
    }

    // Check required fields
    if (!entry.name || !entry.address || !entry.version || !entry.chainId) {
      errors.push(`Entry '${name}': missing required fields`);
    }
  }

  return errors;
}
