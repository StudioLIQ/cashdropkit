/**
 * Signer Module Tests
 *
 * Tests for the LocalMnemonicSigner implementation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { TxInput, TxOutput, UnsignedTransaction } from '@/core/tx/tokenTxBuilder';
import { buildP2PKHScript, bytesToHex } from '@/core/tx/tokenTxBuilder';
import { decodeCashAddr } from '@/core/wallet/cashaddr';
import { deriveAddress } from '@/core/wallet/mnemonic';

import { LocalMnemonicSigner, createLocalMnemonicSigner } from './LocalMnemonicSigner';
import type { AddressDerivation } from './Signer';
import { DEFAULT_SIGHASH_TYPE, SIGHASH } from './Signer';

// Test mnemonic (DO NOT USE IN PRODUCTION)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Signer', () => {
  describe('SIGHASH constants', () => {
    it('should have correct SIGHASH values', () => {
      expect(SIGHASH.ALL).toBe(0x01);
      expect(SIGHASH.NONE).toBe(0x02);
      expect(SIGHASH.SINGLE).toBe(0x03);
      expect(SIGHASH.ANYONECANPAY).toBe(0x80);
      expect(SIGHASH.FORKID).toBe(0x40);
    });

    it('should have correct default sighash type', () => {
      expect(DEFAULT_SIGHASH_TYPE).toBe(0x41); // ALL | FORKID
    });
  });

  describe('LocalMnemonicSigner', () => {
    let signer: LocalMnemonicSigner;
    let derivedAddress: string;
    let derivedPubkeyHash: Uint8Array;

    beforeAll(async () => {
      signer = createLocalMnemonicSigner(TEST_MNEMONIC, 'testnet');
      // Derive the actual address for account 0, index 0
      derivedAddress = await deriveAddress(TEST_MNEMONIC, 'testnet', 0, 0);
      const decoded = decodeCashAddr(derivedAddress);
      derivedPubkeyHash = decoded.hash;
    });

    afterAll(() => {
      signer.destroy();
    });

    describe('constructor', () => {
      it('should create signer with valid mnemonic', () => {
        const s = new LocalMnemonicSigner(TEST_MNEMONIC, 'testnet');
        expect(s).toBeInstanceOf(LocalMnemonicSigner);
        s.destroy();
      });

      it('should throw on invalid mnemonic', () => {
        expect(() => new LocalMnemonicSigner('invalid mnemonic words', 'testnet')).toThrow(
          'Invalid mnemonic phrase'
        );
      });

      it('should normalize mnemonic with extra spaces', () => {
        const s = new LocalMnemonicSigner('  ' + TEST_MNEMONIC + '  ', 'testnet');
        expect(s.getMnemonic()).toBe(TEST_MNEMONIC);
        s.destroy();
      });
    });

    describe('getMnemonic', () => {
      it('should return the mnemonic', () => {
        expect(signer.getMnemonic()).toBe(TEST_MNEMONIC);
      });

      it('should throw after destroy', () => {
        const s = new LocalMnemonicSigner(TEST_MNEMONIC, 'testnet');
        s.destroy();
        expect(() => s.getMnemonic()).toThrow('Signer has been destroyed');
      });
    });

    describe('getPublicKey', () => {
      it('should derive public key for first address', async () => {
        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const pubkey = await signer.getPublicKey(derivation);

        // Public key should be 33 bytes (66 hex chars) for compressed
        expect(pubkey.length).toBe(66);
        // Should start with 02 or 03 (compressed format)
        expect(['02', '03']).toContain(pubkey.slice(0, 2));
      });

      it('should derive different keys for different indices', async () => {
        const derivation0: AddressDerivation = {
          address: '',
          accountIndex: 0,
          addressIndex: 0,
        };
        const derivation1: AddressDerivation = {
          address: '',
          accountIndex: 0,
          addressIndex: 1,
        };

        const pubkey0 = await signer.getPublicKey(derivation0);
        const pubkey1 = await signer.getPublicKey(derivation1);

        expect(pubkey0).not.toBe(pubkey1);
      });
    });

    describe('canSign', () => {
      it('should return true for correctly derived address', async () => {
        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const canSignResult = await signer.canSign(derivedAddress, derivation);
        expect(canSignResult).toBe(true);
      });

      it('should return false for wrong address', async () => {
        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        // Use a different address that doesn't match the derivation
        const wrongAddress = 'bchtest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9f4cqy2';
        const result = await signer.canSign(wrongAddress, derivation);

        expect(result).toBe(false);
      });
    });

    describe('sign', () => {
      it('should sign a simple transaction', async () => {
        // Create a scriptPubKey using the derived pubkey hash
        const mockInput: TxInput = {
          txid: 'a'.repeat(64),
          vout: 0,
          satoshis: 100000n,
          scriptPubKey: bytesToHex(buildP2PKHScript(derivedPubkeyHash)),
        };

        const mockOutput: TxOutput = {
          satoshis: 99000n,
          lockingScript: bytesToHex(buildP2PKHScript(new Uint8Array(20).fill(1))),
        };

        const unsignedTx: UnsignedTransaction = {
          version: 2,
          inputs: [mockInput],
          outputs: [mockOutput],
          locktime: 0,
          estimatedSize: 200,
          estimatedFee: 1000n,
        };

        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const result = await signer.sign(unsignedTx, [derivation]);

        expect(result.success).toBe(true);
        if (result.success && result.transaction) {
          expect(result.transaction.txHex).toBeTruthy();
          expect(result.transaction.txid).toBeTruthy();
          expect(result.transaction.inputs.length).toBe(1);
          expect(result.transaction.outputs.length).toBe(1);
        }
      });

      it('should fail when no derivation matches input address', async () => {
        // Use a different pubkey hash that won't match the derivation
        const mockInput: TxInput = {
          txid: 'b'.repeat(64),
          vout: 0,
          satoshis: 100000n,
          scriptPubKey: bytesToHex(buildP2PKHScript(new Uint8Array(20).fill(5))),
        };

        const mockOutput: TxOutput = {
          satoshis: 99000n,
          lockingScript: bytesToHex(buildP2PKHScript(new Uint8Array(20).fill(6))),
        };

        const unsignedTx: UnsignedTransaction = {
          version: 2,
          inputs: [mockInput],
          outputs: [mockOutput],
          locktime: 0,
          estimatedSize: 200,
          estimatedFee: 1000n,
        };

        // Provide derivation for a different address
        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const result = await signer.sign(unsignedTx, [derivation]);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No derivation info for input');
      });

      it('should sign transaction with multiple inputs', async () => {
        const mockInput1: TxInput = {
          txid: 'c'.repeat(64),
          vout: 0,
          satoshis: 50000n,
          scriptPubKey: bytesToHex(buildP2PKHScript(derivedPubkeyHash)),
        };

        const mockInput2: TxInput = {
          txid: 'd'.repeat(64),
          vout: 1,
          satoshis: 50000n,
          scriptPubKey: bytesToHex(buildP2PKHScript(derivedPubkeyHash)),
        };

        const mockOutput: TxOutput = {
          satoshis: 99000n,
          lockingScript: bytesToHex(buildP2PKHScript(new Uint8Array(20).fill(1))),
        };

        const unsignedTx: UnsignedTransaction = {
          version: 2,
          inputs: [mockInput1, mockInput2],
          outputs: [mockOutput],
          locktime: 0,
          estimatedSize: 350,
          estimatedFee: 1000n,
        };

        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const result = await signer.sign(unsignedTx, [derivation]);

        expect(result.success).toBe(true);
        if (result.success && result.transaction) {
          expect(result.transaction.inputs.length).toBe(2);
          // Both inputs should have different scriptSigs (different signatures due to different txids)
          expect(result.transaction.inputs[0].scriptSig).not.toBe(
            result.transaction.inputs[1].scriptSig
          );
        }
      });

      it('should sign transaction with token inputs', async () => {
        const mockTokenInput: TxInput = {
          txid: 'e'.repeat(64),
          vout: 0,
          satoshis: 1000n,
          scriptPubKey: bytesToHex(buildP2PKHScript(derivedPubkeyHash)),
          token: {
            category: 'f'.repeat(64),
            amount: 1000000n,
          },
        };

        const mockOutput: TxOutput = {
          satoshis: 546n,
          lockingScript: bytesToHex(buildP2PKHScript(new Uint8Array(20).fill(1))),
          token: {
            category: 'f'.repeat(64),
            amount: 1000000n,
          },
        };

        const unsignedTx: UnsignedTransaction = {
          version: 2,
          inputs: [mockTokenInput],
          outputs: [mockOutput],
          locktime: 0,
          estimatedSize: 250,
          estimatedFee: 454n,
        };

        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const result = await signer.sign(unsignedTx, [derivation]);

        expect(result.success).toBe(true);
        if (result.success && result.transaction) {
          expect(result.transaction.txHex).toBeTruthy();
          expect(result.transaction.txid.length).toBe(64);
        }
      });

      it('should return error after destroy', async () => {
        const s = new LocalMnemonicSigner(TEST_MNEMONIC, 'testnet');
        s.destroy();

        const mockInput: TxInput = {
          txid: 'a'.repeat(64),
          vout: 0,
          satoshis: 100000n,
          scriptPubKey: '76a914000000000000000000000000000000000000000088ac',
        };

        const unsignedTx: UnsignedTransaction = {
          version: 2,
          inputs: [mockInput],
          outputs: [],
          locktime: 0,
          estimatedSize: 100,
          estimatedFee: 100n,
        };

        const result = await s.sign(unsignedTx, []);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Signer has been destroyed');
      });
    });

    describe('SignedTransaction structure', () => {
      it('should produce valid transaction structure', async () => {
        const mockInput: TxInput = {
          txid: 'a'.repeat(64),
          vout: 0,
          satoshis: 100000n,
          scriptPubKey: bytesToHex(buildP2PKHScript(derivedPubkeyHash)),
        };

        const mockOutput: TxOutput = {
          satoshis: 99000n,
          lockingScript: bytesToHex(buildP2PKHScript(new Uint8Array(20).fill(1))),
        };

        const unsignedTx: UnsignedTransaction = {
          version: 2,
          inputs: [mockInput],
          outputs: [mockOutput],
          locktime: 0,
          estimatedSize: 200,
          estimatedFee: 1000n,
        };

        const derivation: AddressDerivation = {
          address: derivedAddress,
          accountIndex: 0,
          addressIndex: 0,
        };

        const result = await signer.sign(unsignedTx, [derivation]);

        expect(result.success).toBe(true);
        if (!result.success || !result.transaction) {
          throw new Error('Signing failed');
        }

        const tx = result.transaction;

        // Version
        expect(tx.version).toBe(2);

        // Inputs
        expect(tx.inputs.length).toBe(1);
        expect(tx.inputs[0].txid).toBe('a'.repeat(64));
        expect(tx.inputs[0].vout).toBe(0);
        expect(tx.inputs[0].scriptSig.length).toBeGreaterThan(0);
        expect(tx.inputs[0].sequence).toBe(0xfffffffe);

        // Outputs
        expect(tx.outputs.length).toBe(1);
        expect(tx.outputs[0].satoshis).toBe(99000n);

        // Transaction hex
        expect(tx.txHex.length).toBeGreaterThan(0);
        // Should start with version bytes (02000000 for v2)
        expect(tx.txHex.slice(0, 8)).toBe('02000000');

        // Transaction ID
        expect(tx.txid.length).toBe(64);
        // txid should be hex
        expect(/^[0-9a-f]+$/.test(tx.txid)).toBe(true);

        // Locktime
        expect(tx.locktime).toBe(0);
      });
    });
  });

  describe('createLocalMnemonicSigner', () => {
    it('should create a signer instance', () => {
      const signer = createLocalMnemonicSigner(TEST_MNEMONIC, 'mainnet');
      expect(signer).toBeInstanceOf(LocalMnemonicSigner);
      signer.destroy();
    });

    it('should work with both networks', () => {
      const mainnetSigner = createLocalMnemonicSigner(TEST_MNEMONIC, 'mainnet');
      const testnetSigner = createLocalMnemonicSigner(TEST_MNEMONIC, 'testnet');

      expect(mainnetSigner).toBeInstanceOf(LocalMnemonicSigner);
      expect(testnetSigner).toBeInstanceOf(LocalMnemonicSigner);

      mainnetSigner.destroy();
      testnetSigner.destroy();
    });
  });
});
