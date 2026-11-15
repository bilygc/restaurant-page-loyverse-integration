import { describe, expect, it } from 'vitest';
import {
  KITCHEN_STATES,
  ORDER_ORIGINS,
  OUTBOX_JOB_STATUSES,
  OUTBOX_JOB_TYPES,
  SYNC_STATUSES,
  kitchenStateSchema,
  orderOriginSchema,
  outboxJobStatusSchema,
  outboxJobTypeSchema,
  syncStatusSchema,
} from './enums';

describe('shared enum value sets (single source of truth)', () => {
  it('matches the POC DB enum values exactly', () => {
    expect(ORDER_ORIGINS).toEqual(['web', 'pos']);
    expect(KITCHEN_STATES).toEqual(['nuevo', 'en_preparacion', 'listo', 'entregado']);
    expect(SYNC_STATUSES).toEqual(['pending', 'synced', 'failed']);
    expect(OUTBOX_JOB_TYPES).toEqual(['create_receipt']);
    expect(OUTBOX_JOB_STATUSES).toEqual(['pending', 'processing', 'done', 'failed']);
  });

  it('zod schemas accept every declared value and reject anything else', () => {
    expect(orderOriginSchema.parse('web')).toBe('web');
    expect(orderOriginSchema.parse('pos')).toBe('pos');
    expect(orderOriginSchema.safeParse('kiosk').success).toBe(false);

    for (const state of KITCHEN_STATES) {
      expect(kitchenStateSchema.parse(state)).toBe(state);
    }
    expect(kitchenStateSchema.safeParse('cancelado').success).toBe(false);

    for (const status of SYNC_STATUSES) {
      expect(syncStatusSchema.parse(status)).toBe(status);
    }
    expect(syncStatusSchema.safeParse('unknown').success).toBe(false);

    expect(outboxJobTypeSchema.parse('create_receipt')).toBe('create_receipt');
    expect(outboxJobTypeSchema.safeParse('refund').success).toBe(false);

    for (const status of OUTBOX_JOB_STATUSES) {
      expect(outboxJobStatusSchema.parse(status)).toBe(status);
    }
    expect(outboxJobStatusSchema.safeParse('queued').success).toBe(false);
  });
});
