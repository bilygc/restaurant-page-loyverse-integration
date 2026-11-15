import { z } from 'zod';

/**
 * Single source of truth for the POC enum value sets used by the API contract.
 * These mirror the Postgres enums in `src/db/database.types.ts`
 * (migration 20261115120000). Zod schemas + TS types are both derived from the
 * same literal arrays so validation and types can never drift apart.
 */

export const ORDER_ORIGINS = ['web', 'pos'] as const;
export const orderOriginSchema = z.enum(ORDER_ORIGINS);
export type OrderOrigin = z.infer<typeof orderOriginSchema>;

export const KITCHEN_STATES = ['nuevo', 'en_preparacion', 'listo', 'entregado'] as const;
export const kitchenStateSchema = z.enum(KITCHEN_STATES);
export type KitchenState = z.infer<typeof kitchenStateSchema>;

export const SYNC_STATUSES = ['pending', 'synced', 'failed'] as const;
export const syncStatusSchema = z.enum(SYNC_STATUSES);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

export const OUTBOX_JOB_TYPES = ['create_receipt'] as const;
export const outboxJobTypeSchema = z.enum(OUTBOX_JOB_TYPES);
export type OutboxJobType = z.infer<typeof outboxJobTypeSchema>;

export const OUTBOX_JOB_STATUSES = ['pending', 'processing', 'done', 'failed'] as const;
export const outboxJobStatusSchema = z.enum(OUTBOX_JOB_STATUSES);
export type OutboxJobStatus = z.infer<typeof outboxJobStatusSchema>;
