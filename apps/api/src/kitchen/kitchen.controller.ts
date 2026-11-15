import { Body, Controller, Get, Inject, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { kitchenQuerySchema, patchKitchenStateSchema } from '@restaurant/shared';
import type { KitchenOrderView, KitchenQuery, PatchKitchenStateInput } from '@restaurant/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { KitchenPinGuard } from './kitchen-pin.guard';
import { KitchenService } from './kitchen.service';

/** Refresh cadence for the optional SSE board stream. */
const KITCHEN_STREAM_INTERVAL_MS = 5000;

/**
 * Kitchen board + advance-state endpoints. The task-canonical routes
 * (`/kitchen/orders`, `/kitchen/orders/:id/state`) are registered alongside
 * legacy aliases (`/kitchen`, `/orders/:id/kitchen-state`) so both the new
 * screen and existing clients keep working. All routes require the PIN.
 */
@Controller()
@UseGuards(KitchenPinGuard)
export class KitchenController {
  constructor(@Inject(KitchenService) private readonly kitchen: KitchenService) {}

  @Get(['kitchen', 'kitchen/orders'])
  list(
    @Query(new ZodValidationPipe(kitchenQuerySchema)) query: KitchenQuery,
  ): Promise<KitchenOrderView[]> {
    return this.kitchen.list(query.state);
  }

  @Patch(['orders/:id/kitchen-state', 'kitchen/orders/:id/state'])
  advance(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(patchKitchenStateSchema)) body: PatchKitchenStateInput,
  ): Promise<KitchenOrderView> {
    return this.kitchen.advance(id, body.state);
  }

  /**
   * Optional SSE feed (GET /kitchen/stream). Sends the board immediately and on
   * each tick; a database failure is swallowed so the stream never breaks with a
   * raw error. The timer is unref'd and torn down on connection close, so no
   * open handle survives a disconnect.
   */
  @Get('kitchen/stream')
  stream(@Res() response: Response): void {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const send = (): void => {
      if (response.writableEnded || response.destroyed) return;
      void this.kitchen
        .list()
        .then((orders) => {
          if (!response.writableEnded && !response.destroyed) {
            response.write(`data: ${JSON.stringify(orders)}\n\n`);
          }
        })
        .catch(() => {
          // Boundary failure: never break the stream, never log raw data.
        });
    };

    send();
    const timer = setInterval(send, KITCHEN_STREAM_INTERVAL_MS);
    timer.unref();
    response.on('close', () => clearInterval(timer));
  }
}
