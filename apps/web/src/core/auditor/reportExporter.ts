/**
 * Report Exporter
 *
 * Generates exportable reports from airdrop campaigns in multiple formats:
 * - CSV: address, amount, status, txid, error, memo
 * - JSON: full campaign snapshot with metadata
 * - txids.txt: plain list of unique txids
 *
 * All exports include address↔amount↔status↔txid mapping.
 */
import type { AirdropCampaign, RecipientRow } from '@/core/db/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json' | 'txids';

/**
 * Report row for export
 */
export interface ReportRow {
  address: string;
  amountBase: string;
  status: string;
  txid: string;
  batchId: string;
  error: string;
  memo: string;
}

/**
 * Report metadata for JSON export
 */
export interface ReportMetadata {
  campaignId: string;
  campaignName: string;
  network: string;
  tokenId: string;
  tokenSymbol: string;
  tokenDecimals: number | undefined;
  exportedAt: string;
  executionState: string;
  totalRecipients: number;
  stats: {
    sent: number;
    confirmed: number;
    failed: number;
    skipped: number;
    pending: number;
    planned: number;
  };
  batches: {
    total: number;
    completed: number;
    failed: number;
  };
}

/**
 * Full JSON export structure
 */
export interface JsonReport {
  version: '1.0';
  metadata: ReportMetadata;
  recipients: ReportRow[];
  txids: string[];
}

/**
 * Export result
 */
export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  format: ExportFormat;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Escape a CSV field (double-quote if contains comma, newline, or quote)
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Build report rows from campaign recipients
 */
export function buildReportRows(recipients: RecipientRow[]): ReportRow[] {
  return recipients.map((r) => ({
    address: r.address,
    amountBase: r.amountBase,
    status: r.status,
    txid: r.txid || '',
    batchId: r.batchId || '',
    error: r.error || '',
    memo: r.memo || '',
  }));
}

/**
 * Extract unique txids from campaign
 */
export function extractUniqueTxids(campaign: AirdropCampaign): string[] {
  const txidSet = new Set<string>();

  // From batches
  if (campaign.plan) {
    for (const batch of campaign.plan.batches) {
      if (batch.txid) {
        txidSet.add(batch.txid);
      }
    }
  }

  // From recipients (in case of any mismatch)
  for (const r of campaign.recipients) {
    if (r.txid) {
      txidSet.add(r.txid);
    }
  }

  return Array.from(txidSet).sort();
}

/**
 * Build report metadata
 */
export function buildReportMetadata(campaign: AirdropCampaign): ReportMetadata {
  const recipients = campaign.recipients;

  const stats = {
    sent: recipients.filter((r) => r.status === 'SENT').length,
    confirmed: recipients.filter((r) => r.status === 'CONFIRMED').length,
    failed: recipients.filter((r) => r.status === 'FAILED').length,
    skipped: recipients.filter((r) => r.status === 'SKIPPED').length,
    pending: recipients.filter((r) => r.status === 'PENDING').length,
    planned: recipients.filter((r) => r.status === 'PLANNED').length,
  };

  const plan = campaign.plan;
  const batchStats = {
    total: plan?.batches.length ?? 0,
    completed: plan?.batches.filter((b) => b.txid).length ?? 0,
    failed: campaign.execution?.failures.batchFailures.length ?? 0,
  };

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    network: campaign.network,
    tokenId: campaign.token.tokenId,
    tokenSymbol: campaign.token.symbol || '',
    tokenDecimals: campaign.token.decimals,
    exportedAt: new Date().toISOString(),
    executionState: campaign.execution?.state || 'NOT_STARTED',
    totalRecipients: recipients.length,
    stats,
    batches: batchStats,
  };
}

// ============================================================================
// Exporters
// ============================================================================

/**
 * Export campaign report as CSV
 */
export function exportCsv(campaign: AirdropCampaign): ExportResult {
  const rows = buildReportRows(campaign.recipients);

  const header = ['address', 'amount_base', 'status', 'txid', 'batch_id', 'error', 'memo'];
  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.address),
        escapeCsvField(row.amountBase),
        escapeCsvField(row.status),
        escapeCsvField(row.txid),
        escapeCsvField(row.batchId),
        escapeCsvField(row.error),
        escapeCsvField(row.memo),
      ].join(',')
    );
  }

  const safeName = campaign.name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    content: lines.join('\n') + '\n',
    filename: `${safeName}_report_${timestamp}.csv`,
    mimeType: 'text/csv',
    format: 'csv',
  };
}

/**
 * Export campaign report as JSON
 */
export function exportJson(campaign: AirdropCampaign): ExportResult {
  const report: JsonReport = {
    version: '1.0',
    metadata: buildReportMetadata(campaign),
    recipients: buildReportRows(campaign.recipients),
    txids: extractUniqueTxids(campaign),
  };

  const safeName = campaign.name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    content: JSON.stringify(report, null, 2),
    filename: `${safeName}_report_${timestamp}.json`,
    mimeType: 'application/json',
    format: 'json',
  };
}

/**
 * Export unique txids as plain text
 */
export function exportTxids(campaign: AirdropCampaign): ExportResult {
  const txids = extractUniqueTxids(campaign);

  const safeName = campaign.name.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 50);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  return {
    content: txids.join('\n') + (txids.length > 0 ? '\n' : ''),
    filename: `${safeName}_txids_${timestamp}.txt`,
    mimeType: 'text/plain',
    format: 'txids',
  };
}

/**
 * Export campaign report in the specified format
 */
export function exportReport(campaign: AirdropCampaign, format: ExportFormat): ExportResult {
  switch (format) {
    case 'csv':
      return exportCsv(campaign);
    case 'json':
      return exportJson(campaign);
    case 'txids':
      return exportTxids(campaign);
  }
}

/**
 * Trigger browser download for an export result
 */
export function downloadExport(result: ExportResult): void {
  const blob = new Blob([result.content], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
