/**
 * Toast Store
 *
 * Zustand store for managing toast notifications.
 * Supports multiple concurrent toasts with auto-dismiss.
 */
import { create } from 'zustand';

import type { AppMessage, ErrorSeverity } from '@/core/util/errorTemplates';

// ============================================================================
// Types
// ============================================================================

export interface Toast {
  id: string;
  severity: ErrorSeverity;
  title: string;
  detail?: string;
  createdAt: number;
  /** Auto-dismiss duration in ms. 0 = no auto-dismiss */
  duration: number;
}

export interface ToastState {
  toasts: Toast[];

  addToast: (message: AppMessage, duration?: number) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;

  // Convenience methods
  error: (title: string, detail?: string) => string;
  warning: (title: string, detail?: string) => string;
  info: (title: string, detail?: string) => string;
  success: (title: string, detail?: string) => string;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_DURATIONS: Record<ErrorSeverity, number> = {
  error: 8000,
  warning: 6000,
  info: 4000,
  success: 3000,
};

const MAX_TOASTS = 5;

// ============================================================================
// Store
// ============================================================================

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (message: AppMessage, duration?: number) => {
    const id = `toast-${nextId++}`;
    const effectiveDuration = duration ?? DEFAULT_DURATIONS[message.severity];

    const toast: Toast = {
      id,
      severity: message.severity,
      title: message.title,
      detail: message.detail,
      createdAt: Date.now(),
      duration: effectiveDuration,
    };

    set((state) => ({
      toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), toast],
    }));

    // Auto-dismiss
    if (effectiveDuration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, effectiveDuration);
    }

    return id;
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearAll: () => {
    set({ toasts: [] });
  },

  error: (title: string, detail?: string) => {
    return get().addToast({ severity: 'error', title, detail });
  },

  warning: (title: string, detail?: string) => {
    return get().addToast({ severity: 'warning', title, detail });
  },

  info: (title: string, detail?: string) => {
    return get().addToast({ severity: 'info', title, detail });
  },

  success: (title: string, detail?: string) => {
    return get().addToast({ severity: 'success', title, detail });
  },
}));
