/**
 * CSV Parser Tests
 */
import { describe, expect, it } from 'vitest';

import { encodeCashAddr } from '../wallet/cashaddr';
import {
  applyColumnMapping,
  exportInvalidRows,
  exportInvalidRowsCsv,
  mergeDuplicates,
  parseCsv,
  processCsv,
  suggestColumnMapping,
  validateRecipients,
} from './csvParser';
import type { ParsedRecipientRow, ValidatedRecipientRow } from './types';

// Generate valid test addresses
function makeTestAddress(network: 'mainnet' | 'testnet', index: number = 0): string {
  const hash = new Uint8Array([
    0x12 + index,
    0x34,
    0x56,
    0x78,
    0x9a,
    0xbc,
    0xde,
    0xf0,
    0x12,
    0x34,
    0x56,
    0x78,
    0x9a,
    0xbc,
    0xde,
    0xf0,
    0x12,
    0x34,
    0x56,
    0x78,
  ]);
  return encodeCashAddr(network, 'P2PKH', hash);
}

const MAINNET_ADDRESS = makeTestAddress('mainnet', 0);
const MAINNET_ADDRESS_2 = makeTestAddress('mainnet', 1);
const TESTNET_ADDRESS = makeTestAddress('testnet', 0);

// ============================================================================
// parseCsv Tests
// ============================================================================

describe('parseCsv', () => {
  it('should parse simple CSV with header', () => {
    const csv = `address,amount,memo
bitcoincash:qzl2y7h6lx0rkn3kqpgv4gy8kj5w0jqpqczrl3svnc,100,test
bitcoincash:qrpfqlkv8qwsqkr4g9k9r5glgqf5yg8x5cvfqjvh8z,200,`;

    const result = parseCsv(csv);

    expect(result.success).toBe(true);
    expect(result.headers).toEqual(['address', 'amount', 'memo']);
    expect(result.rowCount).toBe(2);
    expect(result.columnCount).toBe(3);
    expect(result.rows[0].lineNumber).toBe(2);
    expect(result.rows[0].values[0]).toBe('bitcoincash:qzl2y7h6lx0rkn3kqpgv4gy8kj5w0jqpqczrl3svnc');
    expect(result.rows[0].values[1]).toBe('100');
    expect(result.rows[0].values[2]).toBe('test');
  });

  it('should handle quoted fields with commas', () => {
    const csv = `address,amount,memo
"addr1",100,"Hello, World"`;

    const result = parseCsv(csv);

    expect(result.success).toBe(true);
    expect(result.rows[0].values[2]).toBe('Hello, World');
  });

  it('should handle escaped quotes in quoted fields', () => {
    const csv = `address,amount,memo
"addr1",100,"He said ""hello"""`;

    const result = parseCsv(csv);

    expect(result.success).toBe(true);
    expect(result.rows[0].values[2]).toBe('He said "hello"');
  });

  it('should handle different line endings', () => {
    const csvCRLF = 'address,amount\r\naddr1,100\r\naddr2,200';
    const csvCR = 'address,amount\raddr1,100\raddr2,200';
    const csvLF = 'address,amount\naddr1,100\naddr2,200';

    expect(parseCsv(csvCRLF).rowCount).toBe(2);
    expect(parseCsv(csvCR).rowCount).toBe(2);
    expect(parseCsv(csvLF).rowCount).toBe(2);
  });

  it('should skip empty lines', () => {
    const csv = `address,amount

addr1,100

addr2,200

`;

    const result = parseCsv(csv);

    expect(result.success).toBe(true);
    expect(result.rowCount).toBe(2);
  });

  it('should return error for empty content', () => {
    expect(parseCsv('').success).toBe(false);
    expect(parseCsv('   ').success).toBe(false);
    expect(parseCsv('\n\n').success).toBe(false);
  });

  it('should return error for header-only CSV', () => {
    const csv = 'address,amount,memo';
    const result = parseCsv(csv);

    expect(result.success).toBe(false);
    expect(result.error).toContain('no data rows');
  });
});

// ============================================================================
// suggestColumnMapping Tests
// ============================================================================

