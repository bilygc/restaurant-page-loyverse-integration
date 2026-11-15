import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { SystemClock } from './clock';
import { HealthController } from './health.controller';
import { CLOCK } from './tokens';

/** Global cross-cutting concerns: clock, exception filter, health endpoint. */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [CLOCK],
})
export class CommonModule {}
