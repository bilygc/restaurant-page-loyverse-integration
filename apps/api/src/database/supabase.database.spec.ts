import { describe, expect, it } from 'vitest';
import { DatabaseError } from '../common/errors';
import { makeSupabaseClientMock, newItem, newOrder } from '../testing/fakes';
import { SupabaseDatabase } from './supabase.database';

describe('SupabaseDatabase boundary (Postgres/Supabase failures)', () => {
  it('translates a connection failure into a typed DatabaseError, never a raw error', async () => {
    const db = new SupabaseDatabase(makeSupabaseClientMock(['throw']));
    await expect(db.insertOrder(newOrder(), [newItem()])).rejects.toBeInstanceOf(DatabaseError);
    try {
      await new SupabaseDatabase(makeSupabaseClientMock(['throw'])).insertOrder(newOrder(), [
        newItem(),
      ]);
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError);
      expect((err as Error).message).not.toContain('ECONNREFUSED');
      expect((err as Error).message).not.toContain('54322');
    }
  });

  it('does not throw an unhandled/raw error out to its caller', async () => {
    const db = new SupabaseDatabase(
      makeSupabaseClientMock([{ data: null, error: { code: '42P01' } }]),
    );
    // schema drift (missing table) is translated, not surfaced as a raw Postgrest error
    const result = db.getOrderById('some-id').catch((err: unknown) => err);
    expect(await result).toBeInstanceOf(DatabaseError);
  });

  it('treats a UNIQUE violation on webhook events as an idempotent duplicate (H8)', async () => {
    const client = makeSupabaseClientMock([
      { data: null, error: { code: '23505' } },
      {
        data: [
          {
            id: 'evt-1',
            receipt_number: 'R-1',
            payload: {},
            processed: false,
            created_at: '2026-11-15T12:00:00.000Z',
            updated_at: '2026-11-15T12:00:00.000Z',
          },
        ],
        error: null,
      },
    ]);
    const db = new SupabaseDatabase(client);
    const result = await db.insertWebhookEventIfAbsent('R-1', {});
    expect(result.inserted).toBe(false);
    expect(result.event.receipt_number).toBe('R-1');
  });
});