describe('suggestColumnMapping', () => {
  it('should detect common header patterns', () => {
    const headers = ['address', 'amount', 'memo'];
    const result = suggestColumnMapping(headers);

    expect(result.mapping.addressColumn).toBe(0);
    expect(result.mapping.amountColumn).toBe(1);
    expect(result.mapping.memoColumn).toBe(2);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should detect alternative header patterns', () => {
    const headers = ['wallet', 'qty', 'notes'];
    const result = suggestColumnMapping(headers);

    expect(result.mapping.addressColumn).toBe(0);
    expect(result.mapping.amountColumn).toBe(1);
    expect(result.mapping.memoColumn).toBe(2);
  });

  it('should detect case-insensitive patterns', () => {
    const headers = ['ADDRESS', 'AMOUNT', 'MEMO'];
    const result = suggestColumnMapping(headers);

    expect(result.mapping.addressColumn).toBe(0);
    expect(result.mapping.amountColumn).toBe(1);
    expect(result.mapping.memoColumn).toBe(2);
  });

  it('should handle columns in different order', () => {
    const headers = ['memo', 'amount', 'address'];
    const result = suggestColumnMapping(headers);

    expect(result.mapping.addressColumn).toBe(2);
    expect(result.mapping.amountColumn).toBe(1);
    expect(result.mapping.memoColumn).toBe(0);
  });

  it('should fall back to position-based detection', () => {
    const headers = ['col1', 'col2', 'col3'];
    const result = suggestColumnMapping(headers);

    expect(result.mapping.addressColumn).toBe(0);
    expect(result.mapping.amountColumn).toBe(1);
    expect(result.confidence).toBeLessThan(0.5);
  });
});

// ============================================================================
// applyColumnMapping Tests
// ============================================================================

describe('applyColumnMapping', () => {
  const rows = [
    { lineNumber: 2, values: ['addr1', '100', 'memo1'] },
    { lineNumber: 3, values: ['addr2', '200', 'memo2'] },
  ];

  it('should map columns correctly', () => {
    const result = applyColumnMapping(rows, {
      addressColumn: 0,
      amountColumn: 1,
      memoColumn: 2,
    });

    expect(result.success).toBe(true);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].rawAddress).toBe('addr1');
    expect(result.rows[0].rawAmount).toBe('100');
    expect(result.rows[0].memo).toBe('memo1');
    expect(result.rows[0].lineNumber).toBe(2);
    expect(result.rows[0].id).toBe('row-2');
  });

  it('should work without memo column', () => {
    const result = applyColumnMapping(rows, {
      addressColumn: 0,
      amountColumn: 1,
    });

    expect(result.success).toBe(true);
    expect(result.rows[0].memo).toBeUndefined();
  });

  it('should handle swapped columns', () => {
    const result = applyColumnMapping(rows, {
      addressColumn: 1,
      amountColumn: 0,
    });

    expect(result.success).toBe(true);
    expect(result.rows[0].rawAddress).toBe('100');
    expect(result.rows[0].rawAmount).toBe('addr1');
  });

  it('should reject negative column indices', () => {
    const result1 = applyColumnMapping(rows, { addressColumn: -1, amountColumn: 1 });
    const result2 = applyColumnMapping(rows, { addressColumn: 0, amountColumn: -1 });

    expect(result1.success).toBe(false);
    expect(result2.success).toBe(false);
  });

  it('should reject same column for address and amount', () => {
    const result = applyColumnMapping(rows, { addressColumn: 0, amountColumn: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('cannot be the same');
  });

  it('should handle missing columns gracefully', () => {
    const shortRows = [{ lineNumber: 2, values: ['addr1'] }];
    const result = applyColumnMapping(shortRows, {
      addressColumn: 0,
      amountColumn: 1,
    });

    expect(result.success).toBe(true);
    expect(result.rows[0].rawAddress).toBe('addr1');
    expect(result.rows[0].rawAmount).toBe('');
  });
});

// ============================================================================
// validateRecipients Tests
// ============================================================================

