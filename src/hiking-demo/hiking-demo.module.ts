import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DemModule } from '../trips/dem/dem.module';
import { TrailsModule } from '../trails/trails.module';
import { FactsToReadinessCompiler } from '../trips/readiness/compilers/facts-to-readiness.compiler';
import { TrailPlanningAdapter } from '../trips/decision/adapters/trail-planning.adapter';
import { HikingDemoController } from './hiking-demo.controller';
import { HikingDemoService } from './hiking-demo.service';
import { HikingReadinessController } from './hiking-readiness.controller';
import { HikingReadinessAuditService } from './hiking-readiness-audit.service';
import { HikingTrailDetailService } from './services/hiking-trail-detail.service';
import { HikingDetailOverrideService } from './services/hiking-detail-override.service';
import { HikingRouteReadinessService } from './hiking-route-readiness.service';
import { HikingOfflinePackController } from './hiking-offline-pack.controller';
import { HikingOfflinePackService } from './services/hiking-offline-pack.service';
import { HardTrekTripMetadataService } from './services/hard-trek-trip-metadata.service';

@Module({
  imports: [PrismaModule, DemModule, TrailsModule],
  controllers: [
    HikingDemoController,
    HikingReadinessController,
    HikingOfflinePackController,
  ],
  providers: [
    HikingDemoService,
    HikingReadinessAuditService,
    FactsToReadinessCompiler,
    TrailPlanningAdapter,
    HikingTrailDetailService,
    HikingDetailOverrideService,
    HikingRouteReadinessService,
    HikingOfflinePackService,
    HardTrekTripMetadataService,
  ],
  exports: [
    HikingDemoService,
    HikingReadinessAuditService,
    TrailPlanningAdapter,
    HikingTrailDetailService,
    HikingDetailOverrideService,
    HikingRouteReadinessService,
    HikingOfflinePackService,
    HardTrekTripMetadataService,
  ],
})
export class HikingDemoModule {}
