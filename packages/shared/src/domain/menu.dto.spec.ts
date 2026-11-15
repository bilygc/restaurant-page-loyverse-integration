import { describe, expect, it } from 'vitest';
import { menuItemViewSchema, menuResponseSchema } from './menu.dto';

describe('menu response contract (server-owned integer prices)', () => {
  it('accepts an integer-centavos menu item', () => {
    const parsed = menuItemViewSchema.parse({
      menu_item_id: 'taco-pastor',
      item_name: 'Taco al pastor',
      unit_price_centavos: 3500,
    });
    expect(parsed.unit_price_centavos).toBe(3500);
  });

  it('rejects a float / negative price (money must be integer centavos)', () => {
    expect(
      menuItemViewSchema.safeParse({
        menu_item_id: 'x',
        item_name: 'X',
        unit_price_centavos: 35.5,
      }).success,
    ).toBe(false);
    expect(
      menuItemViewSchema.safeParse({
        menu_item_id: 'x',
        item_name: 'X',
        unit_price_centavos: -1,
      }).success,
    ).toBe(false);
  });

  it('validates a full menu response shape', () => {
    expect(
      menuResponseSchema.safeParse({
        items: [
          { menu_item_id: 'a', item_name: 'A', unit_price_centavos: 100 },
          { menu_item_id: 'b', item_name: 'B', unit_price_centavos: 0 },
        ],
      }).success,
    ).toBe(true);
  });
});
