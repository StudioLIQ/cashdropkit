'use client';

import { useCallback, useRef, useState } from 'react';

interface CsvUploaderProps {
  onFileSelect: (file: File) => void;
  onContentPaste?: (content: string) => void;
  isLoading?: boolean;
  error?: string | null;
  accept?: string;
}

export function CsvUploader({
  onFileSelect,
  onContentPaste,
  isLoading = false,
  error,
  accept = '.csv,text/csv',
}: CsvUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pastedContent, setPastedContent] = useState('');

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePasteSubmit = useCallback(() => {
    if (pastedContent.trim() && onContentPaste) {
      onContentPaste(pastedContent.trim());
      setPastedContent('');
      setShowPasteArea(false);
    }
  }, [pastedContent, onContentPaste]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors
          ${isDragging ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-zinc-300 dark:border-zinc-700'}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-emerald-400 hover:bg-zinc-50 dark:hover:bg-zinc-900'}
        `}
        onClick={!isLoading ? handleBrowseClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-10 w-10 animate-spin text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Processing file...</p>
          </div>
        ) : (
          <>
            {/* Upload icon */}
            <div className="mb-4 rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/50">
              <svg
                className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>

            <p className="mb-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
              Drop your CSV file here
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              or{' '}
              <span className="text-emerald-600 dark:text-emerald-400 hover:underline">browse</span>{' '}
              to upload
            </p>

            <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
              Supported: CSV files with address and amount columns
            </p>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 dark:bg-red-950 dark:border-red-900 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Paste option */}
      {onContentPaste && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowPasteArea(!showPasteArea)}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            {showPasteArea ? 'Hide paste area' : 'Or paste CSV content directly'}
          </button>

          {showPasteArea && (
            <div className="mt-3 space-y-3">
              <textarea
                value={pastedContent}
                onChange={(e) => setPastedContent(e.target.value)}
                placeholder={`address,amount,memo\nbitcoincash:qz...,100,Test payment`}
                className="w-full h-32 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-mono placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={handlePasteSubmit}
                disabled={isLoading || !pastedContent.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Parse Content
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sample format */}
      <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 dark:bg-zinc-900 dark:border-zinc-800">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          Expected CSV format:
        </p>
        <pre className="text-xs text-zinc-500 dark:text-zinc-400 font-mono overflow-x-auto">
          {`address,amount,memo
bitcoincash:qz...,100,Team allocation
bitcoincash:qr...,50.5,Advisor`}
        </pre>
      </div>
    </div>
  );
}
