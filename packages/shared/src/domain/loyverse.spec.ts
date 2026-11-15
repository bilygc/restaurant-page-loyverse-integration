import { describe, expect, it } from 'vitest';
import { RESTAURANT_WEB_SOURCE, extractReceiptNumbers, isEchoReceipt } from './loyverse';

describe('isEchoReceipt (H8: ignore our own receipts coming back)', () => {
  it('ignores anything we created (source === restaurant-web)', () => {
    expect(isEchoReceipt({ source: RESTAURANT_WEB_SOURCE, webOrderExists: false })).toBe(true);
    expect(
      isEchoReceipt({ source: RESTAURANT_WEB_SOURCE, orderId: 'x', webOrderExists: true }),
    ).toBe(true);
  });

  it('ignores a receipt whose writable `order` field matches one of our web orders', () => {
    expect(isEchoReceipt({ source: 'pos', orderId: 'our-order-id', webOrderExists: true })).toBe(
      true,
    );
    expect(isEchoReceipt({ source: null, orderId: 'our-order-id', webOrderExists: true })).toBe(
      true,
    );
  });

  it('keeps genuine POS receipts and unrelated receipts', () => {
    expect(isEchoReceipt({ source: 'pos', webOrderExists: false })).toBe(false);
    expect(isEchoReceipt({ source: null, webOrderExists: false })).toBe(false);
    expect(isEchoReceipt({ source: 'pos', orderId: 'unknown-id', webOrderExists: false })).toBe(
      false,
    );
    // webOrderExists alone is not enough: the receipt must carry the matching order id.
    expect(isEchoReceipt({ source: 'pos', orderId: null, webOrderExists: true })).toBe(false);
  });
});

describe('extractReceiptNumbers (untrusted webhook payload, never trusted as data)', () => {
  it('extracts from the common Loyverse shapes', () => {
    expect(extractReceiptNumbers({ receipt_number: 'R-1' })).toEqual(['R-1']);
    expect(extractReceiptNumbers({ data: { receipt_number: 'R-2' } })).toEqual(['R-2']);
    expect(extractReceiptNumbers({ receipts: [{ receipt_number: 'R-3' }] })).toEqual(['R-3']);
    expect(extractReceiptNumbers([{ receipt_number: 'R-4' }, { receipt_number: 'R-5' }])).toEqual([
      'R-4',
      'R-5',
    ]);
  });

  it('deduplicates and caps the number of candidates', () => {
    expect(
      extractReceiptNumbers({ receipt_number: 'R-1', data: { receipt_number: 'R-1' } }),
    ).toEqual(['R-1']);
    const many = Array.from({ length: 100 }, (_, i) => ({ receipt_number: `R-${i}` }));
    expect(extractReceiptNumbers({ receipts: many }).length).toBeLessThanOrEqual(25);
  });

  it('is safe for malformed / partial / hostile payloads', () => {
    expect(extractReceiptNumbers(null)).toEqual([]);
    expect(extractReceiptNumbers(undefined)).toEqual([]);
    expect(extractReceiptNumbers('a string')).toEqual([]);
    expect(extractReceiptNumbers({})).toEqual([]);
    expect(extractReceiptNumbers({ receipt_number: 12345 })).toEqual([]);
    expect(extractReceiptNumbers({ receipt_number: '' })).toEqual([]);
    expect(extractReceiptNumbers({ receipts: 'not-an-array' })).toEqual([]);
    expect(extractReceiptNumbers({ receipt_number: 'bad value with spaces' })).toEqual([]);
  });
});
