// src/agent/agent.module.ts
import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './services/agent.service';
import { RouterService } from './services/router.service';
import { AgentStateService } from './services/agent-state.service';
import { ActionRegistryService } from './services/action-registry.service';
import { System1ExecutorService } from './services/system1-executor.service';
import { OrchestratorService } from './services/orchestrator.service';
import { CriticService } from './services/critic.service';
import { EventTelemetryService } from './services/event-telemetry.service';
import { ActionCacheService } from './services/action-cache.service';
import { RequestDeduplicationService } from './services/request-deduplication.service';
import { ActionDependencyAnalyzerService } from './services/action-dependency-analyzer.service';
import { LlmPlanService } from './services/llm-plan-service';
import { WebBrowseExecutorService } from './services/webbrowse-executor.service';
import { LlmModule } from '../llm/llm.module';
import { PlacesModule } from '../places/places.module';
import { TripsModule } from '../trips/trips.module';
import { ItineraryItemsModule } from '../itinerary-items/itinerary-items.module';
import { ItineraryOptimizationModule } from '../itinerary-optimization/itinerary-optimization.module';
import { TransportModule } from '../transport/transport.module';
import { PlanningPolicyModule } from '../planning-policy/planning-policy.module';
import { RailPassModule } from '../railpass/railpass.module';
import { ReadinessModule } from '../trips/readiness/readiness.module';
import { DecisionModule } from '../trips/decision/decision.module';
import { PlacesService } from '../places/places.service';
import { TripsService } from '../trips/trips.service';
import { ItineraryItemsService } from '../itinerary-items/itinerary-items.service';
import { VectorSearchService } from '../places/services/vector-search.service';
import { EntityResolutionService } from '../places/services/entity-resolution.service';
import { TransportRoutingService } from '../transport/transport-routing.service';
import { EnhancedVRPTWOptimizerService } from '../itinerary-optimization/services/enhanced-vrptw-optimizer.service';
import { FeasibilityService } from '../planning-policy/services/feasibility.service';
import { RailPassService } from '../railpass/railpass.service';
import { createTripActions } from './services/actions/trip.actions';
import { createPlacesActions } from './services/actions/places.actions';
import { createTransportActions } from './services/actions/transport.actions';
import { createItineraryActions } from './services/actions/itinerary.actions';
import { createPolicyActions } from './services/actions/policy.actions';
import { createWebBrowseActions } from './services/actions/webbrowse.actions';
import { createRailPassActions } from '../railpass/actions/railpass-agent-actions';
import { createReadinessActions } from './services/actions/readiness.actions';
import { ReadinessService } from '../trips/readiness/services/readiness.service';

/**
 * Agent Module
 * 
 * Module 14: Semantic Router + Orchestrator
 */
@Module({
  imports: [
    LlmModule,
    PlacesModule,
    TripsModule,
    ItineraryItemsModule,
    ItineraryOptimizationModule,
    TransportModule,
    PlanningPolicyModule,
    RailPassModule,
    ReadinessModule,
    DecisionModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    RouterService,
    AgentStateService,
    ActionRegistryService,
    System1ExecutorService,
    OrchestratorService,
    CriticService,
    EventTelemetryService,
    ActionCacheService,
    RequestDeduplicationService,
    ActionDependencyAnalyzerService,
    LlmPlanService,
    WebBrowseExecutorService,
  ],
  exports: [
    AgentService,
    ActionRegistryService,
  ],
})
export class AgentModule {
  constructor(
    private actionRegistry: ActionRegistryService,
    private placesService: PlacesService,
    private tripsService: TripsService,
    private itineraryItemsService: ItineraryItemsService,
    private webBrowseExecutor: WebBrowseExecutorService,
    private vectorSearchService?: VectorSearchService,
    private entityResolutionService?: EntityResolutionService,
    private transportRoutingService?: TransportRoutingService,
    private vrptwOptimizer?: EnhancedVRPTWOptimizerService,
    private feasibilityService?: FeasibilityService,
    private railPassService?: RailPassService,
    private readinessService?: ReadinessService,
  ) {
    // 注册基础 Actions（在模块初始化时）
    this.registerBasicActions();
  }

  /**
   * 注册基础 Actions
   */
  private registerBasicActions() {
    // 注册 Trip Actions
    const tripActions = createTripActions(this.tripsService, this.itineraryItemsService);
    this.actionRegistry.registerMany(tripActions);

    // 注册 Places Actions
    const placesActions = createPlacesActions(
      this.placesService,
      this.vectorSearchService,
      this.entityResolutionService
    );
    this.actionRegistry.registerMany(placesActions);

    // 注册 Transport Actions
    if (this.transportRoutingService) {
      const transportActions = createTransportActions(this.transportRoutingService);
      this.actionRegistry.registerMany(transportActions);
    }

    // 注册 Itinerary Actions
    if (this.vrptwOptimizer) {
      const itineraryActions = createItineraryActions(this.vrptwOptimizer);
      this.actionRegistry.registerMany(itineraryActions);
    }

    // 注册 Policy Actions
    if (this.feasibilityService) {
      const policyActions = createPolicyActions(this.feasibilityService);
      this.actionRegistry.registerMany(policyActions);
    }

    // 注册 WebBrowse Actions
    const webBrowseActions = createWebBrowseActions(this.webBrowseExecutor);
    this.actionRegistry.registerMany(webBrowseActions);

    // 注册 RailPass Actions
    if (this.railPassService) {
      const railPassActions = createRailPassActions(this.railPassService);
      this.actionRegistry.registerMany(railPassActions);
    }

    // 注册 Readiness Actions
    if (this.readinessService) {
      const readinessActions = createReadinessActions(this.readinessService);
      this.actionRegistry.registerMany(readinessActions);
    }
  }
}

