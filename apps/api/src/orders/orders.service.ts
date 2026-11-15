import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAX_NAME_LENGTH, MAX_NOTE_LENGTH, computeTotalCentavos } from '@restaurant/shared';
import type { CreateOrderInput, OrderView } from '@restaurant/shared';
import { PaymentRequiredError, ValidationError } from '../common/errors';
import { toOrderView } from '../common/order-view';
import { CLOCK, DATABASE, MENU_PRICELIST } from '../common/tokens';
import { boundedTextOrNull, safeErrorTag } from '../common/util';
import type { Clock } from '../common/clock';
import type { Database, NewOrderItem } from '../database/database.port';
import type { MenuPricelist } from '../menu/menu-pricelist';
import { PaymentsService } from '../payments/payments.service';

/**
 * Flow A (plan.md §9.3): web checkout. Prices are looked up server-side, the
 * total is recomputed in integer centavos, the simulated payment marks the
 * order paid, and a create_receipt outbox job is queued. An outbox/DB failure
 * NEVER loses the paid order (flow D / H6): the order is already persisted and
 * the worker reconciles pending orders that have no job.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MENU_PRICELIST) private readonly menu: MenuPricelist,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<OrderView> {
    const newItems: NewOrderItem[] = input.items.map((line) => {
      const price = this.menu.get(line.menu_item_id);
      if (!price) throw new ValidationError('Unknown menu item');
      return {
        menu_item_id: line.menu_item_id,
        item_name: price.itemName,
        variant_id: price.loyverseVariantId,
        quantity: line.quantity,
        unit_price_centavos: price.unitPriceCentavos,
        line_note: boundedTextOrNull(line.line_note, MAX_NOTE_LENGTH),
      };
    });

    const total = computeTotalCentavos(
      newItems.map((item) => ({
        quantity: item.quantity ?? 1,
        unitPriceCentavos: item.unit_price_centavos,
      })),
    );

    // Payment boundary is translated inside PaymentsService; a decline is a
    // typed error and never persists an order.
    const payment = await this.payments.charge({ amountCentavos: total, reference: 'checkout' });
    if (payment.status !== 'paid') {
      throw new PaymentRequiredError('Payment declined');
    }

    const { order, items } = await this.db.insertOrder(
      {
        origin: 'web',
        kitchen_state: 'nuevo',
        sync_status: 'pending',
        total_centavos: total,
        dining_option: boundedTextOrNull(input.dining_option, MAX_NAME_LENGTH),
        note: boundedTextOrNull(input.note, MAX_NOTE_LENGTH),
      },
      newItems,
    );

    // Never let an outbox/DB failure fail the paid order.
    try {
      await this.db.enqueueCreateReceiptJob(order.id, this.clock.now());
    } catch (err) {
      this.logger.warn(`outbox enqueue failed (order kept): ${safeErrorTag(err)}`);
    }

    return toOrderView(order, items);
  }
}
