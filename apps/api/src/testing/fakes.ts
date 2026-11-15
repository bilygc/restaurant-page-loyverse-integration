import type { AppConfig } from '../config/env';
import type {
  ChargeInput,
  PaymentGateway,
  PaymentResult,
} from '../payments/payment-gateway.interface';
import type { HttpClient } from '../loyverse/http-client';
import type {
  CreateReceiptInput,
  ListReceiptsParams,
  NormalizedReceipt,
  PosGateway,
  ReceiptRef,
} from '../loyverse/pos-gateway.interface';
import type { Json, KitchenState } from '@restaurant/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database as DbTypes } from '@restaurant/shared';
import { DatabaseError } from '../common/errors';
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
} from '../database/database.port';

const T0 = '2026-11-15T12:00:00.000Z';

/** A deterministic, in-memory Database fake for unit tests (no live DB). */
export class InMemoryDatabase implements Database {
  readonly orders = new Map<string, OrderRow>();
  readonly items: OrderItemRow[] = [];
  readonly jobs = new Map<string, OutboxJobRow>();
  readonly events = new Map<string, WebhookEventRow>();
  private seq = 0;

  /** When true, every boundary call throws a typed DatabaseError. */
  failMode = false;

  private id(prefix: string): string {
    return `${prefix}-${++this.seq}`;
  }
  private guard(): void {
    if (this.failMode) throw new DatabaseError('simulated database failure');
  }

  async insertOrder(order: NewOrder, items: NewOrderItem[]): Promise<OrderWithItems> {
    this.guard();
    const id = order.id ?? this.id('order');
    const row: OrderRow = {
      id,
      origin: order.origin,
      kitchen_state: order.kitchen_state ?? 'nuevo',
      loyverse_receipt_number: order.loyverse_receipt_number ?? null,
      sync_status: order.sync_status ?? 'pending',
      total_centavos: order.total_centavos,
      dining_option: order.dining_option ?? null,
      note: order.note ?? null,
      created_at: order.created_at ?? T0,
      updated_at: order.updated_at ?? T0,
    };
    this.orders.set(id, row);
    const created: OrderItemRow[] = items.map((item) => {
      const rowItem: OrderItemRow = {
        id: this.id('item'),
        order_id: id,
        menu_item_id: item.menu_item_id ?? null,
        variant_id: item.variant_id ?? null,
        item_name: item.item_name,
        quantity: item.quantity ?? 1,
        unit_price_centavos: item.unit_price_centavos,
        line_note: item.line_note ?? null,
        created_at: T0,
        updated_at: T0,
      };
      this.items.push(rowItem);
      return rowItem;
    });
    return { order: row, items: created };
  }

  async getOrderById(id: string): Promise<OrderRow | null> {
    this.guard();
    return this.orders.get(id) ?? null;
  }

  async getOrderWithItems(id: string): Promise<OrderWithItems | null> {
    this.guard();
    const order = this.orders.get(id);
    if (!order) return null;
    return { order, items: this.items.filter((item) => item.order_id === id) };
  }

  async getOrderByReceiptNumber(receiptNumber: string): Promise<OrderRow | null> {
    this.guard();
    for (const row of this.orders.values()) {
      if (row.loyverse_receipt_number === receiptNumber) return row;
    }
    return null;
  }

  async listOrdersByKitchenState(state?: KitchenState): Promise<OrderWithItems[]> {
    this.guard();
    const result: OrderWithItems[] = [];
    for (const order of this.orders.values()) {
      if (state && order.kitchen_state !== state) continue;
      result.push({ order, items: this.items.filter((item) => item.order_id === order.id) });
    }
    return result;
  }

  async updateOrder(id: string, patch: OrderPatch): Promise<OrderRow> {
    this.guard();
    const current = this.orders.get(id);
    if (!current) throw new DatabaseError(`updateOrder: no order ${id.slice(0, 8)}`);
    const next = { ...current, ...patch, id: current.id } as OrderRow;
    this.orders.set(id, next);
    return next;
  }

