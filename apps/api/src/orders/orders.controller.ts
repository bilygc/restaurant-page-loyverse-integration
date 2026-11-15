import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { createOrderSchema } from '@restaurant/shared';
import type { CreateOrderInput, OrderView } from '@restaurant/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
  ): Promise<OrderView> {
    return this.orders.createOrder(body);
  }
}
