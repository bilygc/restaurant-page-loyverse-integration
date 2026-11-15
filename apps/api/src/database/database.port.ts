import type { Json, KitchenState, Tables, TablesInsert, TablesUpdate } from '@restaurant/shared';

export type OrderRow = Tables<'orders'>;
export type OrderItemRow = Tables<'order_items'>;
export type OutboxJobRow = Tables<'outbox_jobs'>;
export type WebhookEventRow = Tables<'loyverse_webhook_events'>;

export type NewOrder = TablesInsert<'orders'>;
/** Line items are passed without order_id; the adapter attaches the new order's id. */
export type NewOrderItem = Omit<TablesInsert<'order_items'>, 'order_id'>;
export type OrderPatch = TablesUpdate<'orders'>;
export type OutboxJobPatch = TablesUpdate<'outbox_jobs'>;

export interface OrderWithItems {
  order: OrderRow;
  items: OrderItemRow[];
}

export interface InsertedWebhookEvent {
  inserted: boolean;
  event: WebhookEventRow;
}

/**
 * The database port (Postgres/Supabase boundary). Every method translates
 * library/unique/connection errors into typed DomainErrors at the call site;
 * the real adapter is never exercised against a live DB in this environment,
 * and all service tests replace this with an InMemoryDatabase fake.
 */
export interface Database {
  // orders
  insertOrder(order: NewOrder, items: NewOrderItem[]): Promise<OrderWithItems>;
  getOrderById(id: string): Promise<OrderRow | null>;
  getOrderWithItems(id: string): Promise<OrderWithItems | null>;
  getOrderByReceiptNumber(receiptNumber: string): Promise<OrderRow | null>;
  listOrdersByKitchenState(state?: KitchenState): Promise<OrderWithItems[]>;
  updateOrder(id: string, patch: OrderPatch): Promise<OrderRow>;

  // outbox jobs (create_receipt retry queue)
  enqueueCreateReceiptJob(orderId: string, now: Date): Promise<OutboxJobRow>;
  claimOutboxJobs(now: Date, limit: number): Promise<OutboxJobRow[]>;
  updateOutboxJob(id: string, patch: OutboxJobPatch): Promise<OutboxJobRow>;

  // webhook events (dedup by UNIQUE receipt_number, H8)
  insertWebhookEventIfAbsent(receiptNumber: string, payload: Json): Promise<InsertedWebhookEvent>;
  markWebhookEventProcessed(id: string): Promise<void>;
}
