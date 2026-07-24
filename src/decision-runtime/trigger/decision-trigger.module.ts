import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { CanonicalPlanSelectionModule } from '../core/canonical-plan-selection.module';
import { CandidateProvidersModule } from '../candidates/candidate-providers.module';
import { WorldStateSnapshotModule } from '../snapshot/world-state-snapshot.module';
import { DecisionTriggerGatewayService } from './decision-trigger.gateway.service';
import { DecisionTriggerLineageStore } from './decision-trigger-lineage.store';
import { DecisionTriggerCanonicalEvaluateHandler } from './decision-trigger-canonical-evaluate.handler';
import { MonitoringReplanningContextService } from './monitoring-replanning-context.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => CanonicalPlanSelectionModule),
    CandidateProvidersModule,
    forwardRef(() => WorldStateSnapshotModule),
  ],
  providers: [
    DecisionTriggerGatewayService,
    DecisionTriggerLineageStore,
    DecisionTriggerCanonicalEvaluateHandler,
    MonitoringReplanningContextService,
  ],
  exports: [
    DecisionTriggerGatewayService,
    DecisionTriggerLineageStore,
    MonitoringReplanningContextService,
    CandidateProvidersModule,
  ],
})
export class DecisionTriggerModule {}
