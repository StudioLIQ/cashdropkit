'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ModalLayer } from '@/ui/components/common/ModalLayer';

import { isPaytacaExtensionInstalled } from './paytacaDirect';

const PAYTACA_EXTENSION_ID = 'pakphhpnneopheifihmjcjnbdbhaaiaa';

// ---------------------------------------------------------------------------
// Minimal QR Code generator (no external dependency)
// Implements QR Code Model 2, error correction level L, numeric/byte modes.
// Only supports short-to-medium payloads (WalletConnect URIs ~200-600 chars).
// ---------------------------------------------------------------------------

function generateQrDataUrl(text: string, size: number = 256): string {
  // Use a canvas to render QR from the browser's built-in encoding
  // Fallback: encode as a simple "copy URI" placeholder if QR gen fails.
  try {
    const modules = encodeQr(text);
    const moduleCount = modules.length;
    const cellSize = Math.floor(size / moduleCount);
    const actualSize = cellSize * moduleCount;

    const canvas = document.createElement('canvas');
    canvas.width = actualSize;
    canvas.height = actualSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, actualSize, actualSize);

    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (modules[row][col]) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

// Minimal QR encoder — supports byte mode, ECC level L, versions 1–40.
// Adapted from public-domain QR reference implementations.

function encodeQr(text: string): boolean[][] {
  const data = new TextEncoder().encode(text);
  const version = pickVersion(data.length);
  const size = version * 4 + 17;

  // Build data codewords
  const totalCodewords = TOTAL_CODEWORDS[version];
  const ecCodewords = EC_CODEWORDS_L[version];
  const dataCodewords = totalCodewords - ecCodewords;

  const bits: number[] = [];
  // Mode indicator: byte = 0100
  pushBits(bits, 0b0100, 4);
  // Character count
  const ccBits = version <= 9 ? 8 : 16;
  pushBits(bits, data.length, ccBits);
  // Data
  for (const byte of data) {
    pushBits(bits, byte, 8);
  }
  // Terminator
  const dataBitCapacity = dataCodewords * 8;
  const terminatorLen = Math.min(4, dataBitCapacity - bits.length);
  pushBits(bits, 0, terminatorLen);
  // Byte-align
  while (bits.length % 8 !== 0) bits.push(0);
  // Pad codewords
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < dataBitCapacity) {
    pushBits(bits, padBytes[padIdx % 2], 8);
    padIdx++;
  }

  const dataBytes = bitsToBytes(bits);
  const blocks = splitBlocks(dataBytes, version);
  const ecBytes = blocks.map((b) => reedSolomon(b, ecCodewords / blocks.length));

  // Interleave
  const interleaved: number[] = [];
  const maxDataBlock = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDataBlock; i++) {
    for (const block of blocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }
  const maxEcBlock = Math.max(...ecBytes.map((b) => b.length));
  for (let i = 0; i < maxEcBlock; i++) {
    for (const ec of ecBytes) {
      if (i < ec.length) interleaved.push(ec[i]);
    }
  }

  // Place modules
  const grid: (boolean | null)[][] = Array.from(
    { length: size },
    () => Array(size).fill(null) as (boolean | null)[]
  );
  const reserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  placeFinders(grid, reserved, size);
  placeAlignments(grid, reserved, version, size);
  placeTiming(grid, reserved, size);
  // Dark module
  grid[version * 4 + 9][8] = true;
  reserved[version * 4 + 9][8] = true;
  reserveFormatArea(reserved, size);
  if (version >= 7) reserveVersionArea(reserved, size);

  placeData(grid, reserved, interleaved, size);

  // Masking — try all 8 masks, pick lowest penalty
  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = applyMask(grid, reserved, size, mask);
    const p = penalty(candidate, size);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
    }
  }

  const final = applyMask(grid, reserved, size, bestMask);
  writeFormatBits(final, bestMask, size);
  if (version >= 7) writeVersionBits(final, version, size);

  return final.map((row) => row.map((cell) => cell === true));
}

function pushBits(arr: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i--) {
    arr.push((value >>> i) & 1);
  }
}

function bitsToBytes(bits: number[]): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] || 0);
    bytes.push(byte);
  }
  return bytes;
}

// Version selection for byte mode, ECC L
const CAPACITY_L = [
  0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858,
  929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431,
  2563, 2699, 2809, 2953,
];

