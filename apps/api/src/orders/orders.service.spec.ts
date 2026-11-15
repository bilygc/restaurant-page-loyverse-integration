import { describe, expect, it } from 'vitest';
import { PaymentRequiredError, ValidationError } from '../common/errors';
import { FakeClock } from '../common/clock';
import { StaticMenuPricelist } from '../menu/menu-pricelist';
import { PaymentsService } from '../payments/payments.service';
import { FakePaymentGateway, InMemoryDatabase } from '../testing/fakes';
import { OrdersService } from './orders.service';

const setup = () => {
  const db = new InMemoryDatabase();
  const gateway = new FakePaymentGateway();
  const clock = new FakeClock(Date.parse('2026-11-15T12:00:00.000Z'));
  const svc = new OrdersService(db, new StaticMenuPricelist(), new PaymentsService(gateway), clock);
  return { db, gateway, clock, svc };
};

describe('OrdersService (flow A: server-owned prices, simulated payment)', () => {
  it('recomputes the total in integer centavos from server prices (client price ignored)', async () => {
    const { svc, db, gateway } = setup();
    const view = await svc.createOrder({
      items: [
        { menu_item_id: 'taco-pastor', quantity: 2 }, // 2 * 3500
        { menu_item_id: 'refresco', quantity: 1 }, // 1 * 2500
      ],
      note: null,
      dining_option: 'mesa 4',
    });
    expect(view.total_centavos).toBe(9500);
    expect(view.origin).toBe('web');
    expect(view.kitchen_state).toBe('nuevo');
    expect(view.sync_status).toBe('pending');
    expect(view.items[0].variant_id).toBe('variant-taco-pastor');
    expect(view.items[0].unit_price_centavos).toBe(3500);
    expect(gateway.charges[0].amountCentavos).toBe(9500);
    expect([...db.jobs.values()]).toHaveLength(1); // create_receipt job queued
  });

  it('rejects an unknown menu item and neither charges nor persists an order', async () => {
    const { svc, db, gateway } = setup();
    await expect(
      svc.createOrder({ items: [{ menu_item_id: 'not-on-menu', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(gateway.charges).toHaveLength(0);
    expect(db.orders.size).toBe(0);
  });

  it('does not persist an order when payment is declined (boundary)', async () => {
    const { svc, db, gateway } = setup();
    gateway.result = { status: 'declined', code: 'insufficient_funds' };
    await expect(
      svc.createOrder({ items: [{ menu_item_id: 'refresco', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(PaymentRequiredError);
    expect(db.orders.size).toBe(0);
  });

  it('translates a raw gateway/network error into a typed error (no unhandled raw error)', async () => {
    const { svc, db, gateway } = setup();
    gateway.throwOnCharge = true;
    await expect(
      svc.createOrder({ items: [{ menu_item_id: 'refresco', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(PaymentRequiredError);
    expect(db.orders.size).toBe(0);
  });

  it('never loses a paid order when the outbox enqueue fails (flow D / H6)', async () => {
    const { svc, db } = setup();
    db.enqueueCreateReceiptJob = async () => {
      throw new Error('connection reset by peer');
    };
    const view = await svc.createOrder({ items: [{ menu_item_id: 'refresco', quantity: 1 }] });
    expect(view.total_centavos).toBe(2500);
    expect(db.orders.size).toBe(1); // still recorded, still visible in kitchen
  });
});
