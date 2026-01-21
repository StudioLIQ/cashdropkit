/**
 * CSV Parser Types
 *
 * Types for CSV import, column mapping, validation, and duplicate handling.
 */
import type { Network } from '../db/types';

// ============================================================================
// CSV Parsing Types
// ============================================================================

/**
 * A raw row from CSV parsing (before validation)
 */
export interface CsvRawRow {
  /** Original line number in the CSV file (1-indexed) */
  lineNumber: number;
  /** Raw field values by column index */
  values: string[];
}

/**
 * Column mapping configuration
 */
export interface ColumnMapping {
  /** Index of the column containing addresses (required) */
  addressColumn: number;
  /** Index of the column containing amounts (required) */
  amountColumn: number;
  /** Index of the column containing memos (optional) */
  memoColumn?: number;
}

/**
 * A parsed recipient row (after column mapping but before validation)
 */
export interface ParsedRecipientRow {
  /** Stable row ID based on line number */
  id: string;
  /** Original line number in the CSV */
  lineNumber: number;
  /** Raw address value from CSV */
  rawAddress: string;
  /** Raw amount value from CSV */
  rawAmount: string;
  /** Optional memo */
  memo?: string;
}

/**
 * A validated recipient row
 */
export interface ValidatedRecipientRow {
  /** Stable row ID */
  id: string;
  /** Original line number */
  lineNumber: number;
  /** Normalized address (if valid) */
  normalizedAddress?: string;
  /** Parsed amount in base units (if valid) */
  amountBase?: bigint;
  /** Original raw address */
  rawAddress: string;
  /** Original raw amount */
  rawAmount: string;
  /** Optional memo */
  memo?: string;
  /** Whether the row is valid */
  valid: boolean;
  /** Validation errors (empty array if valid) */
  errors: string[];
}

// ============================================================================
// Duplicate Handling Types
// ============================================================================

/**
 * Duplicate group after merge
 */
export interface DuplicateGroup {
  /** Normalized address (the key for grouping) */
  address: string;
  /** Original row IDs that were merged */
  mergedFromIds: string[];
  /** Original line numbers that were merged */
  mergedFromLines: number[];
  /** Combined amount (sum of all duplicates) */
  combinedAmountBase: bigint;
  /** Combined memo (joined with semicolons) */
  combinedMemo?: string;
}

/**
 * Result of duplicate merge operation
 */
export interface MergeResult {
  /** Rows after merge (duplicates combined) */
  rows: ValidatedRecipientRow[];
  /** Number of original rows before merge */
  originalCount: number;
  /** Number of rows after merge */
  mergedCount: number;
  /** Details of which rows were merged */
  duplicateGroups: DuplicateGroup[];
}

// ============================================================================
// Parse Result Types
// ============================================================================

/**
 * Result of CSV file parsing (step 1: raw parsing)
 */
export interface CsvParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Error message if parsing failed */
  error?: string;
  /** Detected headers (first row) */
  headers: string[];
  /** Raw rows (excluding header) */
  rows: CsvRawRow[];
  /** Total number of data rows */
  rowCount: number;
  /** Detected column count */
  columnCount: number;
}

/**
 * Result of column mapping (step 2: applying mapping)
 */
export interface MappingResult {
  /** Whether mapping was successful */
  success: boolean;
  /** Error message if mapping failed */
  error?: string;
  /** Mapped rows */
  rows: ParsedRecipientRow[];
  /** The mapping that was applied */
  mapping: ColumnMapping;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Expected network for address validation */
  network: Network;
  /** Token decimals for amount parsing */
  decimals: number;
  /** Rounding mode for amounts */
  rounding?: 'floor' | 'round' | 'ceil';
  /** Whether to merge duplicate addresses */
  mergeDuplicates?: boolean;
}

/**
 * Result of validation (step 3: validating rows)
 */
export interface ValidationResult {
  /** All validated rows (including invalid) */
  rows: ValidatedRecipientRow[];
  /** Summary statistics */
  summary: ValidationSummary;
  /** If duplicates were merged, the merge result */
  mergeResult?: MergeResult;
}

/**
 * Validation summary statistics
 */
export interface ValidationSummary {
  /** Total number of rows processed */
  totalRows: number;
  /** Number of valid rows */
  validRows: number;
  /** Number of invalid rows */
  invalidRows: number;
  /** Total amount across all valid rows (in base units) */
  totalAmountBase: bigint;
  /** Number of duplicate addresses found (before merge) */
  duplicateAddressCount: number;
  /** Number of unique addresses */
  uniqueAddressCount: number;
  /** Breakdown of errors by type */
  errorBreakdown: {
    addressErrors: number;
    amountErrors: number;
  };
}

/**
 * Invalid row export format
 */
export interface InvalidRowExport {
  lineNumber: number;
  rawAddress: string;
  rawAmount: string;
  memo?: string;
  errors: string[];
}

// ============================================================================
// Column Detection Types
// ============================================================================

/**
 * Suggested column mapping based on header analysis
 */
export interface ColumnSuggestion {
  /** Suggested mapping */
  mapping: ColumnMapping;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reasoning for the suggestion */
  reasoning: string;
}
