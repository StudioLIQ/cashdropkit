/**
 * Airdrop Service
 *
 * Business logic for airdrop campaign management.
 * Wraps the repository with validation and derived state calculations.
 */
import { airdropRepo, settingsRepo } from '@/core/db';
import type { AirdropCampaign, Network, RecipientRow, TokenRef } from '@/core/db/types';

import type {
  AirdropWizardStep,
  CampaignStatus,
  CampaignSummary,
  CreateCampaignInput,
  WizardStepInfo,
} from './types';

/**
 * Generate a UUID v4 using the built-in crypto API
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get default airdrop settings from app settings
 */
async function getDefaultSettings(): Promise<AirdropCampaign['settings']> {
  const appSettings = await settingsRepo.get();
  return {
    feeRateSatPerByte: appSettings.defaultFeeRateSatPerByte,
    dustSatPerOutput: appSettings.defaultDustSatPerOutput,
    maxOutputsPerTx: appSettings.defaultMaxOutputsPerTx,
    maxInputsPerTx: 50,
    allowMergeDuplicates: false,
    rounding: 'floor',
  };
}

/**
 * Create empty token ref placeholder
 */
function emptyTokenRef(): TokenRef {
  return {
    tokenId: '',
    symbol: undefined,
    name: undefined,
    decimals: undefined,
    iconUrl: undefined,
    verified: false,
  };
}

/**
 * Create empty funding placeholder
 */
function emptyFunding(): AirdropCampaign['funding'] {
  return {
    sourceWalletId: '',
    tokenUtxoSelection: 'auto',
    bchUtxoSelection: 'auto',
  };
}

/**
 * Derive campaign status from campaign data
 */
export function deriveCampaignStatus(campaign: AirdropCampaign): CampaignStatus {
  // Check execution state first
  if (campaign.execution) {
    switch (campaign.execution.state) {
      case 'RUNNING':
        return 'RUNNING';
      case 'PAUSED':
        return 'PAUSED';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'FAILED':
        return 'FAILED';
    }
  }

  // Check if plan exists
  if (campaign.plan && campaign.plan.batches.length > 0) {
    return 'PLANNED';
  }

  // Check if recipients exist
  const validRecipients = campaign.recipients.filter((r) => r.valid);
  if (validRecipients.length > 0) {
    return 'READY';
  }

  return 'DRAFT';
}

/**
 * Convert campaign to summary for list display
 */
