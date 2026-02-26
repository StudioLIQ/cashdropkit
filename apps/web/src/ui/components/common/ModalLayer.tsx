'use client';

import { useEffect } from 'react';

import { createPortal } from 'react-dom';

interface ModalLayerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
}

/**
 * Shared modal layer rendered through a portal to avoid clipping/stacking
 * issues under nested layout containers.
 */
export function ModalLayer({
  isOpen,
  onClose,
  children,
  panelClassName,
  closeOnBackdrop = true,
}: ModalLayerProps) {
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-[91] w-full max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:max-h-[calc(100vh-3rem)] ${panelClassName ?? ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
