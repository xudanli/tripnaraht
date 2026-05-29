import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HikingDemoModule } from '../hiking-demo/hiking-demo.module';
import { RouteDirectionsModule } from '../route-directions/route-directions.module';
import { HikingRouteShareController } from './hiking-route-share.controller';
import { HikingRouteShareService } from './hiking-route-share.service';

@Module({
  imports: [PrismaModule, HikingDemoModule, RouteDirectionsModule],
  controllers: [HikingRouteShareController],
  providers: [HikingRouteShareService],
  exports: [HikingRouteShareService],
})
export class HikingRouteShareModule {}