export function campaignToSummary(campaign: AirdropCampaign): CampaignSummary {
  const validRecipients = campaign.recipients.filter((r) => r.valid);

  // Sum total amount from valid recipients
  let totalAmount: string | undefined;
  if (validRecipients.length > 0) {
    const total = validRecipients.reduce((sum, r) => sum + BigInt(r.amountBase), 0n);
    totalAmount = total.toString();
  }

  return {
    id: campaign.id,
    name: campaign.name,
    network: campaign.network,
    tokenSymbol: campaign.token.symbol,
    recipientCount: validRecipients.length,
    totalAmount,
    status: deriveCampaignStatus(campaign),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

/**
 * Wizard step definitions
 */
export const WIZARD_STEPS: WizardStepInfo[] = [
  {
    id: 'basics',
    label: 'Basics',
    description: 'Campaign name and settings',
    isComplete: (c) => c.name.trim().length > 0,
    isAccessible: () => true,
  },
  {
    id: 'token',
    label: 'Token',
    description: 'Select token to distribute',
    isComplete: (c) => c.token.tokenId.length === 64 && c.token.decimals !== undefined,
    isAccessible: (c) => c.name.trim().length > 0,
  },
  {
    id: 'recipients',
    label: 'Recipients',
    description: 'Import recipient list',
    isComplete: (c) => c.recipients.filter((r) => r.valid).length > 0,
    isAccessible: (c) => c.token.tokenId.length === 64,
  },
  {
    id: 'funding',
    label: 'Funding',
    description: 'Select wallet and UTXOs',
    isComplete: (c) => c.funding.sourceWalletId.length > 0,
    isAccessible: (c) => c.recipients.filter((r) => r.valid).length > 0,
  },
  {
    id: 'simulation',
    label: 'Simulation',
    description: 'Review execution plan',
    isComplete: (c) => c.plan !== undefined && c.plan.batches.length > 0,
    isAccessible: (c) => c.funding.sourceWalletId.length > 0,
  },
  {
    id: 'execute',
    label: 'Execute',
    description: 'Run the distribution',
    isComplete: (c) => c.execution?.state === 'COMPLETED',
    isAccessible: (c) => c.plan !== undefined && c.plan.batches.length > 0,
  },
  {
    id: 'report',
    label: 'Report',
    description: 'Export results',
    isComplete: () => false, // Always accessible once execution started
    isAccessible: (c) => c.execution !== undefined,
  },
];

/**
 * Get current wizard step based on campaign state
 */
export function getCurrentWizardStep(campaign: AirdropCampaign): AirdropWizardStep {
  // If execution is ongoing, go to execute
  if (campaign.execution?.state === 'RUNNING' || campaign.execution?.state === 'PAUSED') {
    return 'execute';
  }

  // If execution completed, go to report
  if (campaign.execution?.state === 'COMPLETED') {
    return 'report';
  }

  // Find first incomplete step
  for (const step of WIZARD_STEPS) {
    if (!step.isComplete(campaign) && step.isAccessible(campaign)) {
      return step.id;
    }
  }

  // Default to basics
  return 'basics';
}

// ============================================================================
// Airdrop Service
// ============================================================================

export const airdropService = {
  /**
   * Create a new airdrop campaign
   */
  async create(input: CreateCampaignInput): Promise<AirdropCampaign> {
    const now = Date.now();
    const settings = await getDefaultSettings();

    const campaign: AirdropCampaign = {
      id: generateId(),
      name: input.name.trim(),
      createdAt: now,
      updatedAt: now,
      network: input.network,
      token: emptyTokenRef(),
      mode: input.mode || 'FT',
      amountUnit: 'base',
      recipients: [],
      settings,
      funding: emptyFunding(),
      notes: input.notes,
    };

    await airdropRepo.create(campaign);
    return campaign;
  },

  /**
   * Get campaign by ID
   */
  async getById(id: string): Promise<AirdropCampaign | undefined> {
    return airdropRepo.getById(id);
  },

  /**
   * Get all campaigns
   */
  async getAll(): Promise<AirdropCampaign[]> {
    return airdropRepo.getAll();
  },

  /**
   * Get campaigns by network
   */
  async getByNetwork(network: Network): Promise<AirdropCampaign[]> {
    return airdropRepo.getByNetwork(network);
  },

  /**
   * Get all campaigns as summaries
   */
  async getAllSummaries(): Promise<CampaignSummary[]> {
    const campaigns = await airdropRepo.getAll();
    return campaigns.map(campaignToSummary);
  },

  /**
   * Get summaries by network
   */
  async getSummariesByNetwork(network: Network): Promise<CampaignSummary[]> {
    const campaigns = await airdropRepo.getByNetwork(network);
    return campaigns.map(campaignToSummary);
  },

  /**
   * Update campaign
   */
  async update(campaign: AirdropCampaign): Promise<void> {
    campaign.updatedAt = Date.now();
    await airdropRepo.update(campaign);
  },

  /**
   * Patch campaign with partial updates
   */
  async patch(id: string, updates: Partial<AirdropCampaign>): Promise<void> {
    await airdropRepo.patch(id, updates);
  },

  /**
   * Delete campaign
   */
  async delete(id: string): Promise<void> {
    await airdropRepo.delete(id);
  },

  /**
   * Update campaign name
   */
  async updateName(id: string, name: string): Promise<void> {
    await airdropRepo.patch(id, { name: name.trim() });
  },

  /**
   * Update campaign token
   */
  async updateToken(id: string, token: TokenRef): Promise<void> {
    await airdropRepo.patch(id, { token });
  },

  /**
   * Update campaign recipients
   */
  async updateRecipients(id: string, recipients: RecipientRow[]): Promise<void> {
    await airdropRepo.patch(id, { recipients });
  },

  /**
   * Update campaign settings
   */
  async updateSettings(id: string, settings: AirdropCampaign['settings']): Promise<void> {
    await airdropRepo.patch(id, { settings });
  },

  /**
   * Update campaign funding
   */
  async updateFunding(id: string, funding: AirdropCampaign['funding']): Promise<void> {
    await airdropRepo.patch(id, { funding });
  },

  /**
   * Check if campaign can be deleted (not in execution)
   */
  canDelete(campaign: AirdropCampaign): boolean {
    if (!campaign.execution) return true;
    return campaign.execution.state !== 'RUNNING';
  },

  /**
   * Check if campaign can be edited (not in execution)
   */
  canEdit(campaign: AirdropCampaign): boolean {
    if (!campaign.execution) return true;
    return campaign.execution.state !== 'RUNNING';
  },
};
