import { computeTotalCentavos } from '@restaurant/shared';
import type { OrderView } from '@restaurant/shared';
import type { OrderItemRow, OrderRow } from '../database/database.port';

/**
 * Build the server-owned order/kitchen view. The total is ALWAYS recomputed
 * from the sold-as line items (integer centavos), never trusted from the stored
 * `orders.total_centavos` column — this is the "server owns prices" invariant.
 */
export function toOrderView(order: OrderRow, items: OrderItemRow[]): OrderView {
  const total_centavos = computeTotalCentavos(
    items.map((item) => ({
      quantity: item.quantity,
      unitPriceCentavos: item.unit_price_centavos,
    })),
  );
  return {
    id: order.id,
    origin: order.origin,
    kitchen_state: order.kitchen_state,
    loyverse_receipt_number: order.loyverse_receipt_number,
    sync_status: order.sync_status,
    total_centavos,
    dining_option: order.dining_option,
    note: order.note,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: items.map((item) => ({
      id: item.id,
      menu_item_id: item.menu_item_id,
      variant_id: item.variant_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price_centavos: item.unit_price_centavos,
      line_note: item.line_note,
    })),
  };
}
