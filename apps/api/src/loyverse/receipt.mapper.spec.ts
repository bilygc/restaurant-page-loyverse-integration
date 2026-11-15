import { describe, expect, it } from 'vitest';
import { RESTAURANT_WEB_SOURCE } from '@restaurant/shared';
import { PosGatewayError } from '../common/errors';
import {
  MAX_RECEIPT_NOTE_LENGTH,
  buildDiningOptionNote,
  buildReceiptCreatePayload,
  normalizeReceipt,
} from './receipt.mapper';

describe('buildReceiptCreatePayload (H1 / H5)', () => {
  it('builds store_id, writable order, source, single payment, variant+quantity lines', () => {
    const body = buildReceiptCreatePayload({
      storeId: 'store-1',
      orderId: 'our-order-id',
      source: RESTAURANT_WEB_SOURCE,
      diningOption: 'mesa 4',
      note: 'sin cebolla',
      lineItems: [
        { variantId: 'v1', quantity: 2 },
        { variantId: 'v2', quantity: 1 },
      ],
      paymentTypeId: 'pay-1',
      totalCentavos: 15000,
    });
    expect(body.store_id).toBe('store-1');
    expect(body.order).toBe('our-order-id');
    expect(body.source).toBe('restaurant-web');
    // dining_option is not writable -> carried in note (workaround)
    expect(body.note).toContain('dining_option: mesa 4');
    expect(body.note).toContain('sin cebolla');
    expect(body.line_items).toEqual([
      { variant_id: 'v1', quantity: 2 },
      { variant_id: 'v2', quantity: 1 },
    ]);
    expect(body.payments).toEqual([{ payment_type_id: 'pay-1', amount: '150.00' }]);
  });

  it('sanitizes/bounds untrusted note text', () => {
    const note = buildDiningOptionNote('mesa\u00001', 'x'.repeat(1000));
    expect(note.length).toBeLessThanOrEqual(MAX_RECEIPT_NOTE_LENGTH);
    expect(note).not.toContain('\u0000');
    expect(buildDiningOptionNote(null, null)).toBe('');
  });
});

describe('normalizeReceipt (canonical GET, untrusted shapes)', () => {
  it('normalizes a full receipt and recomputes total via the money helper', () => {
    const r = normalizeReceipt({
      receipt_number: 'R-1',
      source: 'pos',
      order: 'POS-9',
      created_at: '2026-11-15T12:00:00.000Z',
      line_items: [
        { variant_id: 'v1', quantity: 2, price: '42.00', item_name: 'Taco', note: 'sin cebolla' },
      ],
    });
    expect(r.receiptNumber).toBe('R-1');
    expect(r.order).toBe('POS-9');
    expect(r.lineItems[0].unitPriceCentavos).toBe(4200);
    expect(r.totalCentavos).toBe(8400);
  });

  it('accepts number prices and alternate field names', () => {
    const r = normalizeReceipt({
      receiptNumber: 'R-2',
      lineItems: [{ variantId: 'v', qty: 1, unit_price: 0.1 }],
    });
    expect(r.lineItems[0].unitPriceCentavos).toBe(10);
    expect(r.totalCentavos).toBe(10);
  });

  it('is defensive for partial / malformed payloads', () => {
    expect(normalizeReceipt({ receipt_number: 'R-3' }).totalCentavos).toBe(0);
    expect(normalizeReceipt({ receipt_number: 'R-4', line_items: 'nope' }).lineItems).toEqual([]);
    expect(
      normalizeReceipt({ receipt_number: 'R-5', line_items: [null, { quantity: 1 }] }).lineItems,
    ).toHaveLength(1);
    expect(() => normalizeReceipt(null)).toThrow(PosGatewayError);
    expect(() => normalizeReceipt({})).toThrow(PosGatewayError);
  });
});
