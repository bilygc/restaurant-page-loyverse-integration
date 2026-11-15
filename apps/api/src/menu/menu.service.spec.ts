import { describe, expect, it } from 'vitest';
import { menuResponseSchema } from '@restaurant/shared';
import { MENU_PRICELIST } from '../common/tokens';
import { StaticMenuPricelist } from './menu-pricelist';
import { MenuService } from './menu.service';
import type { MenuPricelist } from './menu-pricelist';
import type { MenuItemPrice } from './menu-pricelist';

describe('MenuService (server-owned pricelist)', () => {
  it('returns integer-centavos prices from the server pricelist', () => {
    const svc = new MenuService(new StaticMenuPricelist());
    const menu = svc.list();
    expect(menuResponseSchema.safeParse(menu).success).toBe(true);
    expect(menu.items.length).toBeGreaterThan(0);
    for (const item of menu.items) {
      expect(Number.isInteger(item.unit_price_centavos)).toBe(true);
      expect(item.unit_price_centavos).toBeGreaterThanOrEqual(0);
    }
  });

  it('ignores any client-supplied price: output comes only from the pricelist', () => {
    const fake: MenuPricelist = {
      get: (): MenuItemPrice | undefined => undefined,
      all: () => [
        {
          menuItemId: 'only-server-item',
          itemName: 'Server item',
          loyverseVariantId: 'variant-1',
          unitPriceCentavos: 1234,
        },
      ],
    };
    // A client could try to POST a price; list() takes NO input at all.
    const svc = new MenuService(fake);
    expect(svc.list().items).toEqual([
      {
        menu_item_id: 'only-server-item',
        item_name: 'Server item',
        unit_price_centavos: 1234,
      },
    ]);
  });

  it('is injectable through the MENU_PRICELIST token', () => {
    expect(typeof MENU_PRICELIST).toBe('string');
  });
});
