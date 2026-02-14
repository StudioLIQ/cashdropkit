/**
 * Error Templates Tests
 */
import { describe, expect, it } from 'vitest';

import {
  bchShortfall,
  broadcastFailed,
  broadcastSuccess,
  connectionDegraded,
  connectionOffline,
  connectionRestored,
  csvInvalidAddress,
  csvInvalidAmount,
  csvNetworkMismatch,
  executionCompleted,
  executionFailed,
  executionPaused,
  noBchUtxos,
  noTokenUtxos,
  tokenNotFound,
  tokenShortfall,
  tooFragmented,
  trancheLocked,
  txDroppedSuspected,
  txInMempool,
  unlockSuccess,
} from './errorTemplates';

describe('errorTemplates', () => {
  describe('token errors', () => {
    it('tokenShortfall includes required/available/missing', () => {
      const msg = tokenShortfall(1000n, 500n);
      expect(msg.severity).toBe('error');
      expect(msg.detail).toContain('1000');
      expect(msg.detail).toContain('500');
      expect(msg.detail).toContain('500'); // missing
    });

    it('tokenNotFound shows truncated tokenId', () => {
      const msg = tokenNotFound('a'.repeat(64));
      expect(msg.severity).toBe('warning');
      expect(msg.detail).toContain('aaaaaaaaaaaa...');
    });
  });

  describe('BCH errors', () => {
    it('bchShortfall includes sat values', () => {
      const msg = bchShortfall(10000n, 5000n);
      expect(msg.severity).toBe('error');
      expect(msg.detail).toContain('10000');
      expect(msg.detail).toContain('5000');
    });
  });

  describe('UTXO errors', () => {
    it('noTokenUtxos returns error', () => {
      expect(noTokenUtxos().severity).toBe('error');
    });

    it('noBchUtxos returns error', () => {
      expect(noBchUtxos().severity).toBe('error');
    });

    it('tooFragmented shows counts', () => {
      const msg = tooFragmented(200, 50);
      expect(msg.detail).toContain('200');
      expect(msg.detail).toContain('50');
    });
  });

  describe('CSV errors', () => {
    it('csvInvalidAddress shows line number', () => {
      const msg = csvInvalidAddress(5, 'bchtest:invalid', 'bad checksum');
      expect(msg.title).toContain('line 5');
      expect(msg.detail).toContain('bad checksum');
    });

    it('csvInvalidAmount shows line number', () => {
      const msg = csvInvalidAmount(10, 'negative value');
      expect(msg.title).toContain('line 10');
    });

    it('csvNetworkMismatch shows expected vs got', () => {
      const msg = csvNetworkMismatch(3, 'testnet', 'mainnet');
      expect(msg.detail).toContain('testnet');
      expect(msg.detail).toContain('mainnet');
    });
  });

  describe('broadcast', () => {
    it('broadcastFailed shows batch and error', () => {
      const msg = broadcastFailed('batch-1234-abcd', 'mempool full');
      expect(msg.severity).toBe('error');
      expect(msg.title).toContain('batch-12');
      expect(msg.detail).toContain('mempool full');
    });

    it('broadcastSuccess shows txid', () => {
      const msg = broadcastSuccess('abc123');
      expect(msg.severity).toBe('success');
      expect(msg.detail).toContain('abc123');
    });
  });

  describe('confirmations', () => {
    it('txInMempool shows confirmation count', () => {
      const msg = txInMempool('a'.repeat(64), 0);
      expect(msg.severity).toBe('info');
      expect(msg.title).toContain('0 conf');
    });

    it('txDroppedSuspected shows elapsed time', () => {
      const msg = txDroppedSuspected('a'.repeat(64), 35);
      expect(msg.severity).toBe('warning');
      expect(msg.detail).toContain('35 minutes');
    });
  });

  describe('connection', () => {
    it('connectionOffline shows adapter name', () => {
      const msg = connectionOffline('Electrum');
      expect(msg.severity).toBe('error');
      expect(msg.detail).toContain('Electrum');
    });

    it('connectionDegraded shows failure count', () => {
      const msg = connectionDegraded(3);
      expect(msg.detail).toContain('3');
    });

    it('connectionRestored is success', () => {
      expect(connectionRestored().severity).toBe('success');
    });
  });

  describe('vesting', () => {
    it('trancheLocked shows date', () => {
      const msg = trancheLocked(new Date('2025-06-01'));
      expect(msg.severity).toBe('warning');
      expect(msg.detail).toBeDefined();
    });

    it('unlockSuccess shows txid', () => {
      const msg = unlockSuccess('txid123');
      expect(msg.severity).toBe('success');
      expect(msg.detail).toContain('txid123');
    });
  });

  describe('execution', () => {
    it('executionPaused shows progress', () => {
      const msg = executionPaused(3, 10);
      expect(msg.severity).toBe('info');
      expect(msg.detail).toContain('3');
      expect(msg.detail).toContain('10');
    });

    it('executionCompleted shows totals', () => {
      const msg = executionCompleted(5, 100);
      expect(msg.severity).toBe('success');
      expect(msg.detail).toContain('5');
      expect(msg.detail).toContain('100');
    });

    it('executionFailed shows batch and error', () => {
      const msg = executionFailed('batch-fail-1234', 'timeout');
      expect(msg.severity).toBe('error');
      expect(msg.title).toContain('batch-fa');
      expect(msg.detail).toContain('timeout');
    });
  });
});
