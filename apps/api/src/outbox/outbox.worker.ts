import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RESTAURANT_WEB_SOURCE, computeTotalCentavos } from '@restaurant/shared';
import type { Clock } from '../common/clock';
import type { AppConfig } from '../config/env';
import { APP_CONFIG, CLOCK, DATABASE, POS_GATEWAY } from '../common/tokens';
import { safeErrorTag } from '../common/util';
import type { Database, OrderWithItems, OutboxJobRow } from '../database/database.port';
import type { CreateReceiptInput, PosGateway } from '../loyverse/pos-gateway.interface';
import { computeBackoffMs } from './backoff';

/**
 * Transactional outbox worker (flow D / H6).
 *
 *  - Reconciles pending web orders that have no job (self-healing if enqueue
 *    failed at checkout).
 *  - Claims due jobs and, for each, LOOKS UP BY ORDER FIRST
 *    (GET /receipts?order=<id>) so a receipt created before a crash is never
 *    duplicated (idempotent retry).
 *  - On success stores receipt_number and sets sync_status pending -> synced.
 *  - On any POS/DB failure: the order stays recorded (still in the kitchen),
 *    sync_status stays/returns to pending, and the job is rescheduled with
 *    exponential backoff. After max attempts it is marked failed and an alert
 *    event is logged. Integration failures NEVER fail the payment flow.
 *  - Every boundary call is wrapped; no raw error escapes the worker.
 *
 * Assumes a single API instance for the POC (Render starter). Multi-instance
 * row locking (FOR UPDATE SKIP LOCKED / claim column) is a documented follow-up.
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(POS_GATEWAY) private readonly pos: PosGateway,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    if (!this.config.schedulersEnabled) return;
    this.timer = setInterval(() => {
      void this.processPending();
    }, this.config.outboxPollIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending(): Promise<void> {
    try {
      await this.reconcilePendingOrders();
    } catch (err) {
      this.logger.warn(`outbox reconcile failed: ${safeErrorTag(err)}`);
    }

    let jobs: OutboxJobRow[];
    try {
      jobs = await this.db.claimOutboxJobs(this.clock.now(), this.config.outboxBatchSize);
    } catch (err) {
      this.logger.warn(`outbox claim failed: ${safeErrorTag(err)}`);
      return;
    }

    for (const job of jobs) {
      try {
        await this.processJob(job);
      } catch (err) {
        // Last line of defence: never let a raw error escape to the scheduler.
        this.logger.warn(`outbox job error: ${safeErrorTag(err)}`);
      }
    }
  }

  /** Self-healing: any paid web order still pending gets an (idempotent) job. */
  private async reconcilePendingOrders(): Promise<void> {
    const all = await this.db.listOrdersByKitchenState(undefined);
    for (const { order } of all) {
      if (
        order.origin === 'web' &&
        order.sync_status === 'pending' &&
        !order.loyverse_receipt_number
      ) {
        try {
          await this.db.enqueueCreateReceiptJob(order.id, this.clock.now());
        } catch (err) {
          this.logger.warn(`outbox reconcile enqueue failed: ${safeErrorTag(err)}`);
        }
      }
    }
  }

  private async processJob(job: OutboxJobRow): Promise<void> {
    let withItems: OrderWithItems | null;
    try {
      withItems = await this.db.getOrderWithItems(job.order_id);
    } catch (err) {
      await this.reschedule(job, err);
      return;
    }
    if (!withItems) {
      await this.markDone(job); // order deleted (cascade); nothing to sync
      return;
    }

    const { order, items } = withItems;
    if (order.sync_status === 'synced' && order.loyverse_receipt_number) {
      await this.markDone(job);
      return;
    }

    try {
      // Idempotent retry: look up by order FIRST.
      const existing = await this.pos.findReceiptByOrder(order.id);
      if (existing) {
        await this.onSuccess(job, order.id, existing.receiptNumber);
        return;
      }

      const input: CreateReceiptInput = {
        storeId: this.config.loyverseStoreId,
        orderId: order.id,
        source: RESTAURANT_WEB_SOURCE,
        diningOption: order.dining_option,
        note: order.note,
        lineItems: items
          .filter((item) => item.variant_id !== null)
          .map((item) => ({ variantId: item.variant_id as string, quantity: item.quantity })),
        paymentTypeId: this.config.loyversePaymentTypeId,
        totalCentavos: computeTotalCentavos(
          items.map((item) => ({
            quantity: item.quantity,
            unitPriceCentavos: item.unit_price_centavos,
          })),
        ),
      };
      const ref = await this.pos.createReceipt(input);
      await this.onSuccess(job, order.id, ref.receiptNumber);
    } catch (err) {
      await this.reschedule(job, err);
    }
  }

  private async onSuccess(
    job: OutboxJobRow,
    orderId: string,
    receiptNumber: string,
  ): Promise<void> {
    try {
      await this.db.updateOrder(orderId, {
        loyverse_receipt_number: receiptNumber,
        sync_status: 'synced',
      });
      await this.db.updateOutboxJob(job.id, { status: 'done', last_error: null });
    } catch (err) {
      // Receipt exists in Loyverse but we failed to record it; the next retry
      // reconciles via findReceiptByOrder. Reschedule rather than lose the job.
      this.logger.warn(`outbox success-update failed: ${safeErrorTag(err)}`);
      await this.reschedule(job, err);
    }
  }

  private async markDone(job: OutboxJobRow): Promise<void> {
    try {
      await this.db.updateOutboxJob(job.id, { status: 'done', last_error: null });
    } catch (err) {
      this.logger.warn(`outbox mark-done failed: ${safeErrorTag(err)}`);
    }
  }

  private async reschedule(job: OutboxJobRow, err: unknown): Promise<void> {
    const attempts = job.attempts + 1;
    const tag = safeErrorTag(err);
    const terminal = attempts >= this.config.outboxMaxAttempts;
    if (terminal) {
      // Alert path (structured, names only — no PII/secrets, no stack).
      this.logger.error(`outbox.job.failed attempts_exhausted tag=${tag}`);
    }
    const delay = computeBackoffMs(
      attempts,
      this.config.outboxBaseBackoffMs,
      this.config.outboxMaxBackoffMs,
    );
    try {
      // The order is NEVER deleted: it stays recorded as paid and in the kitchen.
      await this.db.updateOrder(job.order_id, { sync_status: terminal ? 'failed' : 'pending' });
      await this.db.updateOutboxJob(job.id, {
        status: terminal ? 'failed' : 'pending',
        attempts,
        next_retry_at: terminal
          ? job.next_retry_at
          : new Date(this.clock.nowMs() + delay).toISOString(),
        last_error: tag,
      });
    } catch (dbErr) {
      this.logger.warn(`outbox status-update failed: ${safeErrorTag(dbErr)}`);
    }
  }
}
