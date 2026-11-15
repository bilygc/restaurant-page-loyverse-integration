import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database as DbTypes, Json } from '@restaurant/shared';
import { DatabaseError } from '../common/errors';
import { SUPABASE_CLIENT } from '../common/tokens';
import type {
  Database,
  InsertedWebhookEvent,
  NewOrder,
  NewOrderItem,
  OrderItemRow,
  OrderPatch,
  OrderRow,
  OrderWithItems,
  OutboxJobPatch,
  OutboxJobRow,
  WebhookEventRow,
} from './database.port';
import type { KitchenState } from '@restaurant/shared';

interface PostgrestLike<T> {
  data: T | null;
  error: { code?: string } | null;
}

/**
 * Supabase/Postgres adapter. Thin and typed against `database.types.ts`.
 * Every query is unwrapped through `run`, which converts connection errors,
 * Postgrest errors and null results into a typed DatabaseError and NEVER lets a
 * raw library error (which can contain connection strings / row data) escape.
 *
 * Note: this adapter requires a live local Supabase to exercise. Services are
 * unit-tested against the InMemoryDatabase fake instead; the boundary failure
 * path is covered in supabase.database.spec.ts with a throwing fake client.
 */
@Injectable()
export class SupabaseDatabase implements Database {
  constructor(@Inject(SUPABASE_CLIENT) private readonly client: SupabaseClient<DbTypes>) {}

  private async run<T>(label: string, op: () => PromiseLike<PostgrestLike<T>>): Promise<T> {
    let result: PostgrestLike<T>;
    try {
      result = await op();
    } catch (cause) {
      throw new DatabaseError(`${label} failed`, undefined, cause);
    }
    if (result.error) {
      throw new DatabaseError(`${label} failed`, result.error.code);
    }
    if (result.data === null || result.data === undefined) {
      throw new DatabaseError(`${label} returned no data`);
    }
    return result.data;
  }

  private first<T>(rows: T[], label: string): T {
    if (!rows[0]) throw new DatabaseError(`${label} returned no rows`);
    return rows[0];
  }

  async insertOrder(order: NewOrder, items: NewOrderItem[]): Promise<OrderWithItems> {
    const rows = await this.run<OrderRow[]>('insertOrder', () =>
      this.client.from('orders').insert(order).select('*'),
    );
    const inserted = this.first(rows, 'insertOrder');
    const itemRows = await this.run<OrderItemRow[]>('insertOrderItems', () =>
      this.client
        .from('order_items')
        .insert(items.map((item) => ({ ...item, order_id: inserted.id })))
        .select('*'),
    );
    return { order: inserted, items: itemRows };
  }

  async getOrderById(id: string): Promise<OrderRow | null> {
    const rows = await this.run<OrderRow[]>('getOrderById', () =>
      this.client.from('orders').select('*').eq('id', id).limit(1),
    );
    return rows[0] ?? null;
  }

  async getOrderWithItems(id: string): Promise<OrderWithItems | null> {
    const rows = await this.run<OrderRow[]>('getOrderWithItems:order', () =>
      this.client.from('orders').select('*').eq('id', id).limit(1),
    );
    const order = rows[0];
    if (!order) return null;
    const items = await this.run<OrderItemRow[]>('getOrderWithItems:items', () =>
      this.client.from('order_items').select('*').eq('order_id', id),
    );
    return { order, items };
  }

  async getOrderByReceiptNumber(receiptNumber: string): Promise<OrderRow | null> {
    const rows = await this.run<OrderRow[]>('getOrderByReceiptNumber', () =>
      this.client.from('orders').select('*').eq('loyverse_receipt_number', receiptNumber).limit(1),
    );
    return rows[0] ?? null;
  }

