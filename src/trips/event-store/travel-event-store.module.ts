import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TravelEventPersistenceService } from './travel-event-persistence.service';

/**
 * Optional module export for Travel Event Store persistence.
 *
 * Subscribe via `TravelEventSubscriberService` in the host module that already
 * imports `DecisionOSModule.forFeature(...)` so the same in-process event bus is used.
 */
@Module({
  imports: [PrismaModule],
  providers: [TravelEventPersistenceService],
  exports: [TravelEventPersistenceService],
})
export class TravelEventStoreModule {}
