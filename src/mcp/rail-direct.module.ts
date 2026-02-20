import { Module } from '@nestjs/common';
import { RailDirectService } from './rail-direct.service';

@Module({
  providers: [RailDirectService],
  exports: [RailDirectService],
})
export class RailDirectModule {}
