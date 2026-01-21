/**
 * Wallet module exports
 */

// Types
export type { DerivationAccount, UnlockedWallet, WalletCreationResult } from './types';
export { BIP44_COIN_TYPE, DEFAULT_DERIVATION } from './types';

// CashAddr utilities
export type { AddressType } from './cashaddr';
export {
  decodeCashAddr,
  encodeCashAddr,
  getPrefix,
  isValidCashAddr,
  normalizeCashAddr,
} from './cashaddr';

// Mnemonic utilities
export {
  deriveAddress,
  deriveAddresses,
  generateMnemonic,
  getDerivationPath,
  getDisplayDerivationPath,
  mnemonicToSeed,
  normalizeMnemonic,
  seedToHDKey,
  validateMnemonic,
} from './mnemonic';

// Wallet service
export {
  changeWalletPassphrase,
  createWallet,
  createWatchOnlyWallet,
  deleteWallet,
  deriveMoreAddresses,
  getActiveWallet,
  getAllWallets,
  getWalletsByNetwork,
  importWallet,
  renameWallet,
  setActiveWallet,
  unlockWallet,
  verifyWalletPassphrase,
} from './walletService';