function pickVersion(dataLen: number): number {
  for (let v = 1; v <= 40; v++) {
    if (CAPACITY_L[v] >= dataLen) return v;
  }
  throw new Error('Data too long for QR code');
}

// Total codewords per version
const TOTAL_CODEWORDS: number[] = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991,
  1085, 1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876,
  3034, 3196, 3362, 3532, 3706,
];

// EC codewords for level L per version
const EC_CODEWORDS_L: number[] = [
  0, 7, 10, 15, 20, 26, 36, 40, 48, 60, 72, 80, 96, 104, 120, 132, 144, 168, 180, 196, 224, 224,
  252, 270, 300, 312, 336, 360, 390, 420, 450, 480, 510, 540, 570, 570, 600, 630, 660, 720, 750,
];

// Block structure for level L
function splitBlocks(data: number[], version: number): number[][] {
  const total = TOTAL_CODEWORDS[version];
  const ec = EC_CODEWORDS_L[version];
  const dataCount = total - ec;
  const ecPerBlock = EC_PER_BLOCK_L[version];
  const numBlocks = ec / ecPerBlock;
  const shortBlockLen = Math.floor(dataCount / numBlocks);
  const longBlocks = dataCount % numBlocks;
  const shortBlocks = numBlocks - longBlocks;

  const blocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < shortBlocks; i++) {
    blocks.push(data.slice(offset, offset + shortBlockLen));
    offset += shortBlockLen;
  }
  for (let i = 0; i < longBlocks; i++) {
    blocks.push(data.slice(offset, offset + shortBlockLen + 1));
    offset += shortBlockLen + 1;
  }
  return blocks;
}

const EC_PER_BLOCK_L: number[] = [
  0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30,
  26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
];

// GF(256) Reed-Solomon
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x = x << 1;
    if (x >= 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function reedSolomon(data: number[], ecCount: number): number[] {
  // Build generator polynomial
  let gen = [1];
  for (let i = 0; i < ecCount; i++) {
    const newGen = new Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      newGen[j] ^= gen[j];
      newGen[j + 1] ^= gfMul(gen[j], GF_EXP[i]);
    }
    gen = newGen;
  }

  const result = new Array(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let j = 0; j < ecCount; j++) {
      result[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return result;
}

// Finder patterns
function placeFinders(grid: (boolean | null)[][], reserved: boolean[][], size: number) {
  const positions = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [r, c] of positions) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const row = r + dr;
        const col = c + dc;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        reserved[row][col] = true;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        grid[row][col] = inOuter ? inInner || onBorder : false;
      }
    }
  }
}

// Alignment patterns
const ALIGNMENT_POSITIONS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

function placeAlignments(
  grid: (boolean | null)[][],
  reserved: boolean[][],
  version: number,
  size: number
) {
  if (version < 2) return;
  const pos = ALIGNMENT_POSITIONS[version];
  for (const r of pos) {
    for (const c of pos) {
      // Skip if overlaps with finder
      if (reserved[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const row = r + dr;
          const col = c + dc;
          reserved[row][col] = true;
          grid[row][col] = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
        }
      }
    }
  }
}

function placeTiming(grid: (boolean | null)[][], reserved: boolean[][], size: number) {
  for (let i = 8; i < size - 8; i++) {
    if (!reserved[6][i]) {
      grid[6][i] = i % 2 === 0;
      reserved[6][i] = true;
    }
    if (!reserved[i][6]) {
      grid[i][6] = i % 2 === 0;
      reserved[i][6] = true;
    }
  }
}

function reserveFormatArea(reserved: boolean[][], size: number) {
  for (let i = 0; i < 8; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  reserved[8][8] = true;
}

function reserveVersionArea(reserved: boolean[][], size: number) {
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 3; j++) {
      reserved[i][size - 11 + j] = true;
      reserved[size - 11 + j][i] = true;
    }
  }
}

function placeData(
  grid: (boolean | null)[][],
  reserved: boolean[][],
  data: number[],
  size: number
) {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }

  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // Skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);
    for (const row of rows) {
      for (const col of [right, right - 1]) {
        if (!reserved[row][col]) {
          grid[row][col] = bitIdx < bits.length ? bits[bitIdx++] === 1 : false;
        }
      }
    }
    upward = !upward;
  }
}