  async enqueueCreateReceiptJob(orderId: string, now: Date): Promise<OutboxJobRow> {
    this.guard();
    for (const job of this.jobs.values()) {
      if (
        job.order_id === orderId &&
        job.type === 'create_receipt' &&
        (job.status === 'pending' || job.status === 'processing')
      ) {
        return job;
      }
    }
    const id = this.id('job');
    const job: OutboxJobRow = {
      id,
      order_id: orderId,
      type: 'create_receipt',
      status: 'pending',
      attempts: 0,
      next_retry_at: now.toISOString(),
      last_error: null,
      created_at: T0,
      updated_at: T0,
    };
    this.jobs.set(id, job);
    return job;
  }

  async claimOutboxJobs(now: Date, limit: number): Promise<OutboxJobRow[]> {
    this.guard();
    const due = [...this.jobs.values()]
      .filter((job) => job.status === 'pending' && Date.parse(job.next_retry_at) <= now.getTime())
      .sort((a, b) => Date.parse(a.next_retry_at) - Date.parse(b.next_retry_at))
      .slice(0, limit);
    for (const job of due) {
      this.jobs.set(job.id, { ...job, status: 'processing' });
    }
    return due.map((job) => ({ ...job, status: 'processing' as const }));
  }

  async updateOutboxJob(id: string, patch: OutboxJobPatch): Promise<OutboxJobRow> {
    this.guard();
    const current = this.jobs.get(id);
    if (!current) throw new DatabaseError(`updateOutboxJob: no job ${id.slice(0, 8)}`);
    const next = { ...current, ...patch, id: current.id } as OutboxJobRow;
    this.jobs.set(id, next);
    return next;
  }

  async insertWebhookEventIfAbsent(
    receiptNumber: string,
    payload: Json,
  ): Promise<InsertedWebhookEvent> {
    this.guard();
    for (const event of this.events.values()) {
      if (event.receipt_number === receiptNumber) return { inserted: false, event };
    }
    const id = this.id('event');
    const event: WebhookEventRow = {
      id,
      receipt_number: receiptNumber,
      payload,
      processed: false,
      created_at: T0,
      updated_at: T0,
    };
    this.events.set(id, event);
    return { inserted: true, event };
  }

  async markWebhookEventProcessed(id: string): Promise<void> {
    this.guard();
    const event = this.events.get(id);
    if (event) this.events.set(id, { ...event, processed: true });
  }
}

/** Minimal new-order helper for tests. */
export function newOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  return {
    origin: 'web',
    total_centavos: 15000,
    ...overrides,
  };
}

/** Minimal new-order-item helper for tests. */
export function newItem(overrides: Partial<NewOrderItem> = {}): NewOrderItem {
  return {
    item_name: 'Taco al pastor',
    quantity: 2,
    unit_price_centavos: 7500,
    ...overrides,
  };
}

export interface MockResponse {
  data: unknown;
  error: { code?: string } | null;
}

/**
 * Chainable supabase-js client mock for adapter boundary tests. Each awaited
 * query consumes the next scripted response (or throws if set to 'throw').
 */
export function makeSupabaseClientMock(
  responses: Array<MockResponse | 'throw'>,
): SupabaseClient<DbTypes> {
  let index = 0;
  const builder = {} as Record<string, unknown>;
  const chain = (): Record<string, unknown> => builder;
  for (const method of [
    'select',
    'insert',
    'update',
    'eq',
    'in',
    'lte',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    builder[method] = chain;
  }
  builder['then'] = (
    resolve: (value: MockResponse) => void,
    reject: (reason: unknown) => void,
  ): Promise<void> => {
    const scripted = responses[Math.min(index++, responses.length - 1)];
    if (scripted === 'throw') {
      return Promise.reject(new Error('ECONNREFUSED 127.0.0.1:54322')).then(resolve, reject);
    }
    return Promise.resolve(scripted ?? { data: null, error: null }).then(resolve, reject);
  };
  return { from: () => builder } as unknown as SupabaseClient<DbTypes>;
}

/** Complete, safe fake AppConfig for tests (no real secrets). */
export function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    paymentMode: 'mock',
    port: 3000,
    webAppOrigin: 'http://localhost:3001',
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseServiceRoleKey: 'test-service-role',
    loyverseAccessToken: 'test-loyverse-token',
    loyverseApiBaseUrl: 'https://api.loyverse.com/v1.0',
    loyverseStoreId: 'store-1',
    loyversePaymentTypeId: 'payment-type-1',
    loyverseWebhookToken: 'unguessable-url-token',
    kitchenPin: '1234',
    outboxMaxAttempts: 8,
    outboxBaseBackoffMs: 1000,
    outboxMaxBackoffMs: 60000,
    outboxPollIntervalMs: 5000,
    outboxBatchSize: 20,
    loyversePollIntervalMs: 15000,
    loyversePollLookbackMinutes: 60,
    loyverseRateLimit: 300,
    loyverseRateWindowMs: 300000,
    schedulersEnabled: false,
    ...overrides,
  };
}

