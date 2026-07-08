import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OptimizationShadowMetricsCollector } from './optimization-shadow-metrics.collector';
import { ShadowObservabilityService } from './shadow-observability.service';
import { ShadowObservabilityAdminController } from './shadow-observability-admin.controller';
import { ShadowReviewService } from './shadow-review.service';
import { ShadowReviewController } from './shadow-review.controller';
import { ShadowEvidenceStore } from './shadow-evidence.store';

@Module({
  imports: [PrismaModule],
  controllers: [ShadowObservabilityAdminController, ShadowReviewController],
  providers: [
    OptimizationShadowMetricsCollector,
    ShadowObservabilityService,
    ShadowEvidenceStore,
    ShadowReviewService,
  ],
  exports: [
    ShadowObservabilityService,
    OptimizationShadowMetricsCollector,
    ShadowEvidenceStore,
    ShadowReviewService,
  ],
})
export class ShadowObservabilityModule {}
