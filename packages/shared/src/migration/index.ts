/**
 * Data Migration: IndexedDB → Postgres
 *
 * Shared utilities for exporting local data and importing to the hosted API.
 * Used by both FE (export) and API (import validation).
 *
 * Security: Mnemonic/private keys are NEVER included in export bundles.
 */

// ============================================================================
// Export Bundle Types
// ============================================================================

export interface MigrationBundle {
  version: '1.0.0';
  exportedAt: string; // ISO date
  source: 'indexeddb';

  /** Wallet metadata ONLY — no secrets */
  wallets: WalletExport[];
  airdropCampaigns: CampaignExport[];
  vestingCampaigns: VestingExport[];
  settings: SettingsExport | null;

  /** Summary for verification */
  summary: MigrationSummary;
}

export interface WalletExport {
  id: string;
  name: string;
  network: string;
  type: string;
  derivationPath?: string;
  addresses?: string[];
  watchAddress?: string;
  createdAt: number;
  updatedAt: number;
  // NOTE: encryptedMnemonic, mnemonicSalt, mnemonicIv are EXCLUDED
}

export interface CampaignExport {
  id: string;
  name: string;
  network: string;
  token: Record<string, unknown>;
  mode: string;
  amountUnit: string;
  recipients: unknown[];
  settings: Record<string, unknown>;
  funding: Record<string, unknown>;
  plan?: unknown;
  execution?: unknown;
  tags?: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VestingExport {
  id: string;
  name: string;
  network: string;
  token: Record<string, unknown>;
  template: string;
  schedule: Record<string, unknown>;
  beneficiaries: unknown[];
  settings: Record<string, unknown>;
  funding: Record<string, unknown>;
  plan?: unknown;
  execution?: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface SettingsExport {
  network: string;
  autoLockMinutes: number;
  requirePasswordForSigning: boolean;
  defaultFeeRateSatPerByte: number;
  defaultDustSatPerOutput: number;
  defaultMaxOutputsPerTx: number;
}

export interface MigrationSummary {
  totalWallets: number;
  totalAirdropCampaigns: number;
  totalVestingCampaigns: number;
  totalRecipients: number;
  totalBeneficiaries: number;
}

// ============================================================================
// Import Validation
// ============================================================================

export type ConflictPolicy = 'skip' | 'overwrite' | 'rename';

export interface ImportResult {
  success: boolean;
  imported: {
    wallets: number;
    airdropCampaigns: number;
    vestingCampaigns: number;
    settings: boolean;
  };
  skipped: {
    wallets: string[];
    airdropCampaigns: string[];
    vestingCampaigns: string[];
  };
  errors: string[];
}

/** Secret fields that must not appear in migration bundles */
const FORBIDDEN_EXPORT_FIELDS = [
  'encryptedMnemonic',
  'mnemonicSalt',
  'mnemonicIv',
  'privateKey',
  'secretKey',
  'passphrase',
];

/**
 * Validate a migration bundle for correctness and security.
 * Returns list of errors (empty = valid).
 */
export function validateBundle(bundle: unknown): string[] {
  const errors: string[] = [];

  if (!bundle || typeof bundle !== 'object') {
    return ['Bundle must be a non-null object'];
  }

  const b = bundle as Record<string, unknown>;

  if (b.version !== '1.0.0') {
    errors.push(`Unsupported bundle version: ${b.version}`);
  }

  if (!b.exportedAt || typeof b.exportedAt !== 'string') {
    errors.push('Missing exportedAt timestamp');
  }

  if (!Array.isArray(b.wallets)) {
    errors.push('wallets must be an array');
  }

  if (!Array.isArray(b.airdropCampaigns)) {
    errors.push('airdropCampaigns must be an array');
  }

  if (!Array.isArray(b.vestingCampaigns)) {
    errors.push('vestingCampaigns must be an array');
  }

  // Security check: ensure no secrets leaked
  const json = JSON.stringify(bundle);
  for (const field of FORBIDDEN_EXPORT_FIELDS) {
    if (json.includes(`"${field}"`)) {
      errors.push(`SECURITY: Bundle contains forbidden field "${field}"`);
    }
  }

  return errors;
}

/**
 * Compute verification summary from a bundle.
 * Used to compare pre/post migration integrity.
 */
export function computeSummary(bundle: MigrationBundle): MigrationSummary {
  let totalRecipients = 0;
  let totalBeneficiaries = 0;

  for (const campaign of bundle.airdropCampaigns) {
    totalRecipients += Array.isArray(campaign.recipients) ? campaign.recipients.length : 0;
  }

  for (const campaign of bundle.vestingCampaigns) {
    totalBeneficiaries += Array.isArray(campaign.beneficiaries) ? campaign.beneficiaries.length : 0;
  }

  return {
    totalWallets: bundle.wallets.length,
    totalAirdropCampaigns: bundle.airdropCampaigns.length,
    totalVestingCampaigns: bundle.vestingCampaigns.length,
    totalRecipients,
    totalBeneficiaries,
  };
}

/**
 * Verify that a post-import summary matches the original bundle.
 */
export function verifySummary(
  expected: MigrationSummary,
  actual: MigrationSummary,
): string[] {
  const errors: string[] = [];
  const keys: (keyof MigrationSummary)[] = [
    'totalWallets',
    'totalAirdropCampaigns',
    'totalVestingCampaigns',
    'totalRecipients',
    'totalBeneficiaries',
  ];

  for (const key of keys) {
    if (expected[key] !== actual[key]) {
      errors.push(`${key}: expected ${expected[key]}, got ${actual[key]}`);
    }
  }

  return errors;
}
