/**
 * App Lock State Management
 *
 * Manages the locked/unlocked state of the application.
 * Provides auto-lock functionality based on idle time.
 *
 * Security model:
 * - When locked, derived encryption key is cleared from memory
 * - User must re-enter passphrase to unlock
 * - Auto-lock triggers after configurable idle period
 */
import { decryptWithPassphrase, encryptWithPassphrase } from './aes';
import { deriveKeyBytes, hashDerivedKey } from './kdf';

/**
 * Lock state
 */
export type LockState = 'locked' | 'unlocked' | 'uninitialized';

/**
 * Stored lock configuration
 */
export interface LockConfig {
  /** Base64-encoded salt for key derivation */
  salt: string;
  /** PBKDF2 iterations */
  iterations: number;
  /** SHA-256 hash of derived key (for passphrase verification) */
  keyHash: string;
  /** Auto-lock timeout in minutes (0 = disabled) */
  autoLockMinutes: number;
  /** Timestamp when lock was configured */
  createdAt: number;
}

/**
 * App Lock Manager
 *
 * Singleton pattern ensures consistent state across the app.
 * In a real app, this would integrate with a state management solution.
 */
export class AppLockManager {
  private state: LockState = 'uninitialized';
  private derivedKeyBytes: string | null = null;
  private lastActivityTime: number = Date.now();
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private config: LockConfig | null = null;

  private listeners: Set<(state: LockState) => void> = new Set();

  /**
   * Get current lock state.
   */
  getState(): LockState {
    return this.state;
  }

  /**
   * Get current config.
   */
  getConfig(): LockConfig | null {
    return this.config;
  }

  /**
   * Check if a passphrase has been set up.
   */
  isSetUp(): boolean {
    return this.config !== null;
  }

  /**
   * Initialize the lock with a passphrase.
   * Call this when user first sets up app security.
   *
   * @param passphrase - User's chosen passphrase
   * @param autoLockMinutes - Auto-lock timeout (0 = disabled)
   * @param iterations - PBKDF2 iterations
   */
  async setup(
    passphrase: string,
    autoLockMinutes: number = 15,
    iterations: number = 100_000
  ): Promise<LockConfig> {
    const { generateSalt } = await import('./kdf');
    const salt = generateSalt();
    const keyBytes = await deriveKeyBytes(passphrase, salt, iterations);
    const keyHash = await hashDerivedKey(keyBytes);

    this.config = {
      salt,
      iterations,
      keyHash,
      autoLockMinutes,
      createdAt: Date.now(),
    };

    // Unlock after setup
    this.derivedKeyBytes = keyBytes;
    this.state = 'unlocked';
    this.lastActivityTime = Date.now();
    this.startAutoLockTimer();
    this.notifyListeners();

    return this.config;
  }

  /**
   * Load existing lock configuration.
   * Call this on app startup if user has previously set up security.
   */
  loadConfig(config: LockConfig): void {
    this.config = config;
    this.state = 'locked';
    this.derivedKeyBytes = null;
    this.notifyListeners();
  }

  /**
   * Unlock the app with passphrase.
   *
   * @param passphrase - User's passphrase
   * @returns true if unlock successful, false if passphrase incorrect
   */
  async unlock(passphrase: string): Promise<boolean> {
    if (!this.config) {
      throw new Error('Lock not configured. Call setup() first.');
    }

    const keyBytes = await deriveKeyBytes(passphrase, this.config.salt, this.config.iterations);
    const keyHash = await hashDerivedKey(keyBytes);

    if (keyHash !== this.config.keyHash) {
      return false;
    }

    this.derivedKeyBytes = keyBytes;
    this.state = 'unlocked';
    this.lastActivityTime = Date.now();
    this.startAutoLockTimer();
    this.notifyListeners();

    return true;
  }

  /**
   * Lock the app immediately.
   */
  lock(): void {
    this.derivedKeyBytes = null;
    this.state = this.config ? 'locked' : 'uninitialized';
    this.stopAutoLockTimer();
    this.notifyListeners();
  }

  /**
   * Record user activity to reset auto-lock timer.
   * Call this on user interactions.
   */
  recordActivity(): void {
    if (this.state !== 'unlocked') return;

    this.lastActivityTime = Date.now();
    this.startAutoLockTimer();
  }

  /**
   * Update auto-lock timeout setting.
   *
   * @param minutes - New timeout in minutes (0 = disabled)
   */
  setAutoLockTimeout(minutes: number): void {
    if (!this.config) return;

    this.config.autoLockMinutes = minutes;
    if (this.state === 'unlocked') {
      this.startAutoLockTimer();
    }
  }

  /**
   * Change the passphrase.
   *
   * @param currentPassphrase - Current passphrase
   * @param newPassphrase - New passphrase
   * @returns Updated config, or null if current passphrase is incorrect
   */
  async changePassphrase(
    currentPassphrase: string,
    newPassphrase: string
  ): Promise<LockConfig | null> {
    if (!this.config) {
      throw new Error('Lock not configured');
    }

    // Verify current passphrase
    const currentKeyBytes = await deriveKeyBytes(
      currentPassphrase,
      this.config.salt,
      this.config.iterations
    );
    const currentKeyHash = await hashDerivedKey(currentKeyBytes);

    if (currentKeyHash !== this.config.keyHash) {
      return null;
    }

    // Generate new credentials
    const { generateSalt } = await import('./kdf');
    const newSalt = generateSalt();
    const newKeyBytes = await deriveKeyBytes(newPassphrase, newSalt, this.config.iterations);
    const newKeyHash = await hashDerivedKey(newKeyBytes);

    this.config = {
      ...this.config,
      salt: newSalt,
      keyHash: newKeyHash,
    };

    // Update in-memory key
    this.derivedKeyBytes = newKeyBytes;

    return this.config;
  }

  /**
   * Verify that app is unlocked.
   * @throws Error if locked
   */
  requireUnlocked(): void {
    if (this.state !== 'unlocked') {
      throw new Error('App is locked. Unlock to continue.');
    }
  }

  /**
   * Subscribe to lock state changes.
   */
  subscribe(listener: (state: LockState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all state (for testing or reset).
   */
  reset(): void {
    this.lock();
    this.config = null;
    this.state = 'uninitialized';
    this.notifyListeners();
  }

  private startAutoLockTimer(): void {
    this.stopAutoLockTimer();

    if (!this.config || this.config.autoLockMinutes <= 0) {
      return;
    }

    const timeoutMs = this.config.autoLockMinutes * 60 * 1000;
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    const remainingMs = Math.max(0, timeoutMs - timeSinceActivity);

    this.autoLockTimer = setTimeout(() => {
      this.lock();
    }, remainingMs);
  }

  private stopAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

// Singleton instance
let lockManagerInstance: AppLockManager | null = null;

/**
 * Get the global lock manager instance.
 */
export function getLockManager(): AppLockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new AppLockManager();
  }
  return lockManagerInstance;
}

/**
 * Reset the lock manager (for testing).
 */
export function resetLockManager(): void {
  if (lockManagerInstance) {
    lockManagerInstance.reset();
  }
  lockManagerInstance = null;
}

// Re-export encryption functions for convenience
export { decryptWithPassphrase, encryptWithPassphrase };
