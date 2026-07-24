import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HikingDemoModule } from '../hiking-demo/hiking-demo.module';
import { HikingPlansController } from './hiking-plans.controller';
import { HikingPlansService } from './hiking-plans.service';

@Module({
  imports: [PrismaModule, HikingDemoModule],
  controllers: [HikingPlansController],
  providers: [HikingPlansService],
  exports: [HikingPlansService],
})
export class HikingPlansModule {}
