import { Module } from '@nestjs/common';
import { LoyverseController } from './loyverse.controller';
import { LoyverseService } from './loyverse.service';

@Module({
  controllers: [LoyverseController],
  providers: [LoyverseService],
})
export class LoyverseModule {}
