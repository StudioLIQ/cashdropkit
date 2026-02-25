/**
 * Wallet Service
 *
 * High-level operations for wallet management:
 * - Create new wallet (generate mnemonic)
 * - Import wallet (from mnemonic)
 * - Unlock wallet (decrypt mnemonic)
 * - Get addresses for a wallet
 */
import type { EncryptedData } from '../crypto';
import { decryptWithPassphrase, encryptWithPassphrase, serializeEncrypted } from '../crypto';
import { settingsRepo, walletRepo } from '../db';
import type { Network, Wallet } from '../db/types';
import {
  deriveAddresses,
  generateMnemonic,
  getDisplayDerivationPath,
  normalizeMnemonic,
  validateMnemonic,
} from './mnemonic';
import { isValidCashAddr, normalizeCashAddr } from './cashaddr';
import { DEFAULT_DERIVATION, type UnlockedWallet } from './types';

/**
 * Generate a crypto-safe UUID
 */
function generateId(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a new wallet with a generated mnemonic
 *
 * @param name - Wallet display name
 * @param network - Network (mainnet/testnet)
 * @param passphrase - Encryption passphrase
 * @param strength - Mnemonic strength (128 = 12 words, 256 = 24 words)
 * @returns Created wallet and the mnemonic (for backup display)
 */
export async function createWallet(
  name: string,
  network: Network,
  passphrase: string,
  strength: 128 | 256 = 128
): Promise<{ wallet: Wallet; mnemonic: string }> {
  // Generate new mnemonic
  const mnemonic = generateMnemonic(strength);

  // Derive addresses
  const addresses = await deriveAddresses(mnemonic, network, DEFAULT_DERIVATION);
  const derivationPath = getDisplayDerivationPath(network, DEFAULT_DERIVATION.accountIndex);

  // Encrypt mnemonic
  const encrypted = await encryptWithPassphrase(mnemonic, passphrase);

  const now = Date.now();
  const wallet: Wallet = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    network,
    type: 'mnemonic',
    encryptedMnemonic: serializeEncrypted(encrypted),
    derivationPath,
    addresses,
  };

  // Save to database
  await walletRepo.create(wallet);

  return { wallet, mnemonic };
}

/**
 * Import a wallet from an existing mnemonic
 *
 * @param name - Wallet display name
 * @param mnemonic - BIP39 mnemonic phrase
 * @param network - Network (mainnet/testnet)
 * @param passphrase - Encryption passphrase
 * @returns Created wallet
 */
export async function importWallet(
  name: string,
  mnemonic: string,
  network: Network,
  passphrase: string
): Promise<Wallet> {
  // Normalize and validate mnemonic
  const normalized = normalizeMnemonic(mnemonic);

  if (!validateMnemonic(normalized)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Derive addresses
  const addresses = await deriveAddresses(normalized, network, DEFAULT_DERIVATION);
  const derivationPath = getDisplayDerivationPath(network, DEFAULT_DERIVATION.accountIndex);

  // Encrypt mnemonic
  const encrypted = await encryptWithPassphrase(normalized, passphrase);

  const now = Date.now();
  const wallet: Wallet = {
    id: generateId(),
    name,
    createdAt: now,
    updatedAt: now,
    network,
    type: 'mnemonic',
    encryptedMnemonic: serializeEncrypted(encrypted),
    derivationPath,
    addresses,
  };

  // Save to database
  await walletRepo.create(wallet);

  return wallet;
}

/**
 * Unlock a wallet (decrypt mnemonic for signing)
 *
 * @param wallet - Wallet to unlock
 * @param passphrase - Decryption passphrase
 * @returns Unlocked wallet with mnemonic
 */
export async function unlockWallet(wallet: Wallet, passphrase: string): Promise<UnlockedWallet> {
  if (wallet.type !== 'mnemonic') {
    throw new Error('Cannot unlock watch-only wallet');
  }

  if (!wallet.encryptedMnemonic) {
    throw new Error('Wallet has no encrypted mnemonic');
  }

  // Parse encrypted data
  const encrypted: EncryptedData = JSON.parse(wallet.encryptedMnemonic);

  // Decrypt mnemonic
  const mnemonic = await decryptWithPassphrase(encrypted, passphrase);

  return {
    id: wallet.id,
    name: wallet.name,
    network: wallet.network,
    mnemonic,
    addresses: wallet.addresses || [],
    derivationPath: wallet.derivationPath || '',
  };
}

/**
 * Create a watch-only wallet
 *
 * @param name - Wallet display name
 * @param address - Watch address
 * @param network - Network (mainnet/testnet)
 * @returns Created wallet
 */
export async function createWatchOnlyWallet(
  name: string,
  address: string,
  network: Network
): Promise<Wallet> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Wallet name is required');
  }

  const normalizedAddress = normalizeCashAddr(address);
  if (!isValidCashAddr(normalizedAddress, network)) {
    throw new Error(`Invalid ${network} CashAddr`);
  }

  const now = Date.now();
  const wallet: Wallet = {
    id: generateId(),
    name: trimmedName,
    createdAt: now,
    updatedAt: now,
    network,
    type: 'watch-only',
    watchAddress: normalizedAddress,
    addresses: [normalizedAddress],
  };

  await walletRepo.create(wallet);
  return wallet;
}

