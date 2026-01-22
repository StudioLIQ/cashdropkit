/**
 * Airdrop Store
 *
 * Zustand store for airdrop campaign state management.
 * Handles campaign list, active campaign, wizard state, and UI state.
 */
import { create } from 'zustand';

import {
  type AirdropWizardStep,
  type CampaignSummary,
  type CreateCampaignInput,
  airdropService,
  getCurrentWizardStep,
} from '@/core/airdrop';
import type { AirdropCampaign, Network, RecipientRow, TokenRef } from '@/core/db/types';
import {
  type PlannerResult,
  type PlannerWarning,
  type QuickEstimate,
  generatePlanFromCampaign,
  quickEstimate,
} from '@/core/planner';

export interface AirdropState {
  // Campaign list data
  campaigns: CampaignSummary[];
  isLoadingList: boolean;

  // Active campaign
  activeCampaign: AirdropCampaign | null;
  isLoadingCampaign: boolean;

  // Wizard state
  currentStep: AirdropWizardStep;

  // UI state
  showCreateModal: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  isSaving: boolean;

  // Planning state
  isPlanning: boolean;
  plannerWarnings: PlannerWarning[];
  quickEstimate: QuickEstimate | null;

  // Error state
  error: string | null;

  // Actions - List
  loadCampaigns: (network?: Network) => Promise<void>;

  // Actions - Campaign CRUD
  createCampaign: (input: CreateCampaignInput) => Promise<AirdropCampaign>;
  loadCampaign: (id: string) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  clearActiveCampaign: () => void;

  // Actions - Campaign Updates
  updateCampaignName: (name: string) => Promise<void>;
  updateCampaignToken: (token: TokenRef) => Promise<void>;
  updateCampaignRecipients: (recipients: RecipientRow[]) => Promise<void>;
  updateCampaignSettings: (settings: AirdropCampaign['settings']) => Promise<void>;
  updateCampaignFunding: (funding: AirdropCampaign['funding']) => Promise<void>;
  saveCampaign: () => Promise<void>;

