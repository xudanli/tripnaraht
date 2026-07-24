import { Module, forwardRef } from '@nestjs/common';
import { DecisionModule } from '../../trips/decision/decision.module';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { ConstraintEvaluationModule } from '../constraints/constraint-evaluation.module';
import { WorldStateSnapshotModule } from '../snapshot/world-state-snapshot.module';
import { OptimizationModule } from '../optimization/optimization.module';
import { ShadowObservabilityModule } from '../observability/shadow-observability.module';
import { LegacyTripPlanningAdapter } from '../candidates/legacy-planning.adapter';
import { FullPlanSelectionService } from './full-plan-selection.service';

@Module({
  imports: [
    forwardRef(() => DecisionModule),
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => ConstraintEvaluationModule),
    forwardRef(() => WorldStateSnapshotModule),
    forwardRef(() => OptimizationModule),
    ShadowObservabilityModule,
  ],
  providers: [LegacyTripPlanningAdapter, FullPlanSelectionService],
  exports: [FullPlanSelectionService, LegacyTripPlanningAdapter],
})
export class CanonicalPlanSelectionModule {}
