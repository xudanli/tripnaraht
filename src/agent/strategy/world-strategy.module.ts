import { Module } from '@nestjs/common';
import { WorldStrategyService } from './world-strategy.service';

@Module({
  providers: [WorldStrategyService],
  exports: [WorldStrategyService],
})
export class WorldStrategyModule {}
