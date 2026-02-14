'use client';

import { type Toast, useToastStore } from '@/stores/toastStore';

// ============================================================================
// Toast Container
// ============================================================================

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

// ============================================================================
// Toast Item
// ============================================================================

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const styles = severityStyles[toast.severity];

  return (
    <div
      className={`pointer-events-auto w-80 rounded-lg border p-4 shadow-lg ${styles.container}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${styles.icon}`}>{styles.svg}</div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${styles.title}`}>{toast.title}</p>
          {toast.detail && <p className={`mt-1 text-xs ${styles.detail}`}>{toast.detail}</p>}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className={`shrink-0 rounded p-0.5 transition-colors ${styles.close}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const severityStyles = {
  error: {
    container: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950',
    icon: 'text-red-500 dark:text-red-400',
    title: 'text-red-800 dark:text-red-200',
    detail: 'text-red-600 dark:text-red-400',
    close: 'text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300',
    svg: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  warning: {
    container: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950',
    icon: 'text-amber-500 dark:text-amber-400',
    title: 'text-amber-800 dark:text-amber-200',
    detail: 'text-amber-600 dark:text-amber-400',
    close: 'text-amber-400 hover:text-amber-600 dark:text-amber-500 dark:hover:text-amber-300',
    svg: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.832c-.77-.834-2.694-.834-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
        />
      </svg>
    ),
  },
  info: {
    container: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950',
    icon: 'text-blue-500 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-200',
    detail: 'text-blue-600 dark:text-blue-400',
    close: 'text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300',
    svg: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  success: {
    container: 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950',
    icon: 'text-emerald-500 dark:text-emerald-400',
    title: 'text-emerald-800 dark:text-emerald-200',
    detail: 'text-emerald-600 dark:text-emerald-400',
    close:
      'text-emerald-400 hover:text-emerald-600 dark:text-emerald-500 dark:hover:text-emerald-300',
    svg: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
};
