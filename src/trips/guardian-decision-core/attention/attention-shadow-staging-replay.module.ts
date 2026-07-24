/**
 * Minimal Nest bootstrap for Slice 4 staging real-DB shadow replay.
 * Imports DecisionGatewayModule (Unified Read Model) + shadow services only.
 */
import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { DecisionGatewayModule } from '../../../decision-runtime/gateway/decision-gateway.module';
import { AttentionOrchestrationShadowMetricsService } from '../shadow/attention-orchestration-shadow-metrics.service';
import { AttentionOrchestrationShadowRunnerService } from './attention-orchestration-shadow-runner.service';
import { AttentionShadowEvidenceWriter } from './attention-shadow-evidence.writer';

@Module({
  imports: [PrismaModule, forwardRef(() => DecisionGatewayModule)],
  providers: [
    AttentionOrchestrationShadowMetricsService,
    AttentionShadowEvidenceWriter,
    AttentionOrchestrationShadowRunnerService,
  ],
})
export class AttentionShadowStagingReplayModule {}
