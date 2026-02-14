/**
 * Wallet module types
 */
import type { Network } from '../db/types';

/**
 * Wallet creation result (before encryption)
 */
export interface WalletCreationResult {
  mnemonic: string;
  addresses: string[];
  derivationPath: string;
}

/**
 * Wallet unlock result (after decryption)
 */
export interface UnlockedWallet {
  id: string;
  name: string;
  network: Network;
  mnemonic: string;
  addresses: string[];
  derivationPath: string;
}

/**
 * Derivation account info
 */
export interface DerivationAccount {
  /** BIP44 account index */
  accountIndex: number;
  /** Number of addresses to derive */
  addressCount: number;
}

/**
 * Default derivation settings
 */
export const DEFAULT_DERIVATION: DerivationAccount = {
  accountIndex: 0,
  addressCount: 1,
};

/**
 * BIP44 coin types
 * BCH mainnet: 145
 * BCH testnet: 1 (shared testnet coin type)
 */
export const BIP44_COIN_TYPE: Record<Network, number> = {
  mainnet: 145,
  testnet: 1,
};