describe('validateRecipients', () => {
  it('should validate valid recipients', () => {
    const rows: ParsedRecipientRow[] = [
      { id: 'row-1', lineNumber: 2, rawAddress: MAINNET_ADDRESS, rawAmount: '100' },
      { id: 'row-2', lineNumber: 3, rawAddress: MAINNET_ADDRESS, rawAmount: '200.5' },
    ];

    const result = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 8,
    });

    expect(result.summary.totalRows).toBe(2);
    expect(result.summary.validRows).toBe(2);
    expect(result.summary.invalidRows).toBe(0);
    expect(result.summary.totalAmountBase).toBe(30050000000n);
  });

  it('should detect invalid addresses', () => {
    const rows: ParsedRecipientRow[] = [
      { id: 'row-1', lineNumber: 2, rawAddress: 'invalid-address', rawAmount: '100' },
      { id: 'row-2', lineNumber: 3, rawAddress: '', rawAmount: '100' },
    ];

    const result = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 8,
    });

    expect(result.summary.validRows).toBe(0);
    expect(result.summary.invalidRows).toBe(2);
    expect(result.summary.errorBreakdown.addressErrors).toBe(2);
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
  });

  it('should detect network mismatch', () => {
    const rows: ParsedRecipientRow[] = [
      { id: 'row-1', lineNumber: 2, rawAddress: TESTNET_ADDRESS, rawAmount: '100' },
    ];

    const result = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 8,
    });

    expect(result.summary.validRows).toBe(0);
    expect(result.rows[0].errors[0]).toContain('testnet');
  });

  it('should detect invalid amounts', () => {
    const rows: ParsedRecipientRow[] = [
      { id: 'row-1', lineNumber: 2, rawAddress: MAINNET_ADDRESS, rawAmount: 'abc' },
      { id: 'row-2', lineNumber: 3, rawAddress: MAINNET_ADDRESS, rawAmount: '-100' },
      { id: 'row-3', lineNumber: 4, rawAddress: MAINNET_ADDRESS, rawAmount: '0' },
      { id: 'row-4', lineNumber: 5, rawAddress: MAINNET_ADDRESS, rawAmount: '' },
    ];

    const result = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 8,
    });

    expect(result.summary.validRows).toBe(0);
    expect(result.summary.errorBreakdown.amountErrors).toBe(4);
  });

  it('should count duplicate addresses', () => {
    const rows: ParsedRecipientRow[] = [
      { id: 'row-1', lineNumber: 2, rawAddress: MAINNET_ADDRESS, rawAmount: '100' },
      { id: 'row-2', lineNumber: 3, rawAddress: MAINNET_ADDRESS, rawAmount: '200' },
      { id: 'row-3', lineNumber: 4, rawAddress: MAINNET_ADDRESS, rawAmount: '300' },
    ];

    const result = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 8,
    });

    expect(result.summary.duplicateAddressCount).toBe(2); // 3 occurrences - 1
    expect(result.summary.uniqueAddressCount).toBe(1);
  });

  it('should apply rounding modes correctly', () => {
    const rows: ParsedRecipientRow[] = [
      { id: 'row-1', lineNumber: 2, rawAddress: MAINNET_ADDRESS, rawAmount: '1.555' },
    ];

    const floorResult = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 2,
      rounding: 'floor',
    });
    const ceilResult = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 2,
      rounding: 'ceil',
    });
    const roundResult = validateRecipients(rows, {
      network: 'mainnet',
      decimals: 2,
      rounding: 'round',
    });

    expect(floorResult.rows[0].amountBase).toBe(155n);
    expect(ceilResult.rows[0].amountBase).toBe(156n);
    expect(roundResult.rows[0].amountBase).toBe(156n);
  });
});

// ============================================================================
// mergeDuplicates Tests
// ============================================================================

describe('mergeDuplicates', () => {
  it('should merge duplicate addresses by summing amounts', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        normalizedAddress: MAINNET_ADDRESS,
        amountBase: 100n,
        rawAddress: MAINNET_ADDRESS,
        rawAmount: '100',
        valid: true,
        errors: [],
      },
      {
        id: 'row-2',
        lineNumber: 3,
        normalizedAddress: MAINNET_ADDRESS,
        amountBase: 200n,
        rawAddress: MAINNET_ADDRESS,
        rawAmount: '200',
        valid: true,
        errors: [],
      },
    ];

    const result = mergeDuplicates(rows);

    expect(result.mergedCount).toBe(1);
    expect(result.originalCount).toBe(2);
    expect(result.rows[0].amountBase).toBe(300n);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.duplicateGroups[0].mergedFromLines).toEqual([2, 3]);
  });

  it('should not merge non-duplicate addresses', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        normalizedAddress: MAINNET_ADDRESS,
        amountBase: 100n,
        rawAddress: MAINNET_ADDRESS,
        rawAmount: '100',
        valid: true,
        errors: [],
      },
      {
        id: 'row-2',
        lineNumber: 3,
        normalizedAddress: MAINNET_ADDRESS_2,
        amountBase: 200n,
        rawAddress: MAINNET_ADDRESS_2,
        rawAmount: '200',
        valid: true,
        errors: [],
      },
    ];

    const result = mergeDuplicates(rows);

    expect(result.mergedCount).toBe(2);
    expect(result.duplicateGroups).toHaveLength(0);
  });

  it('should combine memos when merging', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        normalizedAddress: MAINNET_ADDRESS,
        amountBase: 100n,
        rawAddress: MAINNET_ADDRESS,
        rawAmount: '100',
        memo: 'memo1',
        valid: true,
        errors: [],
      },
      {
        id: 'row-2',
        lineNumber: 3,
        normalizedAddress: MAINNET_ADDRESS,
        amountBase: 200n,
        rawAddress: MAINNET_ADDRESS,
        rawAmount: '200',
        memo: 'memo2',
        valid: true,
        errors: [],
      },
    ];

    const result = mergeDuplicates(rows);

    expect(result.rows[0].memo).toBe('memo1; memo2');
    expect(result.duplicateGroups[0].combinedMemo).toBe('memo1; memo2');
  });

  it('should keep invalid rows separate', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        normalizedAddress: MAINNET_ADDRESS,
        amountBase: 100n,
        rawAddress: MAINNET_ADDRESS,
        rawAmount: '100',
        valid: true,
        errors: [],
      },
      {
        id: 'row-2',
        lineNumber: 3,
        rawAddress: 'invalid',
        rawAmount: '200',
        valid: false,
        errors: ['Invalid address'],
      },
    ];

    const result = mergeDuplicates(rows);

    expect(result.mergedCount).toBe(2);
    expect(result.rows.filter((r) => r.valid)).toHaveLength(1);
    expect(result.rows.filter((r) => !r.valid)).toHaveLength(1);
  });
});