  async listOrdersByKitchenState(state?: KitchenState): Promise<OrderWithItems[]> {
    // Ordered oldest-first for the kitchen board; the (kitchen_state,
    // created_at) index serves this read. The worker also uses this with no
    // state filter, where the ordering is harmless.
    const orders = await this.run<OrderRow[]>('listOrdersByKitchenState', () => {
      const query = state
        ? this.client.from('orders').select('*').eq('kitchen_state', state)
        : this.client.from('orders').select('*');
      return query.order('created_at', { ascending: true });
    });
    if (orders.length === 0) return [];
    const ids = orders.map((row) => row.id);
    const items = await this.run<OrderItemRow[]>('listOrderItems', () =>
      this.client.from('order_items').select('*').in('order_id', ids),
    );
    const byOrder = new Map<string, OrderItemRow[]>();
    for (const item of items) {
      const list = byOrder.get(item.order_id) ?? [];
      list.push(item);
      byOrder.set(item.order_id, list);
    }
    return orders.map((order) => ({ order, items: byOrder.get(order.id) ?? [] }));
  }

  async updateOrder(id: string, patch: OrderPatch): Promise<OrderRow> {
    const rows = await this.run<OrderRow[]>('updateOrder', () =>
      this.client.from('orders').update(patch).eq('id', id).select('*'),
    );
    return this.first(rows, 'updateOrder');
  }

  async enqueueCreateReceiptJob(orderId: string, now: Date): Promise<OutboxJobRow> {
    const existing = await this.run<OutboxJobRow[]>('findOutboxJob', () =>
      this.client
        .from('outbox_jobs')
        .select('*')
        .eq('order_id', orderId)
        .eq('type', 'create_receipt')
        .in('status', ['pending', 'processing'])
        .limit(1),
    );
    if (existing[0]) return existing[0];
    const inserted = await this.run<OutboxJobRow[]>('enqueueCreateReceiptJob', () =>
      this.client
        .from('outbox_jobs')
        .insert({
          order_id: orderId,
          type: 'create_receipt',
          status: 'pending',
          attempts: 0,
          next_retry_at: now.toISOString(),
        })
        .select('*'),
    );
    return this.first(inserted, 'enqueueCreateReceiptJob');
  }

  async claimOutboxJobs(now: Date, limit: number): Promise<OutboxJobRow[]> {
    const rows = await this.run<OutboxJobRow[]>('claimOutboxJobs:select', () =>
      this.client
        .from('outbox_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('next_retry_at', now.toISOString())
        .order('next_retry_at', { ascending: true })
        .limit(limit),
    );
    // Conditional claim (status=pending) gives a best-effort atomic claim.
    // The POC assumes a single API instance; multi-instance row locking is a
    // documented follow-up (see report / oracle handoff).
    for (const row of rows) {
      await this.run<OutboxJobRow[]>('claimOutboxJobs:mark', () =>
        this.client
          .from('outbox_jobs')
          .update({ status: 'processing' })
          .eq('id', row.id)
          .eq('status', 'pending')
          .select('*'),
      );
    }
    return rows.map((row) => ({ ...row, status: 'processing' as const }));
  }

  async updateOutboxJob(id: string, patch: OutboxJobPatch): Promise<OutboxJobRow> {
    const rows = await this.run<OutboxJobRow[]>('updateOutboxJob', () =>
      this.client.from('outbox_jobs').update(patch).eq('id', id).select('*'),
    );
    return this.first(rows, 'updateOutboxJob');
  }

  async insertWebhookEventIfAbsent(
    receiptNumber: string,
    payload: Json,
  ): Promise<InsertedWebhookEvent> {
    try {
      const inserted = await this.run<WebhookEventRow[]>('insertWebhookEvent', () =>
        this.client
          .from('loyverse_webhook_events')
          .insert({ receipt_number: receiptNumber, payload, processed: false })
          .select('*'),
      );
      return { inserted: true, event: this.first(inserted, 'insertWebhookEvent') };
    } catch (err) {
      // Rely on the UNIQUE constraint, not just an application pre-check (H8).
      if (err instanceof DatabaseError && err.isUniqueViolation()) {
        const existing = await this.run<WebhookEventRow[]>('findWebhookEvent', () =>
          this.client
            .from('loyverse_webhook_events')
            .select('*')
            .eq('receipt_number', receiptNumber)
            .limit(1),
        );
        if (existing[0]) return { inserted: false, event: existing[0] };
      }
      throw err;
    }
  }

  async markWebhookEventProcessed(id: string): Promise<void> {
    await this.run<WebhookEventRow[]>('markWebhookEventProcessed', () =>
      this.client
        .from('loyverse_webhook_events')
        .update({ processed: true })
        .eq('id', id)
        .select('*'),
    );
  }
}
