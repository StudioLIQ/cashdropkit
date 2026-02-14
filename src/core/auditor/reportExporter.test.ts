/**
 * Report Exporter Tests
 */
import { describe, expect, it } from 'vitest';

import type { AirdropCampaign, RecipientRow } from '@/core/db/types';

import {
  buildReportMetadata,
  buildReportRows,
  exportCsv,
  exportJson,
  exportReport,
  exportTxids,
  extractUniqueTxids,
} from './reportExporter';

// ============================================================================
// Helpers
// ============================================================================

function createRecipient(overrides: Partial<RecipientRow> = {}): RecipientRow {
  return {
    id: 'r-1',
    address: 'bchtest:qtest1',
    amountBase: '1000',
    valid: true,
    status: 'CONFIRMED',
    ...overrides,
  };
}

function createCampaign(recipients: RecipientRow[] = []): AirdropCampaign {
  return {
    id: 'campaign-1',
    name: 'Test Airdrop',
    createdAt: 1700000000000,
    updatedAt: 1700001000000,
    network: 'testnet',
    token: { tokenId: 'f'.repeat(64), symbol: 'TEST', decimals: 8 },
    mode: 'FT',
    amountUnit: 'base',
    recipients,
    settings: {
      feeRateSatPerByte: 1,
      dustSatPerOutput: 546,
      maxOutputsPerTx: 80,
      maxInputsPerTx: 20,
      allowMergeDuplicates: false,
      rounding: 'floor',
    },
    funding: {
      sourceWalletId: 'w1',
      tokenUtxoSelection: 'auto',
      bchUtxoSelection: 'auto',
    },
    plan: {
      generatedAt: 1700000500000,
      totalRecipients: recipients.length,
      totalTokenAmountBase: '10000',
      estimated: {
        txCount: 1,
        totalFeeSat: '200',
        totalDustSat: '546',
        requiredBchSat: '746',
      },
      batches: [
        {
          id: 'batch-1',
          recipients: recipients.map((r) => r.id),
          estimatedFeeSat: '200',
          estimatedSizeBytes: 200,
          tokenInputs: [],
          bchInputs: [],
          outputsCount: recipients.length + 2,
          txid: 'txid-abc123',
        },
      ],
    },
    execution: {
      state: 'COMPLETED',
      currentBatchIndex: 1,
      broadcast: { adapterName: 'mock', startedAt: 1700000600000 },
      failures: { batchFailures: [], recipientFailures: [] },
      confirmations: {},
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('reportExporter', () => {
  describe('buildReportRows', () => {
    it('should map recipients to report rows', () => {
      const recipients = [
        createRecipient({
          id: 'r1',
          address: 'addr1',
          amountBase: '500',
          status: 'CONFIRMED',
          txid: 'tx1',
        }),
        createRecipient({
          id: 'r2',
          address: 'addr2',
          amountBase: '300',
          status: 'FAILED',
          error: 'broadcast error',
        }),
      ];

      const rows = buildReportRows(recipients);

      expect(rows).toHaveLength(2);
      expect(rows[0].address).toBe('addr1');
      expect(rows[0].amountBase).toBe('500');
      expect(rows[0].status).toBe('CONFIRMED');
      expect(rows[0].txid).toBe('tx1');
      expect(rows[1].error).toBe('broadcast error');
    });

    it('should default empty fields to empty string', () => {
      const recipients = [createRecipient({ txid: undefined, error: undefined, memo: undefined })];
      const rows = buildReportRows(recipients);

      expect(rows[0].txid).toBe('');
      expect(rows[0].error).toBe('');
      expect(rows[0].memo).toBe('');
    });
  });

  describe('extractUniqueTxids', () => {
    it('should extract txids from batches', () => {
      const campaign = createCampaign([createRecipient({ txid: 'txid-abc123' })]);

      const txids = extractUniqueTxids(campaign);

      expect(txids).toContain('txid-abc123');
    });

    it('should deduplicate txids from batches and recipients', () => {
      const campaign = createCampaign([
        createRecipient({ id: 'r1', txid: 'txid-abc123' }),
        createRecipient({ id: 'r2', txid: 'txid-abc123' }),
        createRecipient({ id: 'r3', txid: 'txid-def456' }),
      ]);
      campaign.plan!.batches.push({
        id: 'batch-2',
        recipients: ['r3'],
        estimatedFeeSat: '200',
        estimatedSizeBytes: 200,
        tokenInputs: [],
        bchInputs: [],
        outputsCount: 3,
        txid: 'txid-def456',
      });

      const txids = extractUniqueTxids(campaign);

      expect(txids).toHaveLength(2);
      expect(txids).toContain('txid-abc123');
      expect(txids).toContain('txid-def456');
    });

    it('should return sorted txids', () => {
      const campaign = createCampaign([
        createRecipient({ id: 'r1', txid: 'zzz' }),
        createRecipient({ id: 'r2', txid: 'aaa' }),
        createRecipient({ id: 'r3', txid: 'mmm' }),
      ]);

      const txids = extractUniqueTxids(campaign);

      expect(txids).toEqual(['aaa', 'mmm', 'txid-abc123', 'zzz']);
    });

    it('should handle campaign with no plan', () => {
      const campaign = createCampaign([]);
      campaign.plan = undefined;

      const txids = extractUniqueTxids(campaign);

      expect(txids).toHaveLength(0);
    });
  });

  describe('buildReportMetadata', () => {
    it('should build metadata with correct stats', () => {
      const recipients = [
        createRecipient({ id: 'r1', status: 'CONFIRMED' }),
        createRecipient({ id: 'r2', status: 'SENT' }),
        createRecipient({ id: 'r3', status: 'FAILED' }),
        createRecipient({ id: 'r4', status: 'SKIPPED' }),
      ];
      const campaign = createCampaign(recipients);

      const metadata = buildReportMetadata(campaign);

      expect(metadata.campaignId).toBe('campaign-1');
      expect(metadata.campaignName).toBe('Test Airdrop');
      expect(metadata.network).toBe('testnet');
      expect(metadata.tokenSymbol).toBe('TEST');
      expect(metadata.totalRecipients).toBe(4);
      expect(metadata.stats.confirmed).toBe(1);
      expect(metadata.stats.sent).toBe(1);
      expect(metadata.stats.failed).toBe(1);
      expect(metadata.stats.skipped).toBe(1);
      expect(metadata.executionState).toBe('COMPLETED');
    });

    it('should handle missing execution state', () => {
      const campaign = createCampaign([]);
      campaign.execution = undefined;

      const metadata = buildReportMetadata(campaign);

      expect(metadata.executionState).toBe('NOT_STARTED');
    });
  });

  describe('exportCsv', () => {
    it('should produce valid CSV with header', () => {
      const recipients = [
        createRecipient({
          id: 'r1',
          address: 'addr1',
          amountBase: '500',
          status: 'CONFIRMED',
          txid: 'tx1',
        }),
      ];
      const campaign = createCampaign(recipients);
      const result = exportCsv(campaign);

      expect(result.format).toBe('csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toMatch(/\.csv$/);

      const lines = result.content.trim().split('\n');
      expect(lines[0]).toBe('address,amount_base,status,txid,batch_id,error,memo');
      expect(lines[1]).toContain('addr1');
      expect(lines[1]).toContain('500');
      expect(lines[1]).toContain('CONFIRMED');
      expect(lines[1]).toContain('tx1');
    });

    it('should escape fields with commas', () => {
      const recipients = [createRecipient({ error: 'error, with comma', address: 'addr1' })];
      const campaign = createCampaign(recipients);
      const result = exportCsv(campaign);

      expect(result.content).toContain('"error, with comma"');
    });

    it('should escape fields with quotes', () => {
      const recipients = [createRecipient({ error: 'error "quoted"', address: 'addr1' })];
      const campaign = createCampaign(recipients);
      const result = exportCsv(campaign);

      expect(result.content).toContain('"error ""quoted"""');
    });

    it('should include all recipients', () => {
      const recipients = [
        createRecipient({ id: 'r1', address: 'addr1' }),
        createRecipient({ id: 'r2', address: 'addr2' }),
        createRecipient({ id: 'r3', address: 'addr3' }),
      ];
      const campaign = createCampaign(recipients);
      const result = exportCsv(campaign);

      const lines = result.content.trim().split('\n');
      expect(lines).toHaveLength(4); // header + 3 rows
    });
  });

  describe('exportJson', () => {
    it('should produce valid JSON', () => {
      const recipients = [createRecipient({ id: 'r1', address: 'addr1', txid: 'tx1' })];
      const campaign = createCampaign(recipients);
      const result = exportJson(campaign);

      expect(result.format).toBe('json');
      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toMatch(/\.json$/);

      const parsed = JSON.parse(result.content);
      expect(parsed.version).toBe('1.0');
      expect(parsed.metadata.campaignId).toBe('campaign-1');
      expect(parsed.recipients).toHaveLength(1);
      expect(parsed.txids).toContain('tx1');
    });

    it('should include metadata stats', () => {
      const recipients = [
        createRecipient({ id: 'r1', status: 'CONFIRMED' }),
        createRecipient({ id: 'r2', status: 'FAILED' }),
      ];
      const campaign = createCampaign(recipients);
      const result = exportJson(campaign);
      const parsed = JSON.parse(result.content);

      expect(parsed.metadata.stats.confirmed).toBe(1);
      expect(parsed.metadata.stats.failed).toBe(1);
    });

    it('should include txids array', () => {
      const recipients = [
        createRecipient({ id: 'r1', txid: 'txid-1' }),
        createRecipient({ id: 'r2', txid: 'txid-2' }),
      ];
      const campaign = createCampaign(recipients);
      const result = exportJson(campaign);
      const parsed = JSON.parse(result.content);

      expect(parsed.txids).toContain('txid-1');
      expect(parsed.txids).toContain('txid-2');
    });
  });

  describe('exportTxids', () => {
    it('should produce plain text txids list', () => {
      const recipients = [
        createRecipient({ id: 'r1', txid: 'txid-abc' }),
        createRecipient({ id: 'r2', txid: 'txid-def' }),
      ];
      const campaign = createCampaign(recipients);
      const result = exportTxids(campaign);

      expect(result.format).toBe('txids');
      expect(result.mimeType).toBe('text/plain');
      expect(result.filename).toMatch(/\.txt$/);

      const lines = result.content.trim().split('\n');
      expect(lines).toContain('txid-abc');
      expect(lines).toContain('txid-def');
    });

    it('should return empty content for no txids', () => {
      const campaign = createCampaign([]);
      campaign.plan = undefined;
      const result = exportTxids(campaign);

      expect(result.content).toBe('');
    });

    it('should deduplicate txids', () => {
      const recipients = [
        createRecipient({ id: 'r1', txid: 'same-txid' }),
        createRecipient({ id: 'r2', txid: 'same-txid' }),
      ];
      const campaign = createCampaign(recipients);
      const result = exportTxids(campaign);

      const lines = result.content.trim().split('\n');
      const sameTxidCount = lines.filter((l) => l === 'same-txid').length;
      expect(sameTxidCount).toBe(1);
    });
  });

  describe('exportReport', () => {
    it('should dispatch to correct format', () => {
      const campaign = createCampaign([createRecipient()]);

      expect(exportReport(campaign, 'csv').format).toBe('csv');
      expect(exportReport(campaign, 'json').format).toBe('json');
      expect(exportReport(campaign, 'txids').format).toBe('txids');
    });
  });

  describe('filename sanitization', () => {
    it('should sanitize campaign name in filename', () => {
      const campaign = createCampaign([]);
      campaign.name = 'My Campaign / Special <chars>';

      const result = exportCsv(campaign);
      expect(result.filename).not.toContain('/');
      expect(result.filename).not.toContain('<');
      expect(result.filename).not.toContain('>');
    });

    it('should truncate long names', () => {
      const campaign = createCampaign([]);
      campaign.name = 'a'.repeat(200);

      const result = exportCsv(campaign);
      // filename should be reasonable length
      expect(result.filename.length).toBeLessThan(100);
    });
  });
});
