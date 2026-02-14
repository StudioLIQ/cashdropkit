/**
 * Demo Preset
 *
 * Generates sample CSV data and provides demo configuration
 * for quick, repeatable demonstrations.
 */

// ============================================================================
// Demo Campaign Settings
// ============================================================================

export const DEMO_AIRDROP_SETTINGS = {
  feeRateSatPerByte: 1,
  dustSatPerOutput: 800,
  maxOutputsPerTx: 10, // Force visible chunking
  maxInputsPerTx: 20,
  allowMergeDuplicates: true,
  rounding: 'floor' as const,
};

export const DEMO_VESTING_SETTINGS = {
  feeRateSatPerByte: 1,
  dustSatPerOutput: 800,
  lockScriptType: 'P2SH_CLTV_P2PKH' as const,
};

// ============================================================================
// Sample Addresses (testnet)
// ============================================================================

const TESTNET_ADDRESSES = [
  'bchtest:qzy6hn00qy352euf40x77qfrg4ncn27dauus22msdc',
  'bchtest:qr9sj7u3gj5m2xqsv8v6lg9kkrhtdvnfchj8g35n0',
  'bchtest:qq28cqs6dx23qh4qucnk9v89a3kvv60yg5azrh8maw',
  'bchtest:qp2nfx7elxyxs5fre5e8j5g3cxgwh5y0y5kqnudctf',
  'bchtest:qz5w0jdw4p3e34f67vhlm85n89mxcepfcgwsjef8fp',
  'bchtest:qrwgl0mzpumq3xvyqk7wt3eqqxqp7lk5qs7r4vk3z',
  'bchtest:qq0yqp94hx5kq8yv2xj6l3kpjnr4v36ngyw2aez4f',
  'bchtest:qzgz6p5kz3sjd7v9v0t7fy8a3dxzqpxlc5xlm49rg',
  'bchtest:qr0yqnxz2x43e7hf3l8v3m4klkp5e8hfgsu3kfzjn',
  'bchtest:qqvktp9z7ck32jrz9rj60l8sx5q23kj9mgvfxe97hq',
  'bchtest:qz6l3n8p5mxy2j4kh9s3w7dqrg8f42txqschqnaw0',
  'bchtest:qpjfgr8q2vxylm5z3a7e6t9hn0kdc4wspcsytmg6e7',
  'bchtest:qqf8hg7x6j3d2m9kv5nrw4sp0lqz7c8yeskmutj0a',
  'bchtest:qrk5jt3x4y2m6lz8e9v7wd0fhn3pqsg4ckf62rs5a',
  'bchtest:qz3m8k5r9xqtj2ly6fw7ehdn40vpscgaukpzyx37r',
  'bchtest:qpv4n6s8rz7qx3jk2yg5wfhm0dtl9ecwascn4v68e',
  'bchtest:qq9fj5k7y3m28d6rv4lxs0hntpwqg7za3ef8rkmu5c',
  'bchtest:qr8gk6l4z5n7jm2xd3v9ywfht0qs6pe4bcrjnxq8a',
  'bchtest:qz2r7m9k6d5x3l4yj8vnefhw0tgspqc8aukfzyx5s',
  'bchtest:qp5hg3n7r8kxq6j4yd2v9wmfl0estca4bgcnvkx3d',
  'bchtest:qq7sk4m2y6r3x8jl5dv0nwfhg9tpqe4c3ascnuk78',
  'bchtest:qr4fn6k8z2m5lx3jy9d7vhwg0teqs4pb3ckf6rv5a',
  'bchtest:qz0gj7m3r5n8kx4yl2dv6ehwf9tspqca8bkpzux3d',
  'bchtest:qp3hf8n2r6kxq7jl4yd5v0wmeg9tsca4bgcnvkx7d',
  'bchtest:qq6sk9m4y3r2x5jl8dv7nwfhg0tpqe4c3ascnuk3a',
  'bchtest:qr1fn3k5z8m9lx6jy2d4vhwg7teqs4pb3ckf6rv8d',
  'bchtest:qz9gj4m6r2n5kx7yl3dv8ehwf0tspqca8bkpzux6s',
  'bchtest:qp6hf2n9r3kxq4jl7yd8v5wmeg0tsca4bgcnvkx2e',
  'bchtest:qq3sk6m7y9r5x2jl4dv0nwfhg3tpqe4c3ascnuk6s',
  'bchtest:qr7fn9k2z5m3lx8jy6d7vhwg4teqs4pb3ckf6rv2a',
];

// ============================================================================
// CSV Generation
// ============================================================================

/**
 * Generate a sample airdrop CSV with configurable parameters.
 * Includes 3 intentionally invalid rows for testing validation.
 */
export function generateSampleCsv(options?: {
  /** Number of valid recipients (default 27) */
  validCount?: number;
  /** Include invalid rows (default true) */
  includeInvalid?: boolean;
  /** Base token amount per recipient (default 1000) */
  baseAmount?: number;
  /** Vary amounts (default true) */
  varyAmounts?: boolean;
}): string {
  const {
    validCount = 27,
    includeInvalid = true,
    baseAmount = 1000,
    varyAmounts = true,
  } = options ?? {};

  const lines: string[] = ['address,amount,memo'];

  // Valid rows
  for (let i = 0; i < validCount && i < TESTNET_ADDRESSES.length; i++) {
    const amount = varyAmounts ? baseAmount + i * 100 : baseAmount;
    const memo = `recipient-${i + 1}`;
    lines.push(`${TESTNET_ADDRESSES[i]},${amount},${memo}`);
  }

  // Invalid rows (3 intentionally broken)
  if (includeInvalid) {
    lines.push('not-a-valid-address,500,invalid-address-test');
    lines.push(`${TESTNET_ADDRESSES[0]},-100,negative-amount-test`);
    lines.push(',0,empty-address-and-zero-amount');
  }

  return lines.join('\n') + '\n';
}

/**
 * Generate vesting unlock times for demo.
 * Returns unlock times relative to now (in unix seconds).
 */
export function generateDemoVestingSchedule(options?: {
  /** Number of tranches (default 2) */
  trancheCount?: number;
  /** Minutes between first tranche and now (default 2) */
  firstTrancheMinutes?: number;
  /** Minutes between tranches (default 3) */
  intervalMinutes?: number;
}): number[] {
  const { trancheCount = 2, firstTrancheMinutes = 2, intervalMinutes = 3 } = options ?? {};

  const now = Math.floor(Date.now() / 1000);
  const times: number[] = [];

  for (let i = 0; i < trancheCount; i++) {
    times.push(now + (firstTrancheMinutes + i * intervalMinutes) * 60);
  }

  return times;
}

/**
 * Download a string as a file in the browser.
 */
export function downloadAsFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Demo preset summary for display in UI.
 */
export function getDemoPresetSummary(): {
  label: string;
  items: { key: string; value: string }[];
} {
  return {
    label: 'Demo Preset Configuration',
    items: [
      { key: 'Recipients', value: '30 (27 valid + 3 invalid)' },
      { key: 'Max outputs/tx', value: '10 (forces 3+ batches)' },
      { key: 'Fee rate', value: '1 sat/byte' },
      { key: 'Dust', value: '800 sats/output' },
      { key: 'Vesting', value: '2 tranches, 2-5 min apart' },
      { key: 'Network', value: 'Testnet' },
    ],
  };
}
