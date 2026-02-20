import { Module } from '@nestjs/common';
import { TransitousDirectService } from './transitous-direct.service';

@Module({
  providers: [TransitousDirectService],
  exports: [TransitousDirectService],
})
export class TransitousDirectModule {}
