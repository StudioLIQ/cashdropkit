'use client';

import { useCallback, useState } from 'react';

import type { Network, Wallet } from '@/core/db/types';
import { validateMnemonic } from '@/core/wallet';

import { ModalLayer } from '@/ui/components/common/ModalLayer';

interface ImportWalletModalProps {
  isOpen: boolean;
  isImporting: boolean;
  network: Network;
  onClose: () => void;
  onImport: (
    name: string,
    mnemonic: string,
    network: Network,
    passphrase: string
  ) => Promise<Wallet>;
}

export function ImportWalletModal({
  isOpen,
  isImporting,
  network,
  onClose,
  onImport,
}: ImportWalletModalProps) {
  const [name, setName] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setName('');
    setMnemonic('');
    setPassphrase('');
    setConfirmPassphrase('');
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleImport = useCallback(async () => {
    setError('');

    if (!name.trim()) {
      setError('Please enter a wallet name');
      return;
    }

    if (!mnemonic.trim()) {
      setError('Please enter your recovery phrase');
      return;
    }

    // Validate mnemonic
    if (!validateMnemonic(mnemonic)) {
      setError('Invalid recovery phrase. Please check for typos.');
      return;
    }

    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    try {
      await onImport(name.trim(), mnemonic.trim(), network, passphrase);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    }
  }, [name, mnemonic, passphrase, confirmPassphrase, network, onImport, handleClose]);

  if (!isOpen) return null;

  // Count words in mnemonic
  const wordCount = mnemonic.trim().split(/\s+/).filter(Boolean).length;
  const isValidWordCount = wordCount === 12 || wordCount === 24;

  return (
    <ModalLayer isOpen={isOpen} onClose={handleClose} panelClassName="max-w-md">
      {/* Close button */}
      <button
        type="button"
        onClick={handleClose}
        className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Import Wallet</h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Import an existing wallet using your 12 or 24-word recovery phrase
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Wallet Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Imported Wallet"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Recovery Phrase
            </label>
            {mnemonic && (
              <span
                className={`text-xs ${isValidWordCount ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}
              >
                {wordCount} words
              </span>
            )}
          </div>
          <textarea
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            placeholder="Enter your 12 or 24 word recovery phrase, separated by spaces"
            rows={3}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Passphrase
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="At least 8 characters"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            This passphrase encrypts your wallet locally
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Confirm Passphrase
          </label>
          <input
            type="password"
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            placeholder="Confirm passphrase"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-950">
          <div className="flex gap-2">
            <svg
              className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Network: <span className="font-medium capitalize">{network}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={isImporting}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isImporting ? 'Importing...' : 'Import Wallet'}
        </button>
      </div>
    </ModalLayer>
  );
}
