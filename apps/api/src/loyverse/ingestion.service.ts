import { Inject, Injectable, Logger } from '@nestjs/common';
import { computeTotalCentavos, extractReceiptNumbers, isEchoReceipt } from '@restaurant/shared';
import type { Json } from '@restaurant/shared';
import type { Clock } from '../common/clock';
import type { AppConfig } from '../config/env';
import { APP_CONFIG, CLOCK, DATABASE, POS_GATEWAY } from '../common/tokens';
import { safeErrorTag } from '../common/util';
import type { Database, NewOrderItem } from '../database/database.port';
import type { NormalizedReceipt, PosGateway } from './pos-gateway.interface';

/**
 * Ingestion (flow B / H3 / H8):
 *  - Webhook `receipts.update` bodies are UNTRUSTED and unsigned; we only use
 *    them to find a receipt number, then FETCH THE CANONICAL receipt via GET.
 *  - A poller (GET /receipts?store_id&updated_at_min[&cursor]) provides eventual
 *    consistency and covers webhook loss / out-of-order delivery.
 *  - Dedup by receipt_number (UNIQUE). Echoes of our own web receipts
 *    (source=restaurant-web or `order` matches a web order) are ignored so a
 *    web order never appears twice in the kitchen (H8).
 *
 * Every boundary error is caught and translated to a log tag; a failed ingest
 * never throws a raw/unhandled error and never loses a web order. Unprocessed
 * events are retried by the poller on its next tick.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(POS_GATEWAY) private readonly pos: PosGateway,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Webhook entry: untrusted body -> canonical fetch -> ingest. */
  async handleWebhook(payload: unknown): Promise<void> {
    const candidates = extractReceiptNumbers(payload);
    if (candidates.length === 0) {
      // The receipts.update body is unsigned and UNDOCUMENTED (librarian). If it
      // carries no usable receipt number, fall back to the reliable poll path
      // (same ingestion pipeline) instead of silently dropping the signal.
      await this.poll();
      return;
    }
    for (const number of candidates) {
      try {
        const receipt = await this.pos.getReceipt(number);
        await this.ingestReceipt(receipt);
      } catch (err) {
        this.logger.warn(`webhook ingest failed: ${safeErrorTag(err)}`);
      }
    }
  }

  /** Poller entry: fetch recent receipts and ingest each (best-effort). */
  async poll(): Promise<void> {
    try {
      const lookbackMs = this.config.loyversePollLookbackMinutes * 60_000;
      const updatedAtMin = new Date(this.clock.nowMs() - lookbackMs).toISOString();
      const receipts = await this.pos.listReceipts({
        storeId: this.config.loyverseStoreId,
        updatedAtMin,
      });
      for (const receipt of receipts) {
        try {
          await this.ingestReceipt(receipt);
        } catch (err) {
          this.logger.warn(`poll ingest failed: ${safeErrorTag(err)}`);
        }
      }
    } catch (err) {
      // Rate limit / 5xx / timeout / auth: log only, next tick retries.
      this.logger.warn(`loyverse poll failed: ${safeErrorTag(err)}`);
    }
  }

  private async ingestReceipt(receipt: NormalizedReceipt): Promise<void> {
    const payload: Json = {
      receipt_number: receipt.receiptNumber,
      source: receipt.source,
      order: receipt.order,
    };

    // 1. Dedup by receipt_number (unique constraint / H8).
    const { inserted, event } = await this.db.insertWebhookEventIfAbsent(
      receipt.receiptNumber,
      payload,
    );
    if (!inserted && event.processed) return;

    // 2. Echo suppression (our own receipts coming back).
    let webOrderExists = false;
    if (receipt.order) {
      const existing = await this.db.getOrderById(receipt.order);
      webOrderExists = existing?.origin === 'web';
    }
    if (
      isEchoReceipt({
        source: receipt.source,
        orderId: receipt.order,
        webOrderExists,
      })
    ) {
      await this.db.markWebhookEventProcessed(event.id);
      return;
    }

    // 3. Second dedup guard: an order with this receipt already exists.
    const byReceipt = await this.db.getOrderByReceiptNumber(receipt.receiptNumber);
    if (byReceipt) {
      await this.db.markWebhookEventProcessed(event.id);
      return;
    }

    // 4. Create a POS order (already registered in Loyverse -> sync_status synced).
    const items: NewOrderItem[] = receipt.lineItems.map((line) => ({
      menu_item_id: null,
      variant_id: line.variantId,
      item_name: line.itemName ?? 'POS item',
      quantity: line.quantity,
      unit_price_centavos: line.unitPriceCentavos,
      line_note: line.lineNote,
    }));
    const total = computeTotalCentavos(
      items.map((item) => ({
        quantity: item.quantity ?? 1,
        unitPriceCentavos: item.unit_price_centavos,
      })),
    );
    await this.db.insertOrder(
      {
        origin: 'pos',
        kitchen_state: 'nuevo',
        loyverse_receipt_number: receipt.receiptNumber,
        sync_status: 'synced',
        total_centavos: total,
        dining_option: null,
        note: null,
      },
      items,
    );
    await this.db.markWebhookEventProcessed(event.id);
  }
}
