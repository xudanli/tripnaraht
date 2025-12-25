// src/trips/decision/decision.module.ts

/**
 * Decision Module
 * 
 * 决策层模块：整合 Abu、Dr.Dre、Neptune 三个策略
 */

import { Module } from '@nestjs/common';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { SenseToolsAdapter } from './adapters/sense-tools.adapter';
import { CandidatePoolService } from './candidates/candidate-pool.service';
import { TravelReliabilityService } from './travel/reliability.service';
import { EventTriggerService } from './events/event-trigger.service';
import { EvaluationService } from './evaluation/evaluation.service';
import { VersionService } from './versioning/version.service';
import { ExplainabilityService } from './explainability/explainability.service';
import { LearningService } from './learning/learning.service';
import { AdvancedConstraintsService } from './constraints/advanced-constraints.service';
import { ConstraintChecker } from './constraints/constraint-checker';
import { RouteDirectionConstraintsService } from './constraints/route-direction-constraints.service';
import { DecisionCacheService } from './performance/cache.service';
import { BatchProcessingService } from './performance/batch.service';
import { MonitoringService } from './monitoring/monitoring.service';
import { DecisionController } from './decision.controller';
import { TransportModule } from '../../transport/transport.module';
import { ReadinessModule } from '../readiness/readiness.module';
import { PlacesModule } from '../../places/places.module';
import { RouteDirectionsModule } from '../../route-directions/route-directions.module';
import { PoiFeaturesAdapterService } from './services/poi-features-adapter.service';

@Module({
  imports: [TransportModule, ReadinessModule, PlacesModule, RouteDirectionsModule],
  controllers: [DecisionController],
  providers: [
    TripDecisionEngineService,
    SenseToolsAdapter,
    CandidatePoolService,
    TravelReliabilityService,
    EventTriggerService,
    EvaluationService,
    VersionService,
    ExplainabilityService,
    LearningService,
    AdvancedConstraintsService,
    ConstraintChecker,
    RouteDirectionConstraintsService,
    DecisionCacheService,
    BatchProcessingService,
    MonitoringService,
    PoiFeaturesAdapterService,
  ],
  exports: [
    TripDecisionEngineService,
    CandidatePoolService,
    TravelReliabilityService,
    EventTriggerService,
    EvaluationService,
    VersionService,
    ExplainabilityService,
    LearningService,
    AdvancedConstraintsService,
    ConstraintChecker,
    RouteDirectionConstraintsService,
    DecisionCacheService,
    BatchProcessingService,
    MonitoringService,
    PoiFeaturesAdapterService,
  ],
})
export class DecisionModule {}

