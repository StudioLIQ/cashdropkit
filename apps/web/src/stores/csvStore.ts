/**
 * CSV Store
 *
 * Zustand store for CSV import workflow state.
 * Manages file upload, column mapping, validation, and duplicate merging.
 */
import { create } from 'zustand';

import {
  type ColumnMapping,
  type ColumnSuggestion,
  type CsvParseResult,
  type MergeResult,
  type ValidatedRecipientRow,
  type ValidationSummary,
  applyColumnMapping,
  exportInvalidRowsCsv,
  parseCsv,
  suggestColumnMapping,
  validateRecipients,
} from '@/core/csv';
import type { Network } from '@/core/db/types';

// ============================================================================
// Types
// ============================================================================

export type CsvWorkflowStep = 'upload' | 'mapping' | 'validation' | 'complete';

export interface CsvState {
  // Workflow state
  step: CsvWorkflowStep;
  isProcessing: boolean;
  error: string | null;

  // File state
  fileName: string | null;
  fileContent: string | null;

  // Parse result
  parseResult: CsvParseResult | null;
  headers: string[];

  // Column mapping
  mapping: ColumnMapping | null;
  mappingSuggestion: ColumnSuggestion | null;

  // Validation options
  network: Network;
  decimals: number;
  rounding: 'floor' | 'round' | 'ceil';
  mergeDuplicates: boolean;

  // Validation result
  validatedRows: ValidatedRecipientRow[];
  validationSummary: ValidationSummary | null;
  mergeResult: MergeResult | null;

  // Actions
  setNetwork: (network: Network) => void;
  setDecimals: (decimals: number) => void;
  setRounding: (rounding: 'floor' | 'round' | 'ceil') => void;
  setMergeDuplicates: (merge: boolean) => void;

  uploadFile: (file: File) => Promise<void>;
  parseContent: (content: string, fileName?: string) => void;

  setMapping: (mapping: ColumnMapping) => void;
  applyMapping: () => void;

  validate: () => void;
  revalidate: () => void;

  exportInvalidCsv: () => string;

  goToStep: (step: CsvWorkflowStep) => void;
  reset: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState = {
  step: 'upload' as CsvWorkflowStep,
  isProcessing: false,
  error: null,

  fileName: null,
  fileContent: null,

  parseResult: null,
  headers: [],

  mapping: null,
  mappingSuggestion: null,

  network: 'testnet' as Network,
  decimals: 8,
  rounding: 'floor' as const,
  mergeDuplicates: false,

  validatedRows: [],
  validationSummary: null,
  mergeResult: null,
};

// ============================================================================
// Store
// ============================================================================

export const useCsvStore = create<CsvState>((set, get) => ({
  ...initialState,

  // ---------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------

  setNetwork: (network: Network) => {
    set({ network });
    // Re-validate if we have rows
    const { validatedRows } = get();
    if (validatedRows.length > 0) {
      get().revalidate();
    }
  },

  setDecimals: (decimals: number) => {
    set({ decimals });
    const { validatedRows } = get();
    if (validatedRows.length > 0) {
      get().revalidate();
    }
  },

  setRounding: (rounding: 'floor' | 'round' | 'ceil') => {
    set({ rounding });
    const { validatedRows } = get();
    if (validatedRows.length > 0) {
      get().revalidate();
    }
  },

  setMergeDuplicates: (mergeDuplicates: boolean) => {
    set({ mergeDuplicates });
    const { validatedRows } = get();
    if (validatedRows.length > 0) {
      get().revalidate();
    }
  },

  // ---------------------------------------------------------------------
  // File Upload
  // ---------------------------------------------------------------------

  uploadFile: async (file: File) => {
    set({ isProcessing: true, error: null });

    try {
      const content = await file.text();
      get().parseContent(content, file.name);
    } catch (err) {
      set({
        isProcessing: false,
        error: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  },

  parseContent: (content: string, fileName?: string) => {
    set({ isProcessing: true, error: null });

    const parseResult = parseCsv(content);

    if (!parseResult.success) {
      set({
        isProcessing: false,
        error: parseResult.error ?? 'Failed to parse CSV',
        parseResult,
      });
      return;
    }

    // Suggest column mapping
    const mappingSuggestion = suggestColumnMapping(parseResult.headers);

    set({
      isProcessing: false,
      fileName: fileName ?? null,
      fileContent: content,
      parseResult,
      headers: parseResult.headers,
      mapping: mappingSuggestion.mapping,
      mappingSuggestion,
      step: 'mapping',
    });
  },

  // ---------------------------------------------------------------------
  // Column Mapping
  // ---------------------------------------------------------------------

  setMapping: (mapping: ColumnMapping) => {
    set({ mapping, error: null });
  },

  applyMapping: () => {
    const { parseResult, mapping } = get();

    if (!parseResult || !parseResult.success) {
      set({ error: 'No CSV data to map' });
      return;
    }

    if (!mapping) {
      set({ error: 'No column mapping configured' });
      return;
    }

    set({ isProcessing: true, error: null });

    const mappingResult = applyColumnMapping(parseResult.rows, mapping);

    if (!mappingResult.success) {
      set({
        isProcessing: false,
        error: mappingResult.error ?? 'Failed to apply mapping',
      });
      return;
    }

    // Proceed to validation
    const { network, decimals, rounding, mergeDuplicates } = get();

    const validationResult = validateRecipients(mappingResult.rows, {
      network,
      decimals,
      rounding,
      mergeDuplicates,
    });

    set({
      isProcessing: false,
      validatedRows: validationResult.rows,
      validationSummary: validationResult.summary,
      mergeResult: validationResult.mergeResult ?? null,
      step: 'validation',
    });
  },

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  validate: () => {
    get().applyMapping();
  },

  revalidate: () => {
    const { parseResult, mapping } = get();

    if (!parseResult || !mapping) {
      return;
    }

    const mappingResult = applyColumnMapping(parseResult.rows, mapping);
    if (!mappingResult.success) {
      return;
    }

    const { network, decimals, rounding, mergeDuplicates } = get();

    const validationResult = validateRecipients(mappingResult.rows, {
      network,
      decimals,
      rounding,
      mergeDuplicates,
    });

    set({
      validatedRows: validationResult.rows,
      validationSummary: validationResult.summary,
      mergeResult: validationResult.mergeResult ?? null,
    });
  },

  // ---------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------

  exportInvalidCsv: () => {
    const { validatedRows } = get();
    return exportInvalidRowsCsv(validatedRows);
  },

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------

  goToStep: (step: CsvWorkflowStep) => {
    set({ step, error: null });
  },

  reset: () => {
    set(initialState);
  },
}));
