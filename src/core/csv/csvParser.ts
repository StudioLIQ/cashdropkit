/**
 * CSV Parser
 *
 * Parses CSV files, maps columns, validates recipients, and handles duplicate merging.
 */
import { validateAddress, validateAmount } from '../util/validate';
import type {
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

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse a CSV string into raw rows
 */
export function parseCsv(csvContent: string): CsvParseResult {
  if (!csvContent || !csvContent.trim()) {
    return {
      success: false,
      error: 'CSV content is empty',
      headers: [],
      rows: [],
      rowCount: 0,
      columnCount: 0,
    };
  }

  try {
    // Normalize line endings
    const normalized = csvContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');

    // Filter out empty lines at the end
    while (lines.length > 0 && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    if (lines.length === 0) {
      return {
        success: false,
        error: 'CSV contains no data rows',
        headers: [],
        rows: [],
        rowCount: 0,
        columnCount: 0,
      };
    }

    // Parse header
    const headerLine = lines[0];
    const headers = parseRow(headerLine);

    if (headers.length === 0) {
      return {
        success: false,
        error: 'CSV header row is empty',
        headers: [],
        rows: [],
        rowCount: 0,
        columnCount: 0,
      };
    }

    // Parse data rows
    const rows: CsvRawRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue; // Skip empty lines

      const values = parseRow(line);
      rows.push({
        lineNumber: i + 1, // 1-indexed, accounting for header
        values,
      });
    }

    if (rows.length === 0) {
      return {
        success: false,
        error: 'CSV contains no data rows (only header)',
        headers,
        rows: [],
        rowCount: 0,
        columnCount: headers.length,
      };
    }

    return {
      success: true,
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse CSV: ${err instanceof Error ? err.message : 'Unknown error'}`,
      headers: [],
      rows: [],
      rowCount: 0,
      columnCount: 0,
    };
  }
}

/**
 * Parse a single CSV row, handling quoted fields
 */
function parseRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ',') {
        // Field separator
        result.push(current.trim());
        current = '';
        i++;
        continue;
      }
      current += char;
      i++;
    }
  }

  // Add the last field
  result.push(current.trim());

  return result;
}

// ============================================================================
// Column Detection
// ============================================================================

/**
 * Common header patterns for address columns
 */
const ADDRESS_PATTERNS = [
  /^address$/i,
  /^addr$/i,
  /^wallet$/i,
  /^recipient$/i,
  /^to$/i,
  /^destination$/i,
  /^cashaddr$/i,
  /^bch.?address$/i,
];

/**
 * Common header patterns for amount columns
 */
const AMOUNT_PATTERNS = [
  /^amount$/i,
  /^amt$/i,
  /^quantity$/i,
  /^qty$/i,
  /^value$/i,
  /^tokens?$/i,
  /^balance$/i,
];

/**
 * Common header patterns for memo columns
 */
const MEMO_PATTERNS = [/^memo$/i, /^note$/i, /^notes$/i, /^comment$/i, /^description$/i, /^desc$/i];

/**
 * Suggest column mapping based on header analysis
 */
export function suggestColumnMapping(headers: string[]): ColumnSuggestion {
  let addressColumn = -1;
  let amountColumn = -1;
  let memoColumn: number | undefined;
  let confidence = 0;
  const reasons: string[] = [];

  // Try to match patterns
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim();

    if (addressColumn === -1) {
      for (const pattern of ADDRESS_PATTERNS) {
        if (pattern.test(header)) {
          addressColumn = i;
          confidence += 0.4;
          reasons.push(`Header "${header}" matches address pattern`);
          break;
        }
      }
    }

    if (amountColumn === -1) {
      for (const pattern of AMOUNT_PATTERNS) {
        if (pattern.test(header)) {
          amountColumn = i;
          confidence += 0.4;
          reasons.push(`Header "${header}" matches amount pattern`);
          break;
        }
      }
    }

    if (memoColumn === undefined) {
      for (const pattern of MEMO_PATTERNS) {
        if (pattern.test(header)) {
          memoColumn = i;
          confidence += 0.1;
          reasons.push(`Header "${header}" matches memo pattern`);
          break;
        }
      }
    }
  }

  // Fallback: if headers don't match, use position-based heuristics
  if (addressColumn === -1 && headers.length >= 1) {
    addressColumn = 0;
    reasons.push('Defaulting to column 0 for address');
  }

  if (amountColumn === -1 && headers.length >= 2) {
    // Use the second column, or third if second is memo-like
    amountColumn = addressColumn === 0 ? 1 : 0;
    reasons.push(`Defaulting to column ${amountColumn} for amount`);
  }

  // Ensure we have both required columns
  if (addressColumn === -1 || amountColumn === -1) {
    return {
      mapping: { addressColumn: 0, amountColumn: 1 },
      confidence: 0,
      reasoning: 'Could not detect column mapping',
    };
  }

  return {
    mapping: {
      addressColumn,
      amountColumn,
      memoColumn,
    },
    confidence: Math.min(confidence, 1),
    reasoning: reasons.join('; '),
  };
}

// ============================================================================
// Column Mapping
// ============================================================================

/**
 * Apply column mapping to raw CSV rows
 */
export function applyColumnMapping(rows: CsvRawRow[], mapping: ColumnMapping): MappingResult {
  // Validate mapping
  if (mapping.addressColumn < 0) {
    return {
      success: false,
      error: 'Address column index must be >= 0',
      rows: [],
      mapping,
    };
  }

  if (mapping.amountColumn < 0) {
    return {
      success: false,
      error: 'Amount column index must be >= 0',
      rows: [],
      mapping,
    };
  }

  if (mapping.addressColumn === mapping.amountColumn) {
    return {
      success: false,
      error: 'Address and amount columns cannot be the same',
      rows: [],
      mapping,
    };
  }

  const parsedRows: ParsedRecipientRow[] = [];

  for (const row of rows) {
    const rawAddress = row.values[mapping.addressColumn] ?? '';
    const rawAmount = row.values[mapping.amountColumn] ?? '';
    const memo = mapping.memoColumn !== undefined ? row.values[mapping.memoColumn] : undefined;

    parsedRows.push({
      id: `row-${row.lineNumber}`,
      lineNumber: row.lineNumber,
      rawAddress,
      rawAmount,
      memo,
    });
  }

  return {
    success: true,
    rows: parsedRows,
    mapping,
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate parsed recipient rows
 */
export function validateRecipients(
  rows: ParsedRecipientRow[],
  options: ValidationOptions
): ValidationResult {
  const validatedRows: ValidatedRecipientRow[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let totalAmountBase = 0n;
  let addressErrors = 0;
  let amountErrors = 0;
  const addressCounts = new Map<string, number>();

  // Validate each row
  for (const row of rows) {
    const errors: string[] = [];
    let normalizedAddress: string | undefined;
    let amountBase: bigint | undefined;

    // Validate address
    const addressResult = validateAddress(row.rawAddress, options.network);
    if (!addressResult.valid) {
      errors.push(addressResult.errorMessage ?? 'Invalid address');
      addressErrors++;
    } else {
      normalizedAddress = addressResult.normalized;
      // Count address occurrences
      const count = addressCounts.get(normalizedAddress!) ?? 0;
      addressCounts.set(normalizedAddress!, count + 1);
    }

    // Validate amount
    const amountResult = validateAmount(row.rawAmount, options.decimals, {
      rounding: options.rounding,
    });
    if (!amountResult.valid) {
      errors.push(amountResult.errorMessage ?? 'Invalid amount');
      amountErrors++;
    } else {
      amountBase = amountResult.amountBase;
    }

    const isValid = errors.length === 0;
    if (isValid) {
      validCount++;
      totalAmountBase += amountBase!;
    } else {
      invalidCount++;
    }

    validatedRows.push({
      id: row.id,
      lineNumber: row.lineNumber,
      normalizedAddress,
      amountBase,
      rawAddress: row.rawAddress,
      rawAmount: row.rawAmount,
      memo: row.memo,
      valid: isValid,
      errors,
    });
  }

  // Count duplicates
  let duplicateAddressCount = 0;
  for (const count of addressCounts.values()) {
    if (count > 1) {
      duplicateAddressCount += count - 1;
    }
  }

  const summary: ValidationSummary = {
    totalRows: rows.length,
    validRows: validCount,
    invalidRows: invalidCount,
    totalAmountBase,
    duplicateAddressCount,
    uniqueAddressCount: addressCounts.size,
    errorBreakdown: {
      addressErrors,
      amountErrors,
    },
  };

  // Handle duplicate merging if requested
  if (options.mergeDuplicates) {
    const mergeResult = mergeDuplicates(validatedRows);
    return {
      rows: mergeResult.rows,
      summary: {
        ...summary,
        totalRows: mergeResult.mergedCount,
        validRows: mergeResult.rows.filter((r) => r.valid).length,
      },
      mergeResult,
    };
  }

  return {
    rows: validatedRows,
    summary,
  };
}

// ============================================================================
// Duplicate Merging
// ============================================================================

/**
 * Merge duplicate addresses by summing amounts
 */
export function mergeDuplicates(rows: ValidatedRecipientRow[]): MergeResult {
  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  // Group by normalized address
  const addressGroups = new Map<string, ValidatedRecipientRow[]>();
  for (const row of validRows) {
    const address = row.normalizedAddress!;
    const group = addressGroups.get(address) ?? [];
    group.push(row);
    addressGroups.set(address, group);
  }

  const mergedRows: ValidatedRecipientRow[] = [];
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [address, group] of addressGroups) {
    if (group.length === 1) {
      // No duplicate, keep as-is
      mergedRows.push(group[0]);
    } else {
      // Merge duplicates
      const combinedAmountBase = group.reduce((sum, r) => sum + r.amountBase!, 0n);
      const mergedFromIds = group.map((r) => r.id);
      const mergedFromLines = group.map((r) => r.lineNumber);
      const combinedMemo =
        group
          .map((r) => r.memo)
          .filter((m): m is string => !!m)
          .join('; ') || undefined;

      // Create merged row with first row's ID
      mergedRows.push({
        id: `merged-${group[0].id}`,
        lineNumber: Math.min(...mergedFromLines),
        normalizedAddress: address,
        amountBase: combinedAmountBase,
        rawAddress: group[0].rawAddress,
        rawAmount: `(merged from ${group.length} rows)`,
        memo: combinedMemo,
        valid: true,
        errors: [],
      });

      duplicateGroups.push({
        address,
        mergedFromIds,
        mergedFromLines,
        combinedAmountBase,
        combinedMemo,
      });
    }
  }

  // Add back invalid rows (not merged)
  const allRows = [...mergedRows, ...invalidRows];

  return {
    rows: allRows,
    originalCount: rows.length,
    mergedCount: allRows.length,
    duplicateGroups,
  };
}

// ============================================================================
// Export Invalid Rows
// ============================================================================

/**
 * Export invalid rows with error details
 */
export function exportInvalidRows(rows: ValidatedRecipientRow[]): InvalidRowExport[] {
  return rows
    .filter((r) => !r.valid)
    .map((r) => ({
      lineNumber: r.lineNumber,
      rawAddress: r.rawAddress,
      rawAmount: r.rawAmount,
      memo: r.memo,
      errors: r.errors,
    }));
}

/**
 * Export invalid rows as CSV string
 */
export function exportInvalidRowsCsv(rows: ValidatedRecipientRow[]): string {
  const invalidRows = exportInvalidRows(rows);
  if (invalidRows.length === 0) {
    return '';
  }

  const lines: string[] = ['line_number,address,amount,memo,errors'];

  for (const row of invalidRows) {
    const escapedErrors = row.errors.join('; ').replace(/"/g, '""');
    const escapedMemo = (row.memo ?? '').replace(/"/g, '""');
    const escapedAddress = row.rawAddress.replace(/"/g, '""');
    const escapedAmount = row.rawAmount.replace(/"/g, '""');

    lines.push(
      `${row.lineNumber},"${escapedAddress}","${escapedAmount}","${escapedMemo}","${escapedErrors}"`
    );
  }

  return lines.join('\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a deterministic row ID from line number and address
 */
export function generateRowId(lineNumber: number, address?: string): string {
  if (address) {
    // Use address hash for stability across re-imports
    const hash = simpleHash(address);
    return `row-${lineNumber}-${hash}`;
  }
  return `row-${lineNumber}`;
}

/**
 * Simple hash function for deterministic IDs
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Full CSV processing pipeline
 */
export function processCsv(
  csvContent: string,
  mapping: ColumnMapping,
  options: ValidationOptions
): {
  parseResult: CsvParseResult;
  mappingResult?: MappingResult;
  validationResult?: ValidationResult;
} {
  // Step 1: Parse CSV
  const parseResult = parseCsv(csvContent);
  if (!parseResult.success) {
    return { parseResult };
  }

  // Step 2: Apply column mapping
  const mappingResult = applyColumnMapping(parseResult.rows, mapping);
  if (!mappingResult.success) {
    return { parseResult, mappingResult };
  }

  // Step 3: Validate recipients
  const validationResult = validateRecipients(mappingResult.rows, options);

  return { parseResult, mappingResult, validationResult };
}
