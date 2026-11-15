import { Injectable } from '@nestjs/common';

export interface MenuItemPrice {
  menuItemId: string;
  itemName: string;
  loyverseVariantId: string;
  /** Integer centavos. Server-owned — the client can never supply a price. */
  unitPriceCentavos: number;
}

export interface MenuPricelist {
  get(menuItemId: string): MenuItemPrice | undefined;
  /** All server-owned items for GET /menu. Insertion order is the display order. */
  all(): MenuItemPrice[];
}

/**
 * Static, server-owned price catalog for the POC. The schema has no menu_items
 * table, so this is the authoritative price source until a menu table exists.
 * Prices are integer centavos; `loyverseVariantId` is the mapping used on the
 * Loyverse receipt (H1). Replace with a DB-backed provider when the menu is
 * introduced — the API contract does not change.
 */
@Injectable()
export class StaticMenuPricelist implements MenuPricelist {
  private readonly items = new Map<string, MenuItemPrice>([
    [
      'taco-pastor',
      {
        menuItemId: 'taco-pastor',
        itemName: 'Taco al pastor',
        loyverseVariantId: 'variant-taco-pastor',
        unitPriceCentavos: 3500,
      },
    ],
    [
      'taco-asada',
      {
        menuItemId: 'taco-asada',
        itemName: 'Taco de asada',
        loyverseVariantId: 'variant-taco-asada',
        unitPriceCentavos: 4200,
      },
    ],
    [
      'refresco',
      {
        menuItemId: 'refresco',
        itemName: 'Refresco',
        loyverseVariantId: 'variant-refresco',
        unitPriceCentavos: 2500,
      },
    ],
  ]);

  get(menuItemId: string): MenuItemPrice | undefined {
    return this.items.get(menuItemId);
  }

  all(): MenuItemPrice[] {
    return [...this.items.values()];
  }
}
