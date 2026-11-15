import { Module } from '@nestjs/common';
import { LoyverseModule } from './loyverse/loyverse.module';
import { MenuModule } from './menu/menu.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [OrdersModule, PaymentsModule, MenuModule, LoyverseModule, NotificationsModule],
})
export class AppModule {}