/** Configurable fake PaymentGateway (no real money). */
export class FakePaymentGateway implements PaymentGateway {
  result: PaymentResult = { status: 'paid', reference: 'mock-ref' };
  throwOnCharge = false;
  readonly charges: ChargeInput[] = [];

  async charge(input: ChargeInput): Promise<PaymentResult> {
    this.charges.push(input);
    if (this.throwOnCharge) throw new Error('payment network down');
    return this.result;
  }
}

/** Programmable fake for the Loyverse HTTP boundary (no real network). */
export class FakeHttpClient implements HttpClient {
  postHandler: (path: string, body: unknown) => Promise<unknown> = async () => ({});
  getHandler: (path: string, params?: Record<string, string | number>) => Promise<unknown> =
    async () => [];
  readonly posts: Array<{ path: string; body: unknown }> = [];
  readonly gets: Array<{ path: string; params?: Record<string, string | number> }> = [];

  async post<T>(path: string, body: unknown): Promise<T> {
    this.posts.push({ path, body });
    return (await this.postHandler(path, body)) as T;
  }
  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    this.gets.push({ path, params });
    return (await this.getHandler(path, params)) as T;
  }
}

/** Build a canonical receipt for ingestion tests. */
export function makeReceipt(overrides: Partial<NormalizedReceipt> = {}): NormalizedReceipt {
  return {
    receiptNumber: 'R-POS-1',
    source: 'pos',
    order: null,
    createdAt: '2026-11-15T12:00:00.000Z',
    lineItems: [
      {
        variantId: 'variant-taco-asada',
        itemName: 'Taco de asada',
        quantity: 2,
        unitPriceCentavos: 4200,
        lineNote: 'sin cebolla',
      },
    ],
    totalCentavos: 8400,
    ...overrides,
  };
}

/** Programmable fake PosGateway for outbox / ingestion tests. */
export class FakePosGateway implements PosGateway {
  createResult: ReceiptRef = { receiptNumber: 'R-NEW' };
  findByOrderResult: ReceiptRef | null = null;
  getReceiptResult: NormalizedReceipt | null = null;
  listResult: NormalizedReceipt[] = [];
  throwOn: { create?: unknown; find?: unknown; get?: unknown; list?: unknown } = {};
  readonly createCalls: CreateReceiptInput[] = [];
  readonly findCalls: string[] = [];
  readonly getCalls: string[] = [];
  readonly listCalls: ListReceiptsParams[] = [];

  async createReceipt(input: CreateReceiptInput): Promise<ReceiptRef> {
    if (this.throwOn.create !== undefined) throw this.throwOn.create;
    this.createCalls.push(input);
    return this.createResult;
  }
  async findReceiptByOrder(orderId: string): Promise<ReceiptRef | null> {
    if (this.throwOn.find !== undefined) throw this.throwOn.find;
    this.findCalls.push(orderId);
    return this.findByOrderResult;
  }
  async getReceipt(receiptNumber: string): Promise<NormalizedReceipt> {
    if (this.throwOn.get !== undefined) throw this.throwOn.get;
    this.getCalls.push(receiptNumber);
    return this.getReceiptResult ?? makeReceipt({ receiptNumber });
  }
  async listReceipts(params: ListReceiptsParams): Promise<NormalizedReceipt[]> {
    if (this.throwOn.list !== undefined) throw this.throwOn.list;
    this.listCalls.push(params);
    return this.listResult;
  }
}
