/**
 * Cart helpers for the customer POC flow, built ONLY from the SERVER-OWNED
 * menu returned by GET /menu (validated with the shared `menuResponseSchema`
 * in `lib/server-api.ts`). There is NO client-side pricelist duplication here.
 *
 * INVARIANT: prices are never defined or duplicated on the client. Every
 * `unit_price_centavos` comes from the API. `CreateOrderInput` carries only
 * menu_item_id + quantity + line_note; the server recomputes the centavos
 * total, and the charged amount is ALWAYS whatever POST /orders returns. The
 * estimate below is display-only.
 */
import { computeTotalCentavos } from '@restaurant/shared';
import type { MenuResponse } from '@restaurant/shared';

/** Result of loading the server menu, passed from the Server Component. */
export type MenuResult =
  | { status: 'ready'; menu: MenuResponse }
  | { status: 'closed' }
  | { status: 'error' };

export interface CartLine {
  menuItemId: string;
  quantity: number;
  lineNote: string;
}

/** Look up a server-owned menu item by id (pure). */
export function findMenuItem(menu: MenuResponse, menuItemId: string) {
  return menu.items.find((item) => item.menu_item_id === menuItemId);
}

/** Display name from the server menu; falls back to the id (rendered as text). */
export function menuItemName(menu: MenuResponse, menuItemId: string): string {
  return findMenuItem(menu, menuItemId)?.item_name ?? menuItemId;
}

/**
 * Display-only cart estimate in integer centavos, computed from the SERVER
 * menu prices. Unknown ids are ignored (defensive). Never sent to the API.
 */
export function estimateTotalCentavos(
  lines: readonly CartLine[],
  menu: MenuResponse,
): number {
  const priced = lines.flatMap((line) => {
    const item = findMenuItem(menu, line.menuItemId);
    if (!item) return [];
    return [{ quantity: line.quantity, unitPriceCentavos: item.unit_price_centavos }];
  });
  return computeTotalCentavos(priced);
}
