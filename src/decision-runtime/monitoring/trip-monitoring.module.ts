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
import { AssertionPromotionService } from './assertion-promotion/assertion-promotion.service';
import { AssertionPromotionLedgerStore } from './assertion-promotion/assertion-promotion-ledger.store';
import { AssertionPromotionController } from './assertion-promotion/assertion-promotion.controller';
import { AssertionPromotionRetryScheduler } from './assertion-promotion/assertion-promotion-retry.scheduler';
import { VedurWeatherEvidenceStoreService } from '../../trips/guardian-decision-core/evidence/vedur-weather-evidence.store';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => GuardianDecisionCoreModule),
    WorldStateSnapshotModule,
    TripConstraintSolverModule,
    forwardRef(() => DecisionTriggerModule),
    forwardRef(() => DecisionGatewayModule),
  ],
  controllers: [
    TripMonitoringController,
    MonitoringAutoTriggerController,
    AssertionPromotionController,
  ],
  providers: [
    TripMonitoringMvpService,
    MonitoringAutoTriggerService,
    DecisionAutomationChainService,
    AssertionPromotionLedgerStore,
    AssertionPromotionService,
    AssertionPromotionRetryScheduler,
    VedurWeatherEvidenceStoreService,
  ],
  exports: [
    TripMonitoringMvpService,
    MonitoringAutoTriggerService,
    DecisionAutomationChainService,
    AssertionPromotionService,
  ],
})
export class TripMonitoringModule {}
