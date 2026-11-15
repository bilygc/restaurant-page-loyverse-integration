import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { AppConfig } from '../config/env';
import { APP_CONFIG } from '../common/tokens';
import { IngestionService } from './ingestion.service';

/**
 * In-process poller. Disabled in NODE_ENV=test so tests have no open handles.
 * The POC assumes a single API instance; `poll()` is idempotent (dedup by
 * receipt_number) so an occasional overlap is safe.
 */
@Injectable()
export class LoyversePollerService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(IngestionService) private readonly ingestion: IngestionService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.schedulersEnabled) return;
    this.timer = setInterval(() => {
      void this.ingestion.poll();
    }, this.config.loyversePollIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
