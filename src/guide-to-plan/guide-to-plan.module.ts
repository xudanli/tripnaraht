import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ConstraintEvaluationModule } from '../decision-runtime/constraints/constraint-evaluation.module';
import { CanonicalPlanSelectionModule } from '../decision-runtime/core/canonical-plan-selection.module';
import { GuardianDecisionCoreModule } from '../trips/guardian-decision-core/guardian-decision-core.module';
import { WorldStateSnapshotModule } from '../decision-runtime/snapshot/world-state-snapshot.module';
import { DecisionTriggerModule } from '../decision-runtime/trigger/decision-trigger.module';
import { VisionModule } from '../vision/vision.module';
import { LlmModule } from '../llm/llm.module';
import { RedisModule } from '../redis/redis.module';
import { FileExtractorDirectModule } from '../mcp/file-extractor-direct.module';
import { ExaModule } from '../mcp/exa.module';
import { TransportModule } from '../transport/transport.module';
import { TravelCompilerModule } from '../travel-compiler/travel-compiler.module';
import { GuideLinkFetchService } from './services/guide-link-fetch.service';
import { GuideToPlanController } from './guide-to-plan.controller';
import { GuideToPlanSessionService } from './guide-to-plan-session.service';
import { GuideIngestService } from './services/guide-ingest.service';
import { GuideParseService } from './services/guide-parse.service';
import { GuidePoiMatchService } from './services/guide-poi-match.service';
import { GuidePlanBuilderService } from './services/guide-plan-builder.service';
import { GuideTripMaterializerService } from './services/guide-trip-materializer.service';
import { GuideParseJobService } from './services/guide-parse-job.service';
import { GuideCrossGuideMergeService } from './services/guide-cross-guide-merge.service';
import { GuideDecisionBridgeService } from './services/guide-decision-bridge.service';
import { GuideCanonicalSelectionService } from './services/guide-canonical-selection.service';
import { GuideCanonicalAcceptService } from './services/guide-canonical-accept.service';
import { GuideCandidateGenerationProvider } from './providers/guide-candidate-generation.provider';
import { GuideParseProgressHub } from './services/guide-parse-progress-hub.service';
import { GuideParseProgressStreamService } from './services/guide-parse-progress-stream.service';
import { GuideToPlanOrchestrator } from './services/guide-to-plan.orchestrator';
import { GuidePoiGeoService } from './services/guide-poi-geo.service';
import { GuideRoutingGatewayService } from './services/guide-routing-gateway.service';
import { GuideRouteConstraintGateway } from './services/route-constraint/guide-route-constraint.gateway.service';
import { GenericRoadConstraintPack } from './services/route-constraint/generic-road-constraint.pack';
import { IcelandRoadConstraintPack } from './services/route-constraint/iceland-road-constraint.pack';
import { AttractionExploreModule } from '../trips/attraction-explore/attraction-explore.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => ConstraintEvaluationModule),
    forwardRef(() => CanonicalPlanSelectionModule),
    forwardRef(() => GuardianDecisionCoreModule),
    WorldStateSnapshotModule,
    DecisionTriggerModule,
    VisionModule,
    LlmModule,
    ConfigModule,
    RedisModule,
    FileExtractorDirectModule,
    ExaModule,
    TransportModule,
    TravelCompilerModule,
    forwardRef(() => AttractionExploreModule),
  ],
  controllers: [GuideToPlanController],
  providers: [
    GuideToPlanSessionService,
    GuideIngestService,
    GuideParseService,
    GuideLinkFetchService,
    GuidePoiMatchService,
    GuidePlanBuilderService,
    GuideTripMaterializerService,
    GuideCrossGuideMergeService,
    GuideDecisionBridgeService,
    GuideCanonicalSelectionService,
    GuideCanonicalAcceptService,
    GuideCandidateGenerationProvider,
    GuideParseProgressHub,
    GuideParseProgressStreamService,
    GuideToPlanOrchestrator,
    GuideParseJobService,
    GuidePoiGeoService,
    GuideRoutingGatewayService,
    GuideRouteConstraintGateway,
    GenericRoadConstraintPack,
    IcelandRoadConstraintPack,
  ],
  exports: [
    GuideToPlanSessionService,
    GuideIngestService,
    GuideParseService,
    GuidePoiMatchService,
    GuidePlanBuilderService,
    GuideTripMaterializerService,
    GuideCrossGuideMergeService,
    GuideToPlanOrchestrator,
    GuideParseJobService,
  ],
})
export class GuideToPlanModule {}
