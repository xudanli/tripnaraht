import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { CanonicalPoiResolutionModule } from '../../canonical-poi-resolution/canonical-poi-resolution.module';
import { TravelCompilerModule } from '../../travel-compiler/travel-compiler.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { WorldStateSnapshotModule } from '../../decision-runtime/snapshot/world-state-snapshot.module';
import { TravelOntologyModule } from '../../travel-ontology/travel-ontology.module';
import { TransportModule } from '../../transport/transport.module';
import { LlmModule } from '../../llm/llm.module';
import { ExplorationController } from './exploration.controller';
import { ExplorationScenarioService } from './services/exploration-scenario.service';
import { ExplorationTripMaterializerService } from './services/exploration-trip-materializer.service';
import { ExplorationRouteGeometryCacheService } from './services/exploration-route-geometry-cache.service';
import { ExplorationTripConditionsSyncService } from './services/exploration-trip-conditions-sync.service';
import { LlmRouteNarrativeProvider } from './providers/llm-route-narrative.provider';
import { ExplorationOrchestratorService } from './services/exploration-orchestrator.service';
import { TravelDecisionContractPrincipleMappingService } from './services/travel-decision-contract-principle-mapping.service';
import { ConsumerExplorationIssuesService } from './services/consumer-exploration-issues.service';
import { ExplorationItinerarySeederService } from './services/exploration-itinerary-seeder.service';
import { ExplorationReliabilityService } from './services/exploration-reliability.service';
import { ExplorationPackageService } from './services/exploration-package.service';
import { ExplorationCheckJobStoreService } from './services/exploration-check-job.store';
import { ExplorationRouteDetailService } from './services/exploration-route-detail.service';
import { ExplorationConditionsService } from './services/exploration-conditions.service';
import { ExplorationCandidatesLifecycleService } from './services/exploration-candidates-lifecycle.service';
import { ExplorationRouteGenerationService } from './services/exploration-route-generation.service';
import { ExplorationPoiResolutionService } from './services/exploration-poi-resolution.service';
import { ExplorationPoiIssueBridgeService } from './services/exploration-poi-issue-bridge.service';
import { StaticArchetypeRouteProvider } from './providers/static-archetype-route.provider';
import { PersonalizedRouteProvider } from './providers/personalized-route.provider';
import { EngineGeometryRouteProvider } from './providers/engine-geometry-route.provider';
import { ExplorationPrincipleSummaryService } from './services/exploration-principle-summary.service';
import { ExplorationOntologyIssuesBridgeService } from './services/exploration-ontology-issues-bridge.service';
import { AttractionExploreModule } from '../attraction-explore/attraction-explore.module';

@Module({
  imports: [PrismaModule, AuthModule, CanonicalPoiResolutionModule, TravelCompilerModule, ConfigModule, TripConstraintSolverModule, DecisionGatewayModule, WorldStateSnapshotModule, TravelOntologyModule, TransportModule, LlmModule, forwardRef(() => AttractionExploreModule)],
  controllers: [ExplorationController],
  providers: [
    ExplorationScenarioService,
    ExplorationConditionsService,
    ExplorationRouteDetailService,
    ExplorationTripMaterializerService,
    ExplorationTripConditionsSyncService,
    ExplorationRouteGeometryCacheService,
    ExplorationCandidatesLifecycleService,
    StaticArchetypeRouteProvider,
    PersonalizedRouteProvider,
    EngineGeometryRouteProvider,
    LlmRouteNarrativeProvider,
    ExplorationRouteGenerationService,
    ExplorationPoiResolutionService,
    ExplorationPoiIssueBridgeService,
    ExplorationOntologyIssuesBridgeService,
    ExplorationOrchestratorService,
    TravelDecisionContractPrincipleMappingService,
    ConsumerExplorationIssuesService,
    ExplorationCheckJobStoreService,
    ExplorationReliabilityService,
    ExplorationItinerarySeederService,
    ExplorationPackageService,
    ExplorationPrincipleSummaryService,
  ],
  exports: [
    ExplorationScenarioService,
    ExplorationOrchestratorService,
    TravelDecisionContractPrincipleMappingService,
  ],
})
export class ExplorationModule {}
