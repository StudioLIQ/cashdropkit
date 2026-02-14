/**
 * Demo Preset Tests
 */
import { describe, expect, it } from 'vitest';

import {
  DEMO_AIRDROP_SETTINGS,
  DEMO_VESTING_SETTINGS,
  generateDemoVestingSchedule,
  generateSampleCsv,
  getDemoPresetSummary,
} from './demoPreset';

describe('demoPreset', () => {
  describe('DEMO_AIRDROP_SETTINGS', () => {
    it('should have maxOutputsPerTx=10 for visible chunking', () => {
      expect(DEMO_AIRDROP_SETTINGS.maxOutputsPerTx).toBe(10);
    });

    it('should have floor rounding', () => {
      expect(DEMO_AIRDROP_SETTINGS.rounding).toBe('floor');
    });
  });

  describe('DEMO_VESTING_SETTINGS', () => {
    it('should use P2SH_CLTV_P2PKH', () => {
      expect(DEMO_VESTING_SETTINGS.lockScriptType).toBe('P2SH_CLTV_P2PKH');
    });
  });

  describe('generateSampleCsv', () => {
    it('should generate CSV with header', () => {
      const csv = generateSampleCsv();
      const lines = csv.trim().split('\n');
      expect(lines[0]).toBe('address,amount,memo');
    });

    it('should generate default 30 rows (27 valid + 3 invalid)', () => {
      const csv = generateSampleCsv();
      const lines = csv.trim().split('\n');
      // header + 27 valid + 3 invalid = 31
      expect(lines.length).toBe(31);
    });

    it('should include invalid rows with known patterns', () => {
      const csv = generateSampleCsv();
      expect(csv).toContain('not-a-valid-address');
      expect(csv).toContain('-100');
      expect(csv).toContain(',0,');
    });

    it('should generate without invalid rows when specified', () => {
      const csv = generateSampleCsv({ includeInvalid: false });
      expect(csv).not.toContain('not-a-valid-address');
      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(28); // header + 27
    });

    it('should respect validCount', () => {
      const csv = generateSampleCsv({ validCount: 5, includeInvalid: false });
      const lines = csv.trim().split('\n');
      expect(lines.length).toBe(6); // header + 5
    });

    it('should vary amounts by default', () => {
      const csv = generateSampleCsv({ validCount: 3, includeInvalid: false });
      const lines = csv.trim().split('\n');
      // First recipient: 1000, second: 1100, third: 1200
      expect(lines[1]).toContain(',1000,');
      expect(lines[2]).toContain(',1100,');
      expect(lines[3]).toContain(',1200,');
    });

    it('should use fixed amounts when varyAmounts=false', () => {
      const csv = generateSampleCsv({
        validCount: 3,
        includeInvalid: false,
        baseAmount: 500,
        varyAmounts: false,
      });
      const lines = csv.trim().split('\n');
      expect(lines[1]).toContain(',500,');
      expect(lines[2]).toContain(',500,');
      expect(lines[3]).toContain(',500,');
    });

    it('should include memo for each row', () => {
      const csv = generateSampleCsv({ validCount: 2, includeInvalid: false });
      expect(csv).toContain('recipient-1');
      expect(csv).toContain('recipient-2');
    });
  });

  describe('generateDemoVestingSchedule', () => {
    it('should generate default 2 tranches', () => {
      const times = generateDemoVestingSchedule();
      expect(times).toHaveLength(2);
    });

    it('should generate future timestamps', () => {
      const now = Math.floor(Date.now() / 1000);
      const times = generateDemoVestingSchedule();
      for (const t of times) {
        expect(t).toBeGreaterThan(now);
      }
    });

    it('should space tranches apart', () => {
      const times = generateDemoVestingSchedule({ trancheCount: 3 });
      expect(times).toHaveLength(3);
      expect(times[1]).toBeGreaterThan(times[0]);
      expect(times[2]).toBeGreaterThan(times[1]);
    });

    it('should respect custom tranche count', () => {
      const times = generateDemoVestingSchedule({ trancheCount: 5 });
      expect(times).toHaveLength(5);
    });
  });

  describe('getDemoPresetSummary', () => {
    it('should return summary with label', () => {
      const summary = getDemoPresetSummary();
      expect(summary.label).toBeDefined();
      expect(summary.items.length).toBeGreaterThan(0);
    });

    it('should mention 10 max outputs', () => {
      const summary = getDemoPresetSummary();
      const maxOutputItem = summary.items.find((i) => i.key === 'Max outputs/tx');
      expect(maxOutputItem?.value).toContain('10');
    });
  });
});
