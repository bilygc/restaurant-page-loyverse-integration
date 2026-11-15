import { describe, expect, it } from 'vitest';
import { PosGatewayError } from '../common/errors';
import { FakeClock } from '../common/clock';
import { FakeHttpClient, makeConfig } from '../testing/fakes';
import { LoyversePosGateway } from './loyverse-pos.gateway';

const setup = (config = makeConfig()) => {
  const http = new FakeHttpClient();
  const clock = new FakeClock(0);
  const gateway = new LoyversePosGateway(http, config, clock);
  return { http, clock, gateway };
};

const input = () => ({
  storeId: 'store-1',
  orderId: 'order-1',
  source: 'restaurant-web',
  diningOption: 'mesa 4',
  note: null,
  lineItems: [{ variantId: 'v1', quantity: 2 }],
  paymentTypeId: 'pay-1',
  totalCentavos: 15000,
});

describe('LoyversePosGateway (outbound boundary)', () => {
  it('POST /receipts and returns the receipt number', async () => {
    const { http, gateway } = setup();
    http.postHandler = async () => ({ receipt_number: 'R-100' });
    expect(await gateway.createReceipt(input())).toEqual({ receiptNumber: 'R-100' });
    expect(http.posts[0].path).toBe('/receipts');
  });

  it('GET /receipts?order=<id> reconciliation before retry', async () => {
    const { http, gateway } = setup();
    http.getHandler = async () => ({ receipts: [{ receipt_number: 'R-77' }] });
    expect(await gateway.findReceiptByOrder('order-1')).toEqual({ receiptNumber: 'R-77' });
    expect(http.gets[0].params).toEqual({ order: 'order-1' });
    http.getHandler = async () => ({ receipts: [] });
    expect(await gateway.findReceiptByOrder('order-2')).toBeNull();
  });

  it('GET /receipts/{number} canonical fetch', async () => {
    const { http, gateway } = setup();
    http.getHandler = async () => ({ receipt_number: 'R-1', line_items: [] });
    const r = await gateway.getReceipt('R-1');
    expect(r.receiptNumber).toBe('R-1');
    expect(http.gets[0].path).toBe('/receipts/R-1');
  });

  it('poller listReceipts uses store_id + updated_at_min and skips malformed entries', async () => {
    const { http, gateway } = setup();
    http.getHandler = async () => [
      { receipt_number: 'R-1' },
      { no_number: true },
      { receipt_number: 'R-2' },
    ];
    const list = await gateway.listReceipts({
      storeId: 'store-1',
      updatedAtMin: '2026-11-15T00:00:00.000Z',
    });
    expect(list.map((r) => r.receiptNumber)).toEqual(['R-1', 'R-2']);
    expect(http.gets[0].params?.['store_id']).toBe('store-1');
    expect(http.gets[0].params?.['updated_at_min']).toBe('2026-11-15T00:00:00.000Z');
    expect(http.gets[0].params?.['limit']).toBeGreaterThan(0);
  });

  it('poller follows a bounded cursor pagination through the same pipeline', async () => {
    const { http, gateway } = setup();
    let call = 0;
    http.getHandler = async () => {
      call += 1;
      return call === 1
        ? { receipts: [{ receipt_number: 'R-1' }], cursor: 'page-2' }
        : { receipts: [{ receipt_number: 'R-2' }], cursor: null };
    };
    const list = await gateway.listReceipts({
      storeId: 'store-1',
      updatedAtMin: '2026-11-15T00:00:00.000Z',
    });
    expect(list.map((r) => r.receiptNumber)).toEqual(['R-1', 'R-2']);
    expect(http.gets).toHaveLength(2);
    expect(http.gets[1].params?.['cursor']).toBe('page-2');
  });

  describe('boundary failure translation (never a raw error leaks)', () => {
    const errorCases: Array<[string, unknown, string]> = [
      ['401 auth', { response: { status: 401 } }, 'auth'],
      ['429 rate limit', { response: { status: 429 } }, 'rate_limit'],
      ['500 server', { response: { status: 503 } }, 'unavailable'],
      ['timeout', { code: 'ECONNABORTED' }, 'unavailable'],
      ['network drop', new Error('socket hang up'), 'unavailable'],
      ['400 invalid', { response: { status: 400 } }, 'invalid_request'],
    ];
    for (const [label, thrown, kind] of errorCases) {
      it(`translates ${label} into a typed, retryable PosGatewayError`, async () => {
        const { http, gateway } = setup();
        http.postHandler = async () => {
          throw thrown;
        };
        try {
          await gateway.createReceipt(input());
          throw new Error('expected rejection');
        } catch (err) {
          expect(err).toBeInstanceOf(PosGatewayError);
          expect((err as PosGatewayError).kind).toBe(kind);
          expect((err as PosGatewayError).retryable).toBe(true);
          expect((err as Error).message).not.toContain('sk_live');
          expect((err as Error).message).not.toContain('socket hang up');
        }
      });
    }
  });

  it('honours the 300/300s budget by refusing an over-limit call (rate_limit)', async () => {
    const { http, gateway } = setup(
      makeConfig({ loyverseRateLimit: 2, loyverseRateWindowMs: 300000 }),
    );
    http.getHandler = async () => ({ receipt_number: 'R-1', line_items: [] });
    await gateway.getReceipt('R-1');
    await gateway.getReceipt('R-2');
    await expect(gateway.getReceipt('R-3')).rejects.toMatchObject({ kind: 'rate_limit' });
  });
});