/**
 * Delete a wallet
 *
 * @param walletId - Wallet ID to delete
 */
export async function deleteWallet(walletId: string): Promise<void> {
  // Check if this is the active wallet
  const settings = await settingsRepo.get();
  if (settings.lastActiveWalletId === walletId) {
    await settingsRepo.update({ lastActiveWalletId: undefined });
  }

  await walletRepo.delete(walletId);
}

/**
 * Update wallet name
 *
 * @param walletId - Wallet ID
 * @param name - New name
 */
export async function renameWallet(walletId: string, name: string): Promise<void> {
  const wallet = await walletRepo.getById(walletId);
  if (!wallet) {
    throw new Error('Wallet not found');
  }

  await walletRepo.update({
    ...wallet,
    name,
    updatedAt: Date.now(),
  });
}

/**
 * Derive additional addresses for a wallet
 *
 * @param wallet - Wallet to derive addresses for
 * @param passphrase - Decryption passphrase
 * @param count - Number of addresses to derive (total)
 * @returns Updated wallet
 */
export async function deriveMoreAddresses(
  wallet: Wallet,
  passphrase: string,
  count: number
): Promise<Wallet> {
  if (wallet.type !== 'mnemonic') {
    throw new Error('Cannot derive addresses for watch-only wallet');
  }

  // Unlock to get mnemonic
  const unlocked = await unlockWallet(wallet, passphrase);

  // Derive addresses
  const addresses = await deriveAddresses(unlocked.mnemonic, wallet.network, {
    accountIndex: 0,
    addressCount: count,
  });

  // Update wallet
  const updated: Wallet = {
    ...wallet,
    addresses,
    updatedAt: Date.now(),
  };

  await walletRepo.update(updated);

  return updated;
}

/**
 * Set active wallet
 *
 * @param walletId - Wallet ID to set as active
 */
export async function setActiveWallet(walletId: string | undefined): Promise<void> {
  await settingsRepo.update({ lastActiveWalletId: walletId });
}

/**
 * Get active wallet
 *
 * @returns Active wallet or undefined
 */
export async function getActiveWallet(): Promise<Wallet | undefined> {
  const settings = await settingsRepo.get();
  if (!settings.lastActiveWalletId) {
    return undefined;
  }
  return walletRepo.getById(settings.lastActiveWalletId);
}

/**
 * Get all wallets
 */
export async function getAllWallets(): Promise<Wallet[]> {
  return walletRepo.getAll();
}

/**
 * Get wallets for a specific network
 */
export async function getWalletsByNetwork(network: Network): Promise<Wallet[]> {
  return walletRepo.getByNetwork(network);
}

/**
 * Verify passphrase for a wallet
 *
 * @param wallet - Wallet to verify
 * @param passphrase - Passphrase to verify
 * @returns true if passphrase is correct
 */
export async function verifyWalletPassphrase(wallet: Wallet, passphrase: string): Promise<boolean> {
  try {
    await unlockWallet(wallet, passphrase);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-encrypt wallet with new passphrase
 *
 * @param wallet - Wallet to re-encrypt
 * @param currentPassphrase - Current passphrase
 * @param newPassphrase - New passphrase
 */
export async function changeWalletPassphrase(
  wallet: Wallet,
  currentPassphrase: string,
  newPassphrase: string
): Promise<void> {
  if (wallet.type !== 'mnemonic') {
    throw new Error('Cannot change passphrase for watch-only wallet');
  }

  // Decrypt with current passphrase
  const unlocked = await unlockWallet(wallet, currentPassphrase);

  // Re-encrypt with new passphrase
  const encrypted = await encryptWithPassphrase(unlocked.mnemonic, newPassphrase);

  // Update wallet
  await walletRepo.update({
    ...wallet,
    encryptedMnemonic: serializeEncrypted(encrypted),
    updatedAt: Date.now(),
  });
}
