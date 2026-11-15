import { describe, expect, it } from 'vitest';
import { FakeClock } from '../common/clock';
import { PosGatewayError } from '../common/errors';
import { FakePosGateway, InMemoryDatabase, makeConfig, newItem, newOrder } from '../testing/fakes';
import type { AppConfig } from '../config/env';
import { OutboxWorker } from './outbox.worker';

const T0 = Date.parse('2026-11-15T12:00:00.000Z');

const setup = (config: AppConfig = makeConfig()) => {
  const db = new InMemoryDatabase();
  const pos = new FakePosGateway();
  const clock = new FakeClock(T0);
  const worker = new OutboxWorker(db, pos, config, clock);

  const seed = async () => {
    const { order } = await db.insertOrder(newOrder({ origin: 'web', sync_status: 'pending' }), [
      newItem({ variant_id: 'variant-taco-pastor' }),
    ]);
    const job = await db.enqueueCreateReceiptJob(order.id, clock.now());
    return { order, job };
  };
  return { db, pos, clock, worker, seed };
};

describe('OutboxWorker (flow D / H6 / H1)', () => {
  it('creates the receipt, stores receipt_number and sets sync_status synced', async () => {
    const { db, pos, worker, seed } = setup();
    const { order, job } = await seed();
    await worker.processPending();

    expect(pos.createCalls).toHaveLength(1);
    expect(pos.createCalls[0].orderId).toBe(order.id);
    expect(pos.createCalls[0].source).toBe('restaurant-web');
    expect(pos.createCalls[0].storeId).toBe('store-1');
    expect(pos.createCalls[0].paymentTypeId).toBe('payment-type-1');
    expect(pos.createCalls[0].totalCentavos).toBe(15000);
    expect(pos.createCalls[0].lineItems).toEqual([
      { variantId: 'variant-taco-pastor', quantity: 2 },
    ]);
    const updated = db.orders.get(order.id);
    expect(updated?.loyverse_receipt_number).toBe('R-NEW');
    expect(updated?.sync_status).toBe('synced');
    expect(db.jobs.get(job.id)?.status).toBe('done');
  });

  it('is idempotent: a receipt found by order FIRST is never created twice', async () => {
    const { db, pos, worker, seed } = setup();
    const { order } = await seed();
    pos.findByOrderResult = { receiptNumber: 'R-ALREADY' };
    await worker.processPending();

    expect(pos.findCalls).toContain(order.id);
    expect(pos.createCalls).toHaveLength(0);
    expect(db.orders.get(order.id)?.loyverse_receipt_number).toBe('R-ALREADY');
    expect(db.orders.get(order.id)?.sync_status).toBe('synced');
  });

  it('skips an order already synced', async () => {
    const { db, pos, worker } = setup();
    const { order } = await db.insertOrder(
      newOrder({ sync_status: 'synced', loyverse_receipt_number: 'R-X' }),
      [newItem()],
    );
    await db.enqueueCreateReceiptJob(order.id, new Date(T0));
    await worker.processPending();
    expect(pos.createCalls).toHaveLength(0);
    expect(pos.findCalls).toHaveLength(0);
  });

  it('self-heals a pending order that has no outbox job (enqueue failed at checkout)', async () => {
    const { db, pos, worker } = setup();
    await db.insertOrder(newOrder({ sync_status: 'pending' }), [newItem({ variant_id: 'v1' })]);
    expect([...db.jobs.values()]).toHaveLength(0);
    await worker.processPending();
    expect([...db.jobs.values()]).toHaveLength(1);
    expect(pos.createCalls).toHaveLength(1);
    expect([...db.orders.values()][0].sync_status).toBe('synced');
  });

  it('keeps the paid order on a POS rate-limit failure and reschedules with backoff', async () => {
    const { db, pos, worker, seed, clock } = setup();
    const { order, job } = await seed();
    pos.throwOn.create = new PosGatewayError('rate limited', 'rate_limit');
    await expect(worker.processPending()).resolves.toBeUndefined();

    expect(db.orders.get(order.id)).toBeDefined(); // never lost
    expect(db.orders.get(order.id)?.sync_status).toBe('pending');
    const rescheduled = db.jobs.get(job.id);
    expect(rescheduled?.status).toBe('pending');
    expect(rescheduled?.attempts).toBe(1);
    expect(Date.parse(rescheduled!.next_retry_at)).toBeGreaterThan(clock.nowMs());
    expect(rescheduled?.last_error).toContain('POS_GATEWAY');
  });

  it('translates an auth (401) failure into a retry, never a raw error', async () => {
    const { db, pos, worker, seed } = setup();
    const { job } = await seed();
    pos.throwOn.create = new PosGatewayError('token expired', 'auth');
    await expect(worker.processPending()).resolves.toBeUndefined();
    expect(db.jobs.get(job.id)?.status).toBe('pending');
    expect(db.jobs.get(job.id)?.attempts).toBe(1);
  });

  it('marks the job failed after max attempts but NEVER deletes the order (alert path)', async () => {
    const { db, pos, worker, seed } = setup(makeConfig({ outboxMaxAttempts: 1 }));
    const { order, job } = await seed();
    pos.throwOn.create = new PosGatewayError('5xx', 'unavailable');
    await worker.processPending();
    expect(db.jobs.get(job.id)?.status).toBe('failed');
    expect(db.orders.get(order.id)).toBeDefined();
    expect(db.orders.get(order.id)?.sync_status).toBe('failed');
  });

  it('does not throw an unhandled/raw error when the DB claim fails (boundary)', async () => {
    const { db, worker } = setup();
    db.failMode = true;
    await expect(worker.processPending()).resolves.toBeUndefined();
  });
});
