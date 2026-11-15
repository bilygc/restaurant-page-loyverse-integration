import { Module } from '@nestjs/common';
import { PaymentModeError } from '../common/errors';
import { APP_CONFIG, PAYMENT_GATEWAY } from '../common/tokens';
import type { AppConfig } from '../config/env';
import { MockPaymentGateway } from './mock-payment.gateway';
import { PaymentsService } from './payments.service';

/**
 * Chooses the payment gateway from PAYMENT_MODE. Defense-in-depth boot guard:
 * even if config validation were bypassed, a mock can never be wired in prod,
 * and the POC has no live gateway implementation at all.
 */
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (config: AppConfig) => {
        if (config.paymentMode === 'mock') {
          if (config.nodeEnv === 'production') {
            throw new PaymentModeError('Refusing to wire MockPaymentGateway in production');
          }
          return new MockPaymentGateway();
        }
        throw new PaymentModeError(
          'No live PaymentGateway is implemented in the POC; set PAYMENT_MODE=mock (non-production)',
        );
      },
      inject: [APP_CONFIG],
    },
    PaymentsService,
  ],
  exports: [PAYMENT_GATEWAY, PaymentsService],
})
export class PaymentsModule {}