// ============================================================================
// exportInvalidRows Tests
// ============================================================================

describe('exportInvalidRows', () => {
  it('should export only invalid rows', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        normalizedAddress: 'addr1',
        amountBase: 100n,
        rawAddress: 'addr1',
        rawAmount: '100',
        valid: true,
        errors: [],
      },
      {
        id: 'row-2',
        lineNumber: 3,
        rawAddress: 'invalid',
        rawAmount: 'abc',
        valid: false,
        errors: ['Invalid address', 'Invalid amount'],
      },
    ];

    const result = exportInvalidRows(rows);

    expect(result).toHaveLength(1);
    expect(result[0].lineNumber).toBe(3);
    expect(result[0].errors).toEqual(['Invalid address', 'Invalid amount']);
  });

  it('should generate valid CSV export', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        rawAddress: 'invalid,addr',
        rawAmount: 'abc',
        memo: 'test "memo"',
        valid: false,
        errors: ['Error 1', 'Error 2'],
      },
    ];

    const csv = exportInvalidRowsCsv(rows);

    expect(csv).toContain('line_number,address,amount,memo,errors');
    expect(csv).toContain('2');
    expect(csv).toContain('"invalid,addr"');
    expect(csv).toContain('"test ""memo"""');
    expect(csv).toContain('Error 1; Error 2');
  });

  it('should return empty string for no invalid rows', () => {
    const rows: ValidatedRecipientRow[] = [
      {
        id: 'row-1',
        lineNumber: 2,
        normalizedAddress: 'addr1',
        amountBase: 100n,
        rawAddress: 'addr1',
        rawAmount: '100',
        valid: true,
        errors: [],
      },
    ];

    expect(exportInvalidRowsCsv(rows)).toBe('');
  });
});

// ============================================================================
// processCsv Integration Tests
// ============================================================================

describe('processCsv', () => {
  it('should process complete CSV pipeline', () => {
    const csv = `address,amount,memo
${MAINNET_ADDRESS},100,test1
${MAINNET_ADDRESS},200,test2`;

    const result = processCsv(
      csv,
      { addressColumn: 0, amountColumn: 1, memoColumn: 2 },
      { network: 'mainnet', decimals: 8 }
    );

    expect(result.parseResult.success).toBe(true);
    expect(result.mappingResult?.success).toBe(true);
    expect(result.validationResult?.summary.validRows).toBe(2);
    expect(result.validationResult?.summary.totalAmountBase).toBe(30000000000n);
  });

  it('should handle merge duplicates option', () => {
    const csv = `address,amount
${MAINNET_ADDRESS},100
${MAINNET_ADDRESS},200`;

    const result = processCsv(
      csv,
      { addressColumn: 0, amountColumn: 1 },
      { network: 'mainnet', decimals: 8, mergeDuplicates: true }
    );

    expect(result.validationResult?.summary.totalRows).toBe(1);
    expect(result.validationResult?.rows[0].amountBase).toBe(30000000000n);
    expect(result.validationResult?.mergeResult?.duplicateGroups).toHaveLength(1);
  });

  it('should stop early on parse failure', () => {
    const result = processCsv(
      '',
      { addressColumn: 0, amountColumn: 1 },
      { network: 'mainnet', decimals: 8 }
    );

    expect(result.parseResult.success).toBe(false);
    expect(result.mappingResult).toBeUndefined();
    expect(result.validationResult).toBeUndefined();
  });

  it('should handle mixed valid and invalid rows', () => {
    const csv = `address,amount
${MAINNET_ADDRESS},100
invalid-address,200
${MAINNET_ADDRESS},abc`;

    const result = processCsv(
      csv,
      { addressColumn: 0, amountColumn: 1 },
      { network: 'mainnet', decimals: 8 }
    );

    expect(result.validationResult?.summary.validRows).toBe(1);
    expect(result.validationResult?.summary.invalidRows).toBe(2);
    expect(result.validationResult?.summary.errorBreakdown.addressErrors).toBe(1);
    expect(result.validationResult?.summary.errorBreakdown.amountErrors).toBe(1);
  });
});
