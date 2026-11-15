import { Injectable } from '@nestjs/common';
import type { ChargeInput, PaymentGateway, PaymentResult } from './payment-gateway.interface';

/**
 * Simulated payment for the POC: marks the order as paid, moves no money, uses
 * no Stripe keys. Activation is controlled by PAYMENT_MODE and the boot guard
 * refuses to start with mock in production.
 */
@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  async charge(input: ChargeInput): Promise<PaymentResult> {
    return { status: 'paid', reference: `mock-${input.reference}` };
  }
}
