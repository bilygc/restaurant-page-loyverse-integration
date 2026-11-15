import { describe, expect, it } from 'vitest';
import { DISPLAY_MENU, estimateTotalCentavos, type CartLine } from './menu';

describe('DISPLAY_MENU', () => {
  it('lists the three POC items mirroring the server pricelist ids', () => {
    expect(DISPLAY_MENU.map((m) => m.menuItemId)).toEqual([
      'taco-pastor',
      'taco-asada',
      'refresco',
    ]);
  });

  it('holds only non-negative integer-centavo display estimates', () => {
    for (const item of DISPLAY_MENU) {
      expect(Number.isSafeInteger(item.estimateCentavos)).toBe(true);
      expect(item.estimateCentavos).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('estimateTotalCentavos', () => {
  it('returns 0 for an empty cart', () => {
    expect(estimateTotalCentavos([])).toBe(0);
  });

  it('multiplies quantity by the unit estimate with integer math only', () => {
    const lines: CartLine[] = [{ menuItemId: 'taco-pastor', quantity: 2, lineNote: '' }];
    expect(estimateTotalCentavos(lines)).toBe(7000);
  });

  it('sums mixed lines (2 x 3500 + 1 x 2500 = 9500)', () => {
    const lines: CartLine[] = [
      { menuItemId: 'taco-pastor', quantity: 2, lineNote: '' },
      { menuItemId: 'refresco', quantity: 1, lineNote: '' },
    ];
    expect(estimateTotalCentavos(lines)).toBe(9500);
  });

  it('throws on an unknown menu item instead of silently dropping it', () => {
    const lines: CartLine[] = [{ menuItemId: 'does-not-exist', quantity: 1, lineNote: '' }];
    expect(() => estimateTotalCentavos(lines)).toThrow(/Unknown menu item/);
  });

  it('throws on a non-positive quantity (shared money guard)', () => {
    const lines: CartLine[] = [{ menuItemId: 'taco-pastor', quantity: 0, lineNote: '' }];
    expect(() => estimateTotalCentavos(lines)).toThrow();
  });
});
