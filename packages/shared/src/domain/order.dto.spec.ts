import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_LENGTH,
  createOrderSchema,
  kitchenQuerySchema,
  orderViewSchema,
  patchKitchenStateSchema,
} from './order.dto';

describe('order DTOs (server owns prices)', () => {
  const validItem = { menu_item_id: 'taco-pastor', quantity: 2 };

  it('accepts a minimal valid order', () => {
    const parsed = createOrderSchema.parse({ items: [validItem] });
    expect(parsed.items[0].quantity).toBe(2);
  });

  it('ignores/rejects any client-supplied price field (prices are server-owned)', () => {
    expect(
      createOrderSchema.safeParse({
        items: [{ ...validItem, unit_price_centavos: 1, total_centavos: 1, price: 1 }],
      }).success,
    ).toBe(false);
    expect(createOrderSchema.safeParse({ items: [validItem], total_centavos: 999 }).success).toBe(
      false,
    );
  });

  it('rejects empty, oversized, and invalid item lists', () => {
    expect(createOrderSchema.safeParse({ items: [] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ items: Array(51).fill(validItem) }).success).toBe(false);
    expect(
      createOrderSchema.safeParse({ items: [{ menu_item_id: '', quantity: 1 }] }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({ items: [{ menu_item_id: 'x', quantity: 0 }] }).success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({ items: [{ menu_item_id: 'x', quantity: 1.5 }] }).success,
    ).toBe(false);
  });

  it('bounds untrusted text lengths (names / notes)', () => {
    expect(
      createOrderSchema.safeParse({ items: [validItem], note: 'a'.repeat(MAX_NOTE_LENGTH) })
        .success,
    ).toBe(true);
    expect(
      createOrderSchema.safeParse({ items: [validItem], note: 'a'.repeat(MAX_NOTE_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(
      createOrderSchema.safeParse({ items: [{ ...validItem, line_note: 'x'.repeat(1000) }] })
        .success,
    ).toBe(false);
  });

  it('validates kitchen state patch and query schemas', () => {
    expect(patchKitchenStateSchema.parse({ state: 'en_preparacion' }).state).toBe('en_preparacion');
    expect(patchKitchenStateSchema.safeParse({ state: 'cancelado' }).success).toBe(false);
    expect(patchKitchenStateSchema.safeParse({}).success).toBe(false);

    expect(kitchenQuerySchema.parse({})).toEqual({});
    expect(kitchenQuerySchema.parse({ state: 'listo' })).toEqual({ state: 'listo' });
    expect(kitchenQuerySchema.safeParse({ state: 'nope' }).success).toBe(false);
    expect(kitchenQuerySchema.safeParse({ state: 'listo', extra: 1 }).success).toBe(false);
  });

  it('parses a server-owned order view (totals are integer centavos)', () => {
    const view = {
      id: '11111111-1111-1111-1111-111111111111',
      origin: 'web',
      kitchen_state: 'nuevo',
      loyverse_receipt_number: null,
      sync_status: 'pending',
      total_centavos: 15000,
      dining_option: 'mesa 4',
      note: null,
      created_at: '2026-11-15T12:00:00.000Z',
      updated_at: '2026-11-15T12:00:00.000Z',
      items: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          menu_item_id: 'taco-pastor',
          variant_id: 'variant-1',
          item_name: 'Taco al pastor',
          quantity: 2,
          unit_price_centavos: 7500,
          line_note: null,
        },
      ],
    };
    expect(orderViewSchema.parse(view).total_centavos).toBe(15000);
    expect(orderViewSchema.safeParse({ ...view, total_centavos: 150.5 }).success).toBe(false);
  });
});
