import { Module } from '@nestjs/common';
import { KitchenController } from './kitchen.controller';
import { KitchenPinGuard } from './kitchen-pin.guard';
import { KitchenService } from './kitchen.service';

@Module({
  controllers: [KitchenController],
  providers: [KitchenService, KitchenPinGuard],
})
export class KitchenModule {}