function applyMask(
  grid: (boolean | null)[][],
  reserved: boolean[][],
  size: number,
  mask: number
): (boolean | null)[][] {
  const result = grid.map((row) => [...row]);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      let flip = false;
      switch (mask) {
        case 0:
          flip = (r + c) % 2 === 0;
          break;
        case 1:
          flip = r % 2 === 0;
          break;
        case 2:
          flip = c % 3 === 0;
          break;
        case 3:
          flip = (r + c) % 3 === 0;
          break;
        case 4:
          flip = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
          break;
        case 5:
          flip = ((r * c) % 2) + ((r * c) % 3) === 0;
          break;
        case 6:
          flip = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
          break;
        case 7:
          flip = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
          break;
      }
      if (flip) result[r][c] = !result[r][c];
    }
  }
  return result;
}

function penalty(grid: (boolean | null)[][], size: number): number {
  let score = 0;
  // Rule 1: runs of same color
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (grid[r][c] === grid[r][c - 1]) {
        run++;
      } else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (grid[r][c] === grid[r - 1][c]) {
        run++;
      } else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
  }
  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = grid[r][c];
      if (grid[r][c + 1] === val && grid[r + 1][c] === val && grid[r + 1][c + 1] === val) {
        score += 3;
      }
    }
  }
  return score;
}

const FORMAT_BITS_L: number[] = [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976];

function writeFormatBits(grid: (boolean | null)[][], mask: number, size: number) {
  const bits = FORMAT_BITS_L[mask];
  // Horizontal: row 8
  const hPositions = [
    0,
    1,
    2,
    3,
    4,
    5,
    7,
    8,
    size - 8,
    size - 7,
    size - 6,
    size - 5,
    size - 4,
    size - 3,
    size - 2,
    size - 1,
  ];
  for (let i = 0; i < 15; i++) {
    grid[8][hPositions[i]] = ((bits >> (14 - i)) & 1) === 1;
  }
  // Vertical: col 8
  const vPositions = [
    0,
    1,
    2,
    3,
    4,
    5,
    7,
    8,
    size - 7,
    size - 6,
    size - 5,
    size - 4,
    size - 3,
    size - 2,
    size - 1,
  ];
  // The vertical format info runs from bottom at positions listed
  const vMap = [
    size - 1,
    size - 2,
    size - 3,
    size - 4,
    size - 5,
    size - 6,
    size - 7,
    8,
    7,
    5,
    4,
    3,
    2,
    1,
    0,
  ];
  for (let i = 0; i < 15; i++) {
    grid[vMap[i]][8] = ((bits >> (14 - i)) & 1) === 1;
  }
}

