import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { LoyverseModule } from './loyverse/loyverse.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { OutboxModule } from './outbox/outbox.module';
import { PaymentsModule } from './payments/payments.module';

/**
 * Composition root. Global modules (Common, Config, Database) are imported once
 * and provide CLOCK / APP_CONFIG / DATABASE / APP_FILTER to every feature.
 * No feature module depends on another that depends back on it (no cycles).
 */
@Module({
  imports: [
    CommonModule,
    AppConfigModule,
    DatabaseModule,
    PaymentsModule,
    MenuModule,
    LoyverseModule,
    OutboxModule,
    OrdersModule,
    KitchenModule,
    // NotificationsModule (Resend/email) is intentionally NOT part of the POC
    // runtime (plan.md §9.1: emails are out of scope). It remains in the repo
    // for post-POC work but is never wired here.
  ],
})
export class AppModule {}
