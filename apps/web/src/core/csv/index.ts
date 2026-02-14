/**
 * CSV Module Exports
 */

// Types
export type {
  ColumnMapping,
  ColumnSuggestion,
  CsvParseResult,
  CsvRawRow,
  DuplicateGroup,
  InvalidRowExport,
  MappingResult,
  MergeResult,
  ParsedRecipientRow,
  ValidatedRecipientRow,
  ValidationOptions,
  ValidationResult,
  ValidationSummary,
} from './types';

// Parser functions
export {
  applyColumnMapping,
  exportInvalidRows,
  exportInvalidRowsCsv,
  generateRowId,
  mergeDuplicates,
  parseCsv,
  processCsv,
  suggestColumnMapping,
  validateRecipients,
} from './csvParser';
