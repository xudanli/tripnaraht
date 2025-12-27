// src/poi/poi.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { POILayerService } from './services/poi-layer.service';
import { POIRouteAffinityService } from './services/poi-route-affinity.service';

@Module({
  imports: [PrismaModule],
  providers: [POILayerService, POIRouteAffinityService],
  exports: [POILayerService, POIRouteAffinityService],
})
export class POIModule {}


