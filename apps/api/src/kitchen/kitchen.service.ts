import { Inject, Injectable } from '@nestjs/common';
import { canTransition, isKitchenBoardState } from '@restaurant/shared';
import type { KitchenOrderView, KitchenState } from '@restaurant/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { toOrderView } from '../common/order-view';
import { DATABASE } from '../common/tokens';
import type { Database } from '../database/database.port';

/**
 * Kitchen board (flow C). Web and POS orders are treated identically. State
 * transitions are validated against the single shared state machine. Totals in
 * every view are recomputed server-side from line items (toOrderView).
 *
 * The board shows ONLY the three active columns (nuevo / en_preparacion / listo)
 * ordered oldest-first by created_at; `entregado` has left the board. An
 * explicit ?state= query still allows looking at any single state (e.g. for the
 * human H-tests). Both the filter and the ordering are applied here so they hold
 * regardless of the database adapter.
 */
@Injectable()
export class KitchenService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(state?: KitchenState): Promise<KitchenOrderView[]> {
    const rows = await this.db.listOrdersByKitchenState(state);
    const visible = state
      ? rows
      : rows.filter(({ order }) => isKitchenBoardState(order.kitchen_state));
    return [...visible]
      .sort((a, b) => a.order.created_at.localeCompare(b.order.created_at))
      .map(({ order, items }) => toOrderView(order, items));
  }

  async advance(id: string, next: KitchenState): Promise<KitchenOrderView> {
    const existing = await this.db.getOrderWithItems(id);
    if (!existing) throw new NotFoundError('Order not found');
    if (!canTransition(existing.order.kitchen_state, next)) {
      throw new ConflictError(
        `Invalid kitchen transition: ${existing.order.kitchen_state} -> ${next}`,
      );
    }
    const updated = await this.db.updateOrder(id, { kitchen_state: next });
    return toOrderView(updated, existing.items);
  }
}
