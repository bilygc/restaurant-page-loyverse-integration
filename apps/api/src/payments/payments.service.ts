import { Inject, Injectable } from '@nestjs/common';
import { PaymentRequiredError } from '../common/errors';
import { PAYMENT_GATEWAY } from '../common/tokens';
import type { ChargeInput, PaymentGateway, PaymentResult } from './payment-gateway.interface';

/**
 * Thin payment boundary. Translates any gateway/network error into a typed
 * error at the call site so a raw library error never escapes to the caller.
 */
@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway) {}

  async charge(input: ChargeInput): Promise<PaymentResult> {
    try {
      return await this.gateway.charge(input);
    } catch {
      throw new PaymentRequiredError('Payment could not be completed');
    }
  }
}
