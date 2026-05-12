import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { WorldFactRepository } from './world-fact.repository';
import { WorldFactService } from './world-fact.service';
import { ResearchWorldFactShadowIngestorService } from './research-world-fact-shadow-ingestor.service';
import { WorldFactReadinessProjectionService } from './world-fact-readiness-projection.service';
import { WorldFactResolverService } from './world-fact-resolver.service';
import { WorldFactsController } from './world-facts.controller';
import { TripExplainabilityService } from './explainability/trip-explainability.service';
import { TripExplainabilityController } from './explainability/trip-explainability.controller';
import { DecisionAwarenessAugmentationService } from './decision-awareness-augmentation.service';
import { DecisionActionExecutorService } from './decision-action-executor.service';
import { DecisionExecutionReconciliationService } from './decision-execution-reconciliation.service';
import { ExecutionPlanningContextService } from './execution-planning-context.service';
import { RoutePlanningPolicyConfigService } from './route-planning-policy-config.service';
import { RoutePlanningPolicyRegistryService } from './route-planning-policy-registry.service';
import { RoutePlanningPolicyEngineService } from './route-planning-policy-engine.service';
import { DecisionFactorFactoryService } from './decision-factor.factory';
import { PolicySelectionLogService } from './policy-selection-log.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [WorldFactsController, TripExplainabilityController],
  providers: [
    WorldFactRepository,
    WorldFactService,
    WorldFactResolverService,
    ResearchWorldFactShadowIngestorService,
    WorldFactReadinessProjectionService,
    DecisionFactorFactoryService,
    DecisionActionExecutorService,
    DecisionExecutionReconciliationService,
    ExecutionPlanningContextService,
    RoutePlanningPolicyRegistryService,
    RoutePlanningPolicyConfigService,
    PolicySelectionLogService,
    RoutePlanningPolicyEngineService,
    TripExplainabilityService,
    DecisionAwarenessAugmentationService,
  ],
  exports: [
    WorldFactRepository,
    WorldFactService,
    WorldFactResolverService,
    ResearchWorldFactShadowIngestorService,
    WorldFactReadinessProjectionService,
    DecisionFactorFactoryService,
    DecisionActionExecutorService,
    DecisionExecutionReconciliationService,
    ExecutionPlanningContextService,
    RoutePlanningPolicyRegistryService,
    RoutePlanningPolicyConfigService,
    PolicySelectionLogService,
    RoutePlanningPolicyEngineService,
    TripExplainabilityService,
    DecisionAwarenessAugmentationService,
  ],
})
export class WorldFactsModule {}
