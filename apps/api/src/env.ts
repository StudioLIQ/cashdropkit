/**
 * Environment Variable Validation
 *
 * Validates all required environment variables at startup.
 * Fail-fast: if any required variable is missing, the process exits immediately.
 */

export interface EnvConfig {
  // Required
  DATABASE_URL: string;
  SESSION_SECRET?: string;
  CORS_ALLOWED_ORIGINS: string;
  API_ACCESS_TOKEN?: string;

  // Required for chain operations
  ELECTRUM_TESTNET_URL: string;

  // Optional with defaults
  WORKER_POLL_INTERVAL_MS: number;
  WORKER_DROPPED_THRESHOLD_MS: number;
  PORT: number;
  HOST: string;
  LOG_LEVEL: string;
}

interface EnvRule {
  key: string;
  required: boolean;
  defaultValue?: string;
  minLength?: number;
  validate?: (value: string) => string | null; // returns error message or null
}

const ENV_RULES: EnvRule[] = [
  {
    key: 'DATABASE_URL',
    required: true,
    validate: (v) => (v.startsWith('postgresql://') || v.startsWith('postgres://') ? null : 'Must start with postgresql:// or postgres://'),
  },
  {
    key: 'SESSION_SECRET',
    required: false,
    minLength: 32,
  },
  {
    key: 'CORS_ALLOWED_ORIGINS',
    required: true,
  },
  {
    key: 'API_ACCESS_TOKEN',
    required: false,
    minLength: 16,
  },
  {
    key: 'ELECTRUM_TESTNET_URL',
    required: true,
    validate: (v) => (v.startsWith('wss://') || v.startsWith('ws://') ? null : 'Must start with wss:// or ws://'),
  },
  {
    key: 'WORKER_POLL_INTERVAL_MS',
    required: false,
    defaultValue: '30000',
    validate: (v) => (isNaN(parseInt(v)) ? 'Must be a number' : null),
  },
  {
    key: 'WORKER_DROPPED_THRESHOLD_MS',
    required: false,
    defaultValue: '1800000',
    validate: (v) => (isNaN(parseInt(v)) ? 'Must be a number' : null),
  },
  {
    key: 'PORT',
    required: false,
    defaultValue: '3001',
  },
  {
    key: 'HOST',
    required: false,
    defaultValue: '0.0.0.0',
  },
  {
    key: 'LOG_LEVEL',
    required: false,
    defaultValue: 'info',
    validate: (v) => (['debug', 'info', 'warn', 'error'].includes(v) ? null : 'Must be debug|info|warn|error'),
  },
];

/**
 * Validate all environment variables.
 * Returns array of error messages (empty = all valid).
 */
export function validateEnv(): string[] {
  const errors: string[] = [];

  for (const rule of ENV_RULES) {
    const value = process.env[rule.key];

    if (!value && rule.required) {
      errors.push(`${rule.key}: Required but not set`);
      continue;
    }

    if (!value) continue; // Optional and not set

    if (rule.minLength && value.length < rule.minLength) {
      errors.push(`${rule.key}: Must be at least ${rule.minLength} characters (got ${value.length})`);
    }

    if (rule.validate) {
      const err = rule.validate(value);
      if (err) {
        errors.push(`${rule.key}: ${err}`);
      }
    }
  }

  const hasSessionSecret = Boolean(process.env.SESSION_SECRET);
  const hasAccessToken = Boolean(process.env.API_ACCESS_TOKEN);
  if (!hasSessionSecret && !hasAccessToken) {
    errors.push('AUTH: Set SESSION_SECRET (JWT) or API_ACCESS_TOKEN (shared token)');
  }

  return errors;
}

/**
 * Validate env and fail-fast if errors found.
 * Call at server startup.
 */
export function assertEnv(): void {
  const errors = validateEnv();
  if (errors.length > 0) {
    console.error('Environment validation failed:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error('\nSee .env.example (repo root) for required variables.');
    process.exit(1);
  }
}

/**
 * Get validated env config with defaults applied.
 */
export function getEnvConfig(): EnvConfig {
  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    SESSION_SECRET: process.env.SESSION_SECRET,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS || '*',
    API_ACCESS_TOKEN: process.env.API_ACCESS_TOKEN,
    ELECTRUM_TESTNET_URL: process.env.ELECTRUM_TESTNET_URL!,
    WORKER_POLL_INTERVAL_MS: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '30000'),
    WORKER_DROPPED_THRESHOLD_MS: parseInt(process.env.WORKER_DROPPED_THRESHOLD_MS || '1800000'),
    PORT: parseInt(process.env.PORT || '3001'),
    HOST: process.env.HOST || '0.0.0.0',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
}
