import { z } from 'zod';
import { ConfigError, PaymentModeError } from '../common/errors';

/**
 * Application configuration. Environment values are read ONLY here (through
 * the @nestjs/config loader) and validated at boot. Error messages name the
 * offending VARIABLES, never their values, so secrets are never printed.
 */
export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly paymentMode: 'mock' | 'live';
  readonly port: number;
  readonly webAppOrigin: string;
  readonly supabaseUrl: string;
  readonly supabaseServiceRoleKey: string;
  readonly loyverseAccessToken: string;
  readonly loyverseApiBaseUrl: string;
  readonly loyverseStoreId: string;
  readonly loyversePaymentTypeId: string;
  readonly loyverseWebhookToken: string;
  readonly kitchenPin: string;
  readonly outboxMaxAttempts: number;
  readonly outboxBaseBackoffMs: number;
  readonly outboxMaxBackoffMs: number;
  readonly outboxPollIntervalMs: number;
  readonly outboxBatchSize: number;
  readonly loyversePollIntervalMs: number;
  readonly loyversePollLookbackMinutes: number;
  readonly loyverseRateLimit: number;
  readonly loyverseRateWindowMs: number;
  /** Schedulers are disabled under NODE_ENV=test so tests have no open handles. */
  readonly schedulersEnabled: boolean;
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PAYMENT_MODE: z.enum(['mock', 'live']).default('mock'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_APP_ORIGIN: z.string().min(1).default('http://localhost:3001'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  LOYVERSE_ACCESS_TOKEN: z.string().min(1),
  LOYVERSE_API_BASE_URL: z.string().url().default('https://api.loyverse.com/v1.0'),
  LOYVERSE_STORE_ID: z.string().min(1),
  LOYVERSE_PAYMENT_TYPE_ID: z.string().min(1),
  LOYVERSE_WEBHOOK_TOKEN: z.string().min(1),

  KITCHEN_PIN: z.string().min(4),

  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  OUTBOX_BASE_BACKOFF_MS: z.coerce.number().int().positive().default(1000),
  OUTBOX_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(60000),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(20),

  LOYVERSE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  LOYVERSE_POLL_LOOKBACK_MINUTES: z.coerce.number().int().positive().default(60),
  LOYVERSE_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  LOYVERSE_RATE_WINDOW_MS: z.coerce.number().int().positive().default(300000),
});

export type RawEnv = Record<string, string | undefined>;

/** Pure, testable boot-time validation + the mock-in-production boot guard. */
export function parseAppConfig(env: RawEnv): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || '(root)')),
    ];
    throw new ConfigError(
      `Invalid environment configuration. Check (names only): ${names.join(', ')}`,
    );
  }
  const v = parsed.data;

  // plan.md §9.5: the simulated payment must never boot in production.
  if (v.NODE_ENV === 'production' && v.PAYMENT_MODE === 'mock') {
    throw new PaymentModeError(
      'Refusing to boot: PAYMENT_MODE must not be "mock" when NODE_ENV=production',
    );
  }

  return Object.freeze<AppConfig>({
    nodeEnv: v.NODE_ENV,
    paymentMode: v.PAYMENT_MODE,
    port: v.PORT,
    webAppOrigin: v.WEB_APP_ORIGIN,
    supabaseUrl: v.SUPABASE_URL,
    supabaseServiceRoleKey: v.SUPABASE_SERVICE_ROLE_KEY,
    loyverseAccessToken: v.LOYVERSE_ACCESS_TOKEN,
    loyverseApiBaseUrl: v.LOYVERSE_API_BASE_URL,
    loyverseStoreId: v.LOYVERSE_STORE_ID,
    loyversePaymentTypeId: v.LOYVERSE_PAYMENT_TYPE_ID,
    loyverseWebhookToken: v.LOYVERSE_WEBHOOK_TOKEN,
    kitchenPin: v.KITCHEN_PIN,
    outboxMaxAttempts: v.OUTBOX_MAX_ATTEMPTS,
    outboxBaseBackoffMs: v.OUTBOX_BASE_BACKOFF_MS,
    outboxMaxBackoffMs: v.OUTBOX_MAX_BACKOFF_MS,
    outboxPollIntervalMs: v.OUTBOX_POLL_INTERVAL_MS,
    outboxBatchSize: v.OUTBOX_BATCH_SIZE,
    loyversePollIntervalMs: v.LOYVERSE_POLL_INTERVAL_MS,
    loyversePollLookbackMinutes: v.LOYVERSE_POLL_LOOKBACK_MINUTES,
    loyverseRateLimit: v.LOYVERSE_RATE_LIMIT,
    loyverseRateWindowMs: v.LOYVERSE_RATE_WINDOW_MS,
    schedulersEnabled: v.NODE_ENV !== 'test',
  });
}
