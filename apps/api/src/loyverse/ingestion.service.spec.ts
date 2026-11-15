import { describe, expect, it } from 'vitest';
import { RESTAURANT_WEB_SOURCE } from '@restaurant/shared';
import { FakeClock } from '../common/clock';
import {
  FakePosGateway,
  InMemoryDatabase,
  makeConfig,
  makeReceipt,
  newItem,
  newOrder,
} from '../testing/fakes';
import { IngestionService } from './ingestion.service';

const setup = () => {
  const db = new InMemoryDatabase();
  const pos = new FakePosGateway();
  const clock = new FakeClock(Date.parse('2026-11-15T12:00:00.000Z'));
  const svc = new IngestionService(db, pos, clock, makeConfig());
  return { db, pos, clock, svc };
};

describe('IngestionService (flow B / H3 / H8)', () => {
  it('webhook: fetches the CANONICAL receipt, never trusts the untrusted body', async () => {
    const { db, pos, svc } = setup();
    // Body tries to inject fake prices; canonical GET is authoritative.
    pos.getReceiptResult = makeReceipt({ receiptNumber: 'R-1' });
    await svc.handleWebhook({
      receipt_number: 'R-1',
      line_items: [{ variant_id: 'evil', quantity: 99, price: 0.01 }],
    });
    expect(pos.getCalls).toEqual(['R-1']);
    expect(db.orders.size).toBe(1);
    const order = [...db.orders.values()][0];
    expect(order.origin).toBe('pos');
    expect(order.sync_status).toBe('synced');
    expect(order.loyverse_receipt_number).toBe('R-1');
    expect(order.total_centavos).toBe(8400); // from canonical receipt, not body
  });

  it('deduplicates by receipt_number (webhook + poller) so no double order (H8)', async () => {
    const { db, pos, svc } = setup();
    pos.getReceiptResult = makeReceipt();
    pos.listResult = [makeReceipt()];
    await svc.handleWebhook({ receipt_number: 'R-1' });
    await svc.poll();
    expect(db.orders.size).toBe(1);
    expect([...db.events.values()]).toHaveLength(1);
  });

  it('ignores our own echo (source === restaurant-web)', async () => {
    const { db, pos, svc } = setup();
    pos.getReceiptResult = makeReceipt({ source: RESTAURANT_WEB_SOURCE });
    await svc.handleWebhook({ receipt_number: 'R-1' });
    expect(db.orders.size).toBe(0);
  });

  it('ignores an echo whose writable order matches one of our web orders', async () => {
    const { db, pos, svc } = setup();
    const web = await db.insertOrder(newOrder({ id: 'web-1' }), [newItem()]);
    pos.getReceiptResult = makeReceipt({ order: web.order.id });
    await svc.handleWebhook({ receipt_number: 'R-ECHO' });
    expect(db.orders.size).toBe(1); // only the web order, no duplicate
  });

  it('is safe for malformed / partial webhook bodies', async () => {
    const { db, pos, svc } = setup();
    await svc.handleWebhook(null);
    await svc.handleWebhook({ nonsense: true });
    expect(pos.getCalls).toHaveLength(0);
    expect(db.orders.size).toBe(0);
  });

  it('does not throw an unhandled/raw error when canonical fetch fails (boundary)', async () => {
    const { db, pos, svc } = setup();
    pos.throwOn.get = new Error('ECONNREFUSED api.loyverse.com');
    await expect(svc.handleWebhook({ receipt_number: 'R-1' })).resolves.toBeUndefined();
    expect(db.orders.size).toBe(0);
  });

  it('does not throw an unhandled/raw error when the DB dedup insert fails (boundary)', async () => {
    const { db, pos, svc } = setup();
    pos.getReceiptResult = makeReceipt();
    db.failMode = true;
    await expect(svc.handleWebhook({ receipt_number: 'R-1' })).resolves.toBeUndefined();
  });

  it('poller ingests recent POS receipts and is idempotent', async () => {
    const { db, pos, svc } = setup();
    pos.listResult = [makeReceipt({ receiptNumber: 'R-A' }), makeReceipt({ receiptNumber: 'R-B' })];
    await svc.poll();
    expect(db.orders.size).toBe(2);
    await svc.poll();
    expect(db.orders.size).toBe(2);
  });

  it('poller survives a rate-limit / 5xx / timeout without throwing', async () => {
    const { pos, svc } = setup();
    pos.throwOn.list = { response: { status: 429 } };
    await expect(svc.poll()).resolves.toBeUndefined();
    pos.throwOn.list = new Error('timeout');
    await expect(svc.poll()).resolves.toBeUndefined();
  });

  it('poll uses store_id + updated_at_min (from the lookback window)', async () => {
    const { pos, svc } = setup();
    await svc.poll();
    expect(pos.listCalls).toHaveLength(1);
    expect(pos.listCalls[0].storeId).toBe('store-1');
    expect(typeof pos.listCalls[0].updatedAtMin).toBe('string');
    // 12:00:00Z minus the 60-minute default lookback.
    expect(pos.listCalls[0].updatedAtMin).toBe('2026-11-15T11:00:00.000Z');
  });

  it('webhook with no usable receipt candidates falls back to a poll', async () => {
    const { pos, svc, db } = setup();
    pos.listResult = [makeReceipt({ receiptNumber: 'R-FROM-POLL' })];
    await svc.handleWebhook({ undocumented_shape: true });
    expect(pos.getCalls).toHaveLength(0); // no candidate -> no canonical GET
    expect(pos.listCalls).toHaveLength(1); // ...instead it triggers a poll
    expect(db.orders.size).toBe(1);
  });
});
