/**
 * Signer Module
 *
 * Provides transaction signing capabilities with local key management.
 * Private keys never leave the client runtime.
 */

export type {
  Signer,
  MnemonicSigner,
  SignedTransaction,
  SignedInput,
  SigningOptions,
  SigningResult,
  AddressDerivation,
} from './Signer';

export { SIGHASH, DEFAULT_SIGHASH_TYPE } from './Signer';

export { LocalMnemonicSigner, createLocalMnemonicSigner } from './LocalMnemonicSigner';
