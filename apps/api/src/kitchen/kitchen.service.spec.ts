import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../common/errors';
import { InMemoryDatabase, newItem, newOrder } from '../testing/fakes';
import { KitchenService } from './kitchen.service';

const setup = () => new KitchenService(new InMemoryDatabase());

describe('KitchenService (flow C)', () => {
  it('recomputes totals server-side, ignoring the stored total column', async () => {
    const db = new InMemoryDatabase();
    // Stored total is deliberately wrong; the view must recompute from items.
    await db.insertOrder(newOrder({ total_centavos: 999999 }), [
      newItem({ quantity: 2, unit_price_centavos: 7500 }),
    ]);
    const svc = new KitchenService(db);
    const [view] = await svc.list();
    expect(view.total_centavos).toBe(15000);
  });

  it('filters by kitchen state', async () => {
    const db = new InMemoryDatabase();
    await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    await db.insertOrder(newOrder({ kitchen_state: 'listo' }), [newItem()]);
    const svc = new KitchenService(db);
    expect(await svc.list('listo')).toHaveLength(1);
    expect(await svc.list()).toHaveLength(2);
  });

  it('advances a valid transition and returns the recomputed view', async () => {
    const db = new InMemoryDatabase();
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const svc = new KitchenService(db);
    const view = await svc.advance(order.id, 'en_preparacion');
    expect(view.kitchen_state).toBe('en_preparacion');
    expect(view.total_centavos).toBe(15000);
  });

  it('rejects an invalid transition without changing the order', async () => {
    const db = new InMemoryDatabase();
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'nuevo' }), [newItem()]);
    const svc = new KitchenService(db);
    await expect(svc.advance(order.id, 'listo')).rejects.toBeInstanceOf(ConflictError);
    expect(db.orders.get(order.id)?.kitchen_state).toBe('nuevo');
  });

  it('rejects a transition from a terminal state', async () => {
    const db = new InMemoryDatabase();
    const { order } = await db.insertOrder(newOrder({ kitchen_state: 'entregado' }), [newItem()]);
    const svc = new KitchenService(db);
    await expect(svc.advance(order.id, 'entregado')).rejects.toBeInstanceOf(ConflictError);
  });

  it('returns NotFound for an unknown order', async () => {
    const svc = setup();
    await expect(svc.advance('does-not-exist', 'en_preparacion')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
