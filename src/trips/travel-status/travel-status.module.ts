import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DecisionGatewayModule } from '../../decision-runtime/gateway/decision-gateway.module';
import { GuardianDecisionCoreModule } from '../guardian-decision-core/guardian-decision-core.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { WorldStateSnapshotModule } from '../../decision-runtime/snapshot/world-state-snapshot.module';
import { TripMonitoringModule } from '../../decision-runtime/monitoring/trip-monitoring.module';
import { TravelStatusController } from './controllers/travel-status.controller';
import { TravelStatusService } from './services/travel-status.service';
import { ConsumerDecisionQueueService } from './services/consumer-decision-queue.service';
import { AiActivityLogService } from './services/ai-activity-log.service';

@Module({
  imports: [
    PrismaModule,
    DecisionGatewayModule,
    GuardianDecisionCoreModule,
    TripConstraintSolverModule,
    WorldStateSnapshotModule,
    TripMonitoringModule,
  ],
  controllers: [TravelStatusController],
  providers: [TravelStatusService, ConsumerDecisionQueueService, AiActivityLogService],
  exports: [TravelStatusService, ConsumerDecisionQueueService, AiActivityLogService],
})
export class TravelStatusModule {}