  // Actions - Wizard
  setCurrentStep: (step: AirdropWizardStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;

  // Actions - Planning
  generatePlan: () => Promise<PlannerResult | null>;
  updateQuickEstimate: () => void;
  clearPlan: () => void;

  // Actions - UI
  openCreateModal: () => void;
  closeCreateModal: () => void;
  clearError: () => void;
}

const STEP_ORDER: AirdropWizardStep[] = [
  'basics',
  'token',
  'recipients',
  'funding',
  'simulation',
  'execute',
  'report',
];

export const useAirdropStore = create<AirdropState>((set, get) => ({
  // Initial state
  campaigns: [],
  isLoadingList: false,
  activeCampaign: null,
  isLoadingCampaign: false,
  currentStep: 'basics',
  showCreateModal: false,
  isCreating: false,
  isDeleting: false,
  isSaving: false,
  isPlanning: false,
  plannerWarnings: [],
  quickEstimate: null,
  error: null,

  // Load campaigns list
  loadCampaigns: async (network?: Network) => {
    set({ isLoadingList: true, error: null });
    try {
      const campaigns = network
        ? await airdropService.getSummariesByNetwork(network)
        : await airdropService.getAllSummaries();
      set({ campaigns, isLoadingList: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load campaigns',
        isLoadingList: false,
      });
    }
  },

  // Create new campaign
  createCampaign: async (input: CreateCampaignInput) => {
    set({ isCreating: true, error: null });
    try {
      const campaign = await airdropService.create(input);

      // Refresh list
      await get().loadCampaigns();

      set({
        isCreating: false,
        showCreateModal: false,
      });

      return campaign;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to create campaign',
        isCreating: false,
      });
      throw err;
    }
  },

  // Load single campaign
  loadCampaign: async (id: string) => {
    set({ isLoadingCampaign: true, error: null });
    try {
      const campaign = await airdropService.getById(id);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const currentStep = getCurrentWizardStep(campaign);
      set({
        activeCampaign: campaign,
        currentStep,
        isLoadingCampaign: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load campaign',
        isLoadingCampaign: false,
      });
    }
  },

  // Delete campaign
  deleteCampaign: async (id: string) => {
    set({ isDeleting: true, error: null });
    try {
      await airdropService.delete(id);

      // Clear active campaign if it's the deleted one
      const activeCampaign = get().activeCampaign;
      if (activeCampaign?.id === id) {
        set({ activeCampaign: null });
      }

      // Refresh list
      await get().loadCampaigns();

      set({ isDeleting: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to delete campaign',
        isDeleting: false,
      });
    }
  },

  // Clear active campaign
  clearActiveCampaign: () => {
    set({ activeCampaign: null, currentStep: 'basics' });
  },

  // Update campaign name (local state + persist)
  updateCampaignName: async (name: string) => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({
      activeCampaign: { ...campaign, name: name.trim(), updatedAt: Date.now() },
    });

    try {
      await airdropService.updateName(campaign.id, name);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update name',
      });
    }
  },

  // Update campaign token (local state + persist)
  updateCampaignToken: async (token: TokenRef) => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({
      activeCampaign: { ...campaign, token, updatedAt: Date.now() },
    });

    try {
      await airdropService.updateToken(campaign.id, token);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update token',
      });
    }
  },

  // Update campaign recipients (local state + persist)
  updateCampaignRecipients: async (recipients: RecipientRow[]) => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({
      activeCampaign: { ...campaign, recipients, updatedAt: Date.now() },
    });

    try {
      await airdropService.updateRecipients(campaign.id, recipients);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update recipients',
      });
    }
  },

  // Update campaign settings (local state + persist)
  updateCampaignSettings: async (settings: AirdropCampaign['settings']) => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({
      activeCampaign: { ...campaign, settings, updatedAt: Date.now() },
    });

    try {
      await airdropService.updateSettings(campaign.id, settings);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update settings',
      });
    }
  },

  // Update campaign funding (local state + persist)
  updateCampaignFunding: async (funding: AirdropCampaign['funding']) => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({
      activeCampaign: { ...campaign, funding, updatedAt: Date.now() },
    });

    try {
      await airdropService.updateFunding(campaign.id, funding);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update funding',
      });
    }
  },

  // Save entire campaign
  saveCampaign: async () => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({ isSaving: true, error: null });
    try {
      await airdropService.update(campaign);
      set({ isSaving: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to save campaign',
        isSaving: false,
      });
    }
  },

  // Wizard navigation
  setCurrentStep: (step: AirdropWizardStep) => {
    set({ currentStep: step });
  },

  goToNextStep: () => {
    const currentIndex = STEP_ORDER.indexOf(get().currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      set({ currentStep: STEP_ORDER[currentIndex + 1] });
    }
  },

  goToPreviousStep: () => {
    const currentIndex = STEP_ORDER.indexOf(get().currentStep);
    if (currentIndex > 0) {
      set({ currentStep: STEP_ORDER[currentIndex - 1] });
    }
  },

  // Planning actions
  generatePlan: async () => {
    const campaign = get().activeCampaign;
    if (!campaign) return null;

    set({ isPlanning: true, error: null, plannerWarnings: [] });
    try {
      const result = generatePlanFromCampaign(campaign);

      if (result.success && result.plan) {
        // Update campaign with plan
        const updatedCampaign = {
          ...campaign,
          plan: result.plan,
          updatedAt: Date.now(),
        };
        set({
          activeCampaign: updatedCampaign,
          plannerWarnings: result.warnings,
          isPlanning: false,
        });

        // Persist to DB
        await airdropService.updatePlan(campaign.id, result.plan);

        return result;
      } else {
        // Planning failed
        set({
          error: result.errors.map((e) => e.message).join('; '),
          plannerWarnings: result.warnings,
          isPlanning: false,
        });
        return result;
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to generate plan',
        isPlanning: false,
      });
      return null;
    }
  },

  updateQuickEstimate: () => {
    const campaign = get().activeCampaign;
    if (!campaign) {
      set({ quickEstimate: null });
      return;
    }

    const validRecipients = campaign.recipients.filter((r) => r.valid);
    const estimate = quickEstimate(validRecipients.length, campaign.settings);
    set({ quickEstimate: estimate });
  },

  clearPlan: () => {
    const campaign = get().activeCampaign;
    if (!campaign) return;

    set({
      activeCampaign: { ...campaign, plan: undefined, updatedAt: Date.now() },
      plannerWarnings: [],
      quickEstimate: null,
    });
  },

  // UI controls
  openCreateModal: () => set({ showCreateModal: true, error: null }),
  closeCreateModal: () => set({ showCreateModal: false, error: null }),
  clearError: () => set({ error: null }),
}));
