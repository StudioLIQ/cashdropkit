'use client';

import type { AirdropWizardStep, WizardStepInfo } from '@/core/airdrop';
import type { AirdropCampaign } from '@/core/db/types';

interface WizardStepperProps {
  steps: WizardStepInfo[];
  currentStep: AirdropWizardStep;
  campaign: AirdropCampaign;
  onStepClick: (step: AirdropWizardStep) => void;
}

export function WizardStepper({ steps, currentStep, campaign, onStepClick }: WizardStepperProps) {
  return (
    <nav className="flex items-center justify-between">
      <ol className="flex w-full items-center">
        {steps.map((step, index) => {
          const isComplete = step.isComplete(campaign);
          const isAccessible = step.isAccessible(campaign);
          const isCurrent = step.id === currentStep;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.id} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
              <button
                type="button"
                onClick={() => onStepClick(step.id)}
                disabled={!isAccessible}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isCurrent
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                    : isComplete
                      ? 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-500 dark:hover:bg-emerald-950'
                      : isAccessible
                        ? 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                        : 'cursor-not-allowed text-zinc-300 dark:text-zinc-600'
                }`}
              >
                {/* Step indicator */}
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isCurrent
                      ? 'bg-emerald-600 text-white'
                      : isComplete
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        : isAccessible
                          ? 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
                          : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                  }`}
                >
                  {isComplete && !isCurrent ? (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>

                {/* Step label - hide on small screens */}
                <span className="hidden sm:inline">{step.label}</span>
              </button>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${
                    isComplete
                      ? 'bg-emerald-300 dark:bg-emerald-700'
                      : 'bg-zinc-200 dark:bg-zinc-700'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
