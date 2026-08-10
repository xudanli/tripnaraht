import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FliggyDirectService } from './fliggy-direct.service';

@Module({
  imports: [ConfigModule],
  providers: [FliggyDirectService],
  exports: [FliggyDirectService],
})
export class FliggyDirectModule {}
