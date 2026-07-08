import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { WorldStateSnapshotModule } from '../snapshot/world-state-snapshot.module';
import { DecisionTriggerModule } from '../trigger/decision-trigger.module';
import { DecisionGatewayModule } from '../gateway/decision-gateway.module';
import { TripMonitoringMvpService } from './trip-monitoring-mvp.service';
import { TripMonitoringController } from './trip-monitoring.controller';
import { MonitoringAutoTriggerService } from './monitoring-auto-trigger.service';
import { MonitoringAutoTriggerController } from './monitoring-auto-trigger.controller';
import { DecisionAutomationChainService } from './decision-automation-chain.service';

@Module({
  imports: [
    PrismaModule,
    GuardianDecisionCoreModule,
    WorldStateSnapshotModule,
    TripConstraintSolverModule,
    forwardRef(() => DecisionTriggerModule),
    forwardRef(() => DecisionGatewayModule),
  ],
  controllers: [TripMonitoringController, MonitoringAutoTriggerController],
  providers: [
    TripMonitoringMvpService,
    MonitoringAutoTriggerService,
    DecisionAutomationChainService,
  ],
  exports: [
    TripMonitoringMvpService,
    MonitoringAutoTriggerService,
    DecisionAutomationChainService,
  ],
})
export class TripMonitoringModule {}
