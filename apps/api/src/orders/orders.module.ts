import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [PaymentsModule, MenuModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
