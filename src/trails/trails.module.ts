// src/trails/trails.module.ts

import { Module } from '@nestjs/common';
import { TrailsService } from './trails.service';
import { TrailsController } from './trails.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TrailSupportServicesService } from './services/trail-support-services.service';
import { TrailCacheService } from './services/trail-cache.service';
import { SmartTrailPlannerService } from './services/smart-trail-planner.service';
import { TrailTrackingService } from './services/trail-tracking.service';

@Module({
  imports: [PrismaModule],
  controllers: [TrailsController],
  providers: [TrailsService, TrailSupportServicesService, TrailCacheService, SmartTrailPlannerService, TrailTrackingService],
  exports: [TrailsService, TrailSupportServicesService, TrailCacheService, SmartTrailPlannerService, TrailTrackingService],
})
export class TrailsModule {}

