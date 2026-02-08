import { Module } from '@nestjs/common';
import { RailService } from './rail.service';

@Module({
  providers: [RailService],
  exports: [RailService],
})
export class RailModule {}