function writeVersionBits(grid: (boolean | null)[][], version: number, size: number) {
  if (version < 7) return;
  const VERSION_INFO: number[] = [
    0, 0, 0, 0, 0, 0, 0, 0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x0e60d,
    0x0f928, 0x10b78, 0x1145d, 0x12a17, 0x13532, 0x149a6, 0x15683, 0x168c9, 0x177ec, 0x18ec4,
    0x191e1, 0x1afab, 0x1b08e, 0x1cc1a, 0x1d33f, 0x1ed75, 0x1f250, 0x209d5, 0x216f0, 0x228ba,
    0x2379f, 0x24b0b, 0x2542e, 0x26a64, 0x27541, 0x28c69,
  ];
  const info = VERSION_INFO[version];
  for (let i = 0; i < 18; i++) {
    const bit = ((info >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = (i % 3) + size - 11;
    grid[row][col] = bit;
    grid[col][row] = bit;
  }
}

// ---------------------------------------------------------------------------
// Modal bridge: imperative open/close ↔ React state
// ---------------------------------------------------------------------------

type ModalState = { isOpen: boolean; uri: string };
type ModalListener = (state: ModalState) => void;

let _listener: ModalListener | null = null;

export function emitModalState(state: ModalState) {
  _listener?.(state);
}

export function subscribeModal(listener: ModalListener): () => void {
  _listener = listener;
  return () => {
    if (_listener === listener) _listener = null;
  };
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export function PaytacaConnectModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [uri, setUri] = useState('');
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [extensionOpened, setExtensionOpened] = useState(false);
  const copiedTimer = useRef<number>(undefined);

  // Subscribe to imperative open/close calls
  useEffect(() => {
    return subscribeModal((state) => {
      setIsOpen(state.isOpen);
      setUri(state.uri);
      setCopied(false);
      setExtensionOpened(false);
      if (!state.isOpen) {
        setExtensionDetected(null);
        setQrDataUrl('');
      }
    });
  }, []);

  // Detect extension when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Reset detection state asynchronously to avoid synchronous setState in effect
    queueMicrotask(() => {
      if (!cancelled) setExtensionDetected(null);
    });
    isPaytacaExtensionInstalled(1500).then((detected) => {
      if (!cancelled) setExtensionDetected(detected);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Generate QR
  useEffect(() => {
    if (!isOpen || !uri) return;
    // Defer QR generation to next frame so the modal opens instantly
    const handle = requestAnimationFrame(() => {
      setQrDataUrl(generateQrDataUrl(uri, 280));
    });
    return () => cancelAnimationFrame(handle);
  }, [isOpen, uri]);

  const handleClose = useCallback(() => {
    emitModalState({ isOpen: false, uri: '' });
  }, []);

  const handleOpenExtension = useCallback(() => {
    if (!uri) return;
    // Copy URI to clipboard first so the user can paste manually if the
    // automatic deep-link handshake stalls.
    navigator.clipboard.writeText(uri).catch(() => {});
    const extensionUrl = `chrome-extension://${PAYTACA_EXTENSION_ID}/www/index.html#/apps/wallet-connect?uri=${encodeURIComponent(uri)}`;
    // Use an anchor click instead of window.open — Chrome routes
    // chrome-extension:// links more reliably through native navigation.
    const a = document.createElement('a');
    a.href = extensionUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    setExtensionOpened(true);
  }, [uri]);

  const handleCopyUri = useCallback(() => {
    if (!uri) return;
    navigator.clipboard.writeText(uri).then(() => {
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
    });
  }, [uri]);

  return (
    <ModalLayer isOpen={isOpen} onClose={handleClose} panelClassName="max-w-sm">
      <div className="flex flex-col items-center gap-5">
        {/* Header */}
        <div className="flex w-full items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Connect Wallet</h2>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Extension button — shown when extension is detected */}
        {extensionDetected !== false && (
          <div className="w-full">
            <button
              onClick={handleOpenExtension}
              disabled={extensionDetected === null}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-emerald-600 px-4 py-3.5 font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
            >
              {extensionDetected === null ? (
                <>
                  <Spinner />
                  <span>Detecting extension...</span>
                </>
              ) : (
                <>
                  <PaytacaIcon />
                  <span>Open Paytaca Extension</span>
                </>
              )}
            </button>
            {extensionOpened && (
              <p className="mt-2 text-center text-xs text-zinc-400">
                Approve the connection in the Paytaca extension.
                <br />
                URI has been copied to clipboard.
              </p>
            )}
          </div>
        )}

        {/* Copy URI button — always visible as a reliable fallback */}
        <button
          onClick={handleCopyUri}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
        >
          <ClipboardIcon />
          <span>{copied ? 'Copied!' : 'Copy WalletConnect URI'}</span>
        </button>

        {/* Divider */}
        <div className="flex w-full items-center gap-3">
          <div className="h-px flex-1 bg-zinc-700/60" />
          <span className="text-xs text-zinc-500">or scan QR</span>
          <div className="h-px flex-1 bg-zinc-700/60" />
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-3">
          {qrDataUrl ? (
            <button
              onClick={handleCopyUri}
              className="group relative overflow-hidden rounded-xl border border-zinc-700/60 bg-white p-3 transition hover:border-zinc-600"
              title="Click to copy URI"
            >
              <img
                src={qrDataUrl}
                alt="WalletConnect QR"
                width={240}
                height={240}
                className="block"
              />
              {copied && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-medium text-white">
                  Copied!
                </div>
              )}
            </button>
          ) : (
            <div className="flex h-[264px] w-[264px] items-center justify-center rounded-xl border border-zinc-700/60 bg-zinc-800">
              <Spinner />
            </div>
          )}
          <p className="text-center text-xs text-zinc-500">
            Scan with Paytaca mobile app, or click to copy URI
          </p>
        </div>
      </div>
    </ModalLayer>
  );
}

// ---------------------------------------------------------------------------
// Small SVG helpers
// ---------------------------------------------------------------------------

function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-75"
      />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="2" width="8" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3 5v7.5A1.5 1.5 0 0 0 4.5 14H10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PaytacaIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="6" fill="#10b981" />
      <path
        d="M7 12.5h4.5a3 3 0 1 0 0-6H8.5a1 1 0 0 0-1 1v9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
