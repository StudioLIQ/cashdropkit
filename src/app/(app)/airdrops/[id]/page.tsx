'use client';

import { useEffect } from 'react';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { useAirdropStore } from '@/stores';

import { type AirdropWizardStep, WIZARD_STEPS } from '@/core/airdrop';

import { WizardStepper } from '@/ui/components/airdrop/WizardStepper';
import {
  BasicsStep,
  ExecuteStep,
  FundingStep,
  RecipientsStep,
  ReportStep,
  SimulationStep,
  TokenStep,
} from '@/ui/components/airdrop/wizard';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const {
    activeCampaign,
    isLoadingCampaign,
    currentStep,
    error,
    loadCampaign,
    clearActiveCampaign,
    setCurrentStep,
    goToNextStep,
    goToPreviousStep,
    clearError,
  } = useAirdropStore();

  // Load campaign on mount
  useEffect(() => {
    loadCampaign(campaignId);

    return () => {
      clearActiveCampaign();
    };
  }, [campaignId, loadCampaign, clearActiveCampaign]);

  // Handle step navigation
  const handleStepClick = (stepId: AirdropWizardStep) => {
    if (!activeCampaign) return;

    const stepInfo = WIZARD_STEPS.find((s) => s.id === stepId);
    if (stepInfo && stepInfo.isAccessible(activeCampaign)) {
      setCurrentStep(stepId);
    }
  };

  // Loading state
  if (isLoadingCampaign) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/airdrops"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <div className="h-7 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Loading campaign...</span>
          </div>
        </div>
      </div>
    );
  }

  // Campaign not found
  if (!activeCampaign) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/airdrops"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Campaign Not Found
          </h1>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Campaign not found
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {error || 'The campaign you are looking for does not exist or has been deleted.'}
            </p>
            <button
              type="button"
              onClick={() => router.push('/airdrops')}
              className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500"
            >
              Back to Airdrops
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'basics':
        return <BasicsStep />;
      case 'token':
        return <TokenStep />;
      case 'recipients':
        return <RecipientsStep />;
      case 'funding':
        return <FundingStep />;
      case 'simulation':
        return <SimulationStep />;
      case 'execute':
        return <ExecuteStep />;
      case 'report':
        return <ReportStep />;
      default:
        return <BasicsStep />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/airdrops"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {activeCampaign.name}
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="capitalize">{activeCampaign.network}</span> •{' '}
              {activeCampaign.token.symbol || 'Token not selected'}
            </p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 dark:bg-red-950">
          <div className="flex">
            <svg
              className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="ml-3 flex-1">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Wizard stepper */}
      <WizardStepper
        steps={WIZARD_STEPS}
        currentStep={currentStep}
        campaign={activeCampaign}
        onStepClick={handleStepClick}
      />

      {/* Step content */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        {renderStepContent()}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={goToPreviousStep}
          disabled={currentStep === 'basics'}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Previous
        </button>
        <button
          type="button"
          onClick={goToNextStep}
          disabled={currentStep === 'report'}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
