import { Module } from '@nestjs/common';
import { LoyverseModule } from '../loyverse/loyverse.module';
import { OutboxWorker } from './outbox.worker';

/** Imports LoyverseModule for POS_GATEWAY; DATABASE / APP_CONFIG / CLOCK are global. */
@Module({
  imports: [LoyverseModule],
  providers: [OutboxWorker],
  exports: [OutboxWorker],
})
export class OutboxModule {}
