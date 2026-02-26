'use client';

import { useCallback, useState } from 'react';

import type { Network, Wallet } from '@/core/db/types';

import { ModalLayer } from '@/ui/components/common/ModalLayer';

interface CreateWalletModalProps {
  isOpen: boolean;
  isCreating: boolean;
  network: Network;
  onClose: () => void;
  onCreate: (
    name: string,
    network: Network,
    passphrase: string,
    strength?: 128 | 256
  ) => Promise<{ wallet: Wallet; mnemonic: string }>;
}

type Step = 'form' | 'backup' | 'confirm';

export function CreateWalletModal({
  isOpen,
  isCreating,
  network,
  onClose,
  onCreate,
}: CreateWalletModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [confirmWords, setConfirmWords] = useState<string[]>(['', '', '']);
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [error, setError] = useState('');

  const resetForm = useCallback(() => {
    setStep('form');
    setName('');
    setPassphrase('');
    setConfirmPassphrase('');
    setMnemonic('');
    setConfirmWords(['', '', '']);
    setVerifyIndices([]);
    setError('');
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  const handleCreateWallet = useCallback(async () => {
    setError('');

    if (!name.trim()) {
      setError('Please enter a wallet name');
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
      const result = await onCreate(name.trim(), network, passphrase);
      setMnemonic(result.mnemonic);

      // Generate 3 random indices for verification
      const words = result.mnemonic.split(' ');
      const indices: number[] = [];
      while (indices.length < 3) {
        const idx = Math.floor(Math.random() * words.length);
        if (!indices.includes(idx)) {
          indices.push(idx);
        }
      }
      indices.sort((a, b) => a - b);
      setVerifyIndices(indices);
      setConfirmWords(['', '', '']);

      setStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    }
  }, [name, passphrase, confirmPassphrase, network, onCreate]);

  const handleConfirmBackup = useCallback(() => {
    const words = mnemonic.split(' ');

    for (let i = 0; i < verifyIndices.length; i++) {
      const expectedWord = words[verifyIndices[i]];
      const enteredWord = confirmWords[i].trim().toLowerCase();

      if (enteredWord !== expectedWord) {
        setError(`Word #${verifyIndices[i] + 1} is incorrect. Please check your backup.`);
        return;
      }
    }

    // Success - close the modal
    handleClose();
  }, [mnemonic, verifyIndices, confirmWords, handleClose]);

  if (!isOpen) return null;

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

      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {(['form', 'backup', 'confirm'] as Step[]).map((s, i) => (
          <div
            key={s}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step === s
                ? 'bg-emerald-600 text-white'
                : i < ['form', 'backup', 'confirm'].indexOf(step)
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Step: Form */}
      {step === 'form' && (
        <>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Create New Wallet
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Set up your wallet with a strong passphrase
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
                placeholder="My Wallet"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
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
                This passphrase encrypts your wallet locally. Remember it!
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
              onClick={handleCreateWallet}
              disabled={isCreating}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Wallet'}
            </button>
          </div>
        </>
      )}

      {/* Step: Backup */}
      {step === 'backup' && (
        <>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Backup Recovery Phrase
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Write down these 12 words in order. This is the only way to recover your wallet.
          </p>

          <div className="mt-6">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
              <div className="grid grid-cols-3 gap-2">
                {mnemonic.split(' ').map((word, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-sm dark:bg-zinc-900"
                  >
                    <span className="text-zinc-400 dark:text-zinc-500">{i + 1}.</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{word}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg bg-red-50 p-3 dark:bg-red-950">
            <div className="flex gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
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
              <div className="text-sm text-red-800 dark:text-red-200">
                <p className="font-medium">Never share this phrase!</p>
                <p className="mt-1">
                  Anyone with this phrase can access your funds. Store it securely offline.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setStep('form')}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep('confirm')}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              I&apos;ve Written It Down
            </button>
          </div>
        </>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Verify Your Backup
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Enter the following words from your recovery phrase to confirm you saved it.
          </p>

          <div className="mt-6 space-y-4">
            {verifyIndices.map((wordIndex, i) => (
              <div key={wordIndex}>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Word #{wordIndex + 1}
                </label>
                <input
                  type="text"
                  value={confirmWords[i]}
                  onChange={(e) => {
                    const newWords = [...confirmWords];
                    newWords[i] = e.target.value;
                    setConfirmWords(newWords);
                    setError('');
                  }}
                  placeholder={`Enter word #${wordIndex + 1}`}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
            ))}

            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setStep('backup')}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirmBackup}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Confirm & Finish
            </button>
          </div>
        </>
      )}
    </ModalLayer>
  );
}
