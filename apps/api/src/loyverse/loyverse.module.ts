import { Module } from '@nestjs/common';
import { APP_CONFIG, LOYVERSE_HTTP, POS_GATEWAY } from '../common/tokens';
import type { AppConfig } from '../config/env';
import { AxiosLoyverseHttpClient } from './http-client';
import { IngestionService } from './ingestion.service';
import { LoyverseWebhookController } from './loyverse.controller';
import { LoyversePollerService } from './loyverse-poller.service';
import { LoyversePosGateway } from './loyverse-pos.gateway';

/** Bounded timeout for each Loyverse HTTP call (network boundary). */
const LOYVERSE_HTTP_TIMEOUT_MS = 8000;

@Module({
  controllers: [LoyverseWebhookController],
  providers: [
    {
      provide: LOYVERSE_HTTP,
      useFactory: (config: AppConfig) =>
        new AxiosLoyverseHttpClient(
          config.loyverseApiBaseUrl,
          config.loyverseAccessToken,
          LOYVERSE_HTTP_TIMEOUT_MS,
        ),
      inject: [APP_CONFIG],
    },
    { provide: POS_GATEWAY, useClass: LoyversePosGateway },
    IngestionService,
    LoyversePollerService,
  ],
  exports: [POS_GATEWAY, IngestionService, LOYVERSE_HTTP],
})
export class LoyverseModule {}
