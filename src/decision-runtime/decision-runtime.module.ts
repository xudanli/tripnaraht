import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionOsP0Module } from '../decision/decision-os-p0.module';
import { TravelEventStoreModule } from '../trips/event-store/travel-event-store.module';
import { Gate1AccessService } from '../gate1/services/gate1-access.service';
import { Gate1GuardService } from '../gate1/services/gate1-support.services';
import { Gate1OpsAccessGuard } from '../gate1/guards/gate1-ops-access.guard';
import { DecisionRuntimeOpsController } from './controllers/decision-runtime-ops.controller';
import { Gate1RuntimeEventService } from './services/gate1-runtime-event.service';
import { Gate1RuntimeBackfillService } from './services/gate1-runtime-backfill.service';
import { DecisionWorkspaceReconciliationService } from './services/decision-workspace-reconciliation.service';
import { DecisionWorkspaceReadService } from './services/decision-workspace-read.service';
import { Gate1LinkedTripAnchorService } from './services/gate1-linked-trip-anchor.service';
import { Gate1TripSyncService } from './services/gate1-trip-sync.service';
import { Gate1RuntimeMetricsService } from './services/gate1-runtime-metrics.service';
import { RuntimeEventOutboxService } from './services/runtime-event-outbox.service';
import { RuntimeEventOutboxScheduler } from './schedulers/runtime-event-outbox.scheduler';
import { Gate1RuntimeAcceptanceService } from './services/gate1-runtime-acceptance.service';

@Module({
  imports: [PrismaModule, DecisionOsP0Module, TravelEventStoreModule, ConfigModule],
  controllers: [DecisionRuntimeOpsController],
  providers: [
    Gate1RuntimeEventService,
    Gate1RuntimeBackfillService,
    DecisionWorkspaceReconciliationService,
    DecisionWorkspaceReadService,
    Gate1LinkedTripAnchorService,
    Gate1TripSyncService,
    Gate1RuntimeMetricsService,
    RuntimeEventOutboxService,
    RuntimeEventOutboxScheduler,
    Gate1RuntimeAcceptanceService,
    Gate1AccessService,
    Gate1GuardService,
    Gate1OpsAccessGuard,
  ],
  exports: [
    Gate1RuntimeEventService,
    Gate1RuntimeBackfillService,
    DecisionWorkspaceReconciliationService,
    DecisionWorkspaceReadService,
    Gate1LinkedTripAnchorService,
    Gate1TripSyncService,
    Gate1RuntimeMetricsService,
    RuntimeEventOutboxService,
    Gate1RuntimeAcceptanceService,
  ],
})
export class DecisionRuntimeModule {}
