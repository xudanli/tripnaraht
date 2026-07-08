import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { DecisionSemanticsModule } from '../../trips/decision-semantics/decision-semantics.module';
import { DecisionProblemSsotModule } from '../decision-problems/decision-problem-ssot.module';
import { TripProcessFairnessModule } from '../../trips/process-fairness/trip-process-fairness.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { DestinationPackModule } from '../packs/destination-pack.module';
import { ConstraintEvaluationModule } from '../constraints/constraint-evaluation.module';
import { CanonicalPlanSelectionModule } from '../core/canonical-plan-selection.module';
import { DecisionTriggerModule } from '../trigger/decision-trigger.module';
import { AuthorizationPolicyModule } from '../authorization/authorization-policy.module';
import { EffectivePlanExecutionModule } from '../execution/effective-plan-execution.module';
import { DecisionEngineRegistryService } from './registry/decision-engine-registry.service';
import { DecisionRouteResolverService } from './routing/decision-route-resolver.service';
import { RouteLineageStoreService } from './lineage/route-lineage.store.service';
import { CanonicalDecisionEngineAdapter } from './engines/canonical-decision-engine.adapter';
import { LegacyV15EngineAdapter } from './engines/legacy-v15-engine.adapter';
import { DecisionEngineGatewayService } from './services/decision-engine-gateway.service';
import { UnifiedDecisionProblemReadModelService } from './services/unified-decision-problem-read-model.service';
import { UnifiedDecisionResolutionService } from './services/unified-decision-resolution.service';
import { DecisionCollaborativeSubTaskService } from './services/decision-collaborative-subtask.service';
import { DecisionProblemResolutionStoreService } from './persistence/decision-problem-resolution.store';
import { DecisionCollaborativeSubTaskStoreService } from './persistence/decision-collaborative-subtask.store';
import { CausalProtocolModule } from '../../causal-protocol/causal-protocol.module';
import { UnifiedDecisionController } from './controllers/unified-decision.controller';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => DecisionSemanticsModule),
    DecisionProblemSsotModule,
    TripProcessFairnessModule,
    forwardRef(() => TripConstraintSolverModule),
    DestinationPackModule,
    forwardRef(() => ConstraintEvaluationModule),
    forwardRef(() => CanonicalPlanSelectionModule),
    forwardRef(() => DecisionTriggerModule),
    AuthorizationPolicyModule,
    EffectivePlanExecutionModule,
    CausalProtocolModule,
  ],
  controllers: [UnifiedDecisionController],
  providers: [
    DecisionEngineRegistryService,
    DecisionRouteResolverService,
    RouteLineageStoreService,
    CanonicalDecisionEngineAdapter,
    LegacyV15EngineAdapter,
    DecisionEngineGatewayService,
    UnifiedDecisionProblemReadModelService,
    UnifiedDecisionResolutionService,
    DecisionProblemResolutionStoreService,
    DecisionCollaborativeSubTaskService,
    DecisionCollaborativeSubTaskStoreService,
  ],
  exports: [
    DecisionEngineGatewayService,
    UnifiedDecisionProblemReadModelService,
    UnifiedDecisionResolutionService,
    DecisionProblemResolutionStoreService,
    DecisionCollaborativeSubTaskService,
    DecisionCollaborativeSubTaskStoreService,
    DecisionEngineRegistryService,
    forwardRef(() => ConstraintEvaluationModule),
    forwardRef(() => CanonicalPlanSelectionModule),
    forwardRef(() => DecisionTriggerModule),
    AuthorizationPolicyModule,
  ],
})
export class DecisionGatewayModule {}
