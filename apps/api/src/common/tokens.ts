/**
 * Injection tokens. Every cross-boundary dependency is injected via an
 * explicit @Inject(TOKEN) token (never by type), so DI works even under the
 * Vitest/esbuild transform which does not emit decorator metadata.
 */

export const APP_CONFIG = 'APP_CONFIG';
export const CLOCK = 'CLOCK';
export const DATABASE = 'DATABASE';
export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';
export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';
export const POS_GATEWAY = 'POS_GATEWAY';
export const MENU_PRICELIST = 'MENU_PRICELIST';
export const LOYVERSE_HTTP = 'LOYVERSE_HTTP';

/** Header carrying the simple kitchen PIN (plan.md §9.7).
 * `X_KITCHEN_PIN_HEADER` is the task-canonical name; `KITCHEN_PIN_HEADER` is a
 * legacy alias. The guard accepts both so existing clients keep working. */
export const X_KITCHEN_PIN_HEADER = 'X-Kitchen-Pin';
export const KITCHEN_PIN_HEADER = 'KITCHEN_PIN';

/** Header carrying the unguessable webhook token (alternative to ?token=). */
export const X_WEBHOOK_TOKEN_HEADER = 'X-Webhook-Token';
