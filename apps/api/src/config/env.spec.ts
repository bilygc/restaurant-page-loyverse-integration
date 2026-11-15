import { describe, expect, it } from 'vitest';
import { ConfigError, PaymentModeError } from '../common/errors';
import { parseAppConfig } from './env';
import type { RawEnv } from './env';

const validEnv = (overrides: RawEnv = {}): RawEnv => ({
  NODE_ENV: 'development',
  PAYMENT_MODE: 'mock',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  LOYVERSE_ACCESS_TOKEN: 'loyverse-token',
  LOYVERSE_STORE_ID: 'store-1',
  LOYVERSE_PAYMENT_TYPE_ID: 'payment-type-1',
  LOYVERSE_WEBHOOK_TOKEN: 'unguessable-url-token',
  KITCHEN_PIN: '1234',
  ...overrides,
});

describe('parseAppConfig (boot-time validation)', () => {
  it('parses a valid environment and applies defaults', () => {
    const cfg = parseAppConfig(validEnv());
    expect(cfg.paymentMode).toBe('mock');
    expect(cfg.port).toBe(3000);
    expect(cfg.loyverseRateLimit).toBe(300);
    expect(cfg.loyverseRateWindowMs).toBe(300000);
    expect(cfg.schedulersEnabled).toBe(true);
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('disables schedulers in the test environment', () => {
    expect(parseAppConfig(validEnv({ NODE_ENV: 'test' })).schedulersEnabled).toBe(false);
  });

  describe('boot guard (plan.md §9.5)', () => {
    it('REFUSES to boot with mock payment in production', () => {
      expect(() =>
        parseAppConfig(validEnv({ NODE_ENV: 'production', PAYMENT_MODE: 'mock' })),
      ).toThrow(PaymentModeError);
    });
    it('allows mock outside production', () => {
      expect(() =>
        parseAppConfig(validEnv({ NODE_ENV: 'development', PAYMENT_MODE: 'mock' })),
      ).not.toThrow();
    });
    it('allows live in production', () => {
      expect(() =>
        parseAppConfig(validEnv({ NODE_ENV: 'production', PAYMENT_MODE: 'live' })),
      ).not.toThrow();
    });
    it('names the variables in the guard message but never prints values', () => {
      try {
        parseAppConfig(validEnv({ NODE_ENV: 'production', PAYMENT_MODE: 'mock' }));
      } catch (err) {
        expect((err as Error).message).toContain('PAYMENT_MODE');
        expect((err as Error).message).toContain('NODE_ENV');
      }
    });
  });

  describe('missing / malformed variables fail fast with names only', () => {
    it('names missing required variables', () => {
      const bad = validEnv();
      delete bad.KITCHEN_PIN;
      delete bad.SUPABASE_URL;
      try {
        parseAppConfig(bad);
        throw new Error('expected ConfigError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        const message = (err as Error).message;
        expect(message).toContain('KITCHEN_PIN');
        expect(message).toContain('SUPABASE_URL');
      }
    });

    it('never prints secret values in the error message', () => {
      const bad = validEnv({ SUPABASE_SERVICE_ROLE_KEY: 'super-secret-value' });
      delete bad.LOYVERSE_STORE_ID;
      try {
        parseAppConfig(bad);
      } catch (err) {
        expect((err as Error).message).not.toContain('super-secret-value');
      }
    });

    it('rejects a malformed URL', () => {
      const bad = validEnv({ SUPABASE_URL: 'not-a-url' });
      try {
        parseAppConfig(bad);
        throw new Error('expected ConfigError');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as Error).message).toContain('SUPABASE_URL');
      }
    });
  });
});
