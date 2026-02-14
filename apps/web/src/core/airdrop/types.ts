/**
 * Airdrop Campaign Types
 *
 * Extended types for airdrop campaign management and wizard steps.
 */

export type {
  AirdropCampaign,
  AirdropSettings,
  AirdropFunding,
  RecipientRow,
} from '@/core/db/types';

/**
 * Wizard steps for airdrop campaign creation/editing
 */
export type AirdropWizardStep =
  | 'basics'
  | 'token'
  | 'recipients'
  | 'funding'
  | 'simulation'
  | 'execute'
  | 'report';

/**
 * Step metadata for UI display
 */
export interface WizardStepInfo {
  id: AirdropWizardStep;
  label: string;
  description: string;
  isComplete: (campaign: import('@/core/db/types').AirdropCampaign) => boolean;
  isAccessible: (campaign: import('@/core/db/types').AirdropCampaign) => boolean;
}

/**
 * Campaign creation input (minimal required fields)
 */
export interface CreateCampaignInput {
  name: string;
  network: import('@/core/db/types').Network;
  mode?: 'FT' | 'NFT';
  notes?: string;
}

/**
 * Campaign summary for list display
 */
export interface CampaignSummary {
  id: string;
  name: string;
  network: import('@/core/db/types').Network;
  tokenSymbol?: string;
  recipientCount: number;
  totalAmount?: string; // bigint as string
  status: CampaignStatus;
  createdAt: number;
  updatedAt: number;
}

/**
 * Derived campaign status for UI display
 */
export type CampaignStatus =
  | 'DRAFT' // No recipients yet
  | 'READY' // Has recipients, ready to plan
  | 'PLANNED' // Plan generated, ready to execute
  | 'RUNNING' // Execution in progress
  | 'PAUSED' // Execution paused
  | 'COMPLETED' // All recipients processed
  | 'FAILED'; // Execution failed
