import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PoiAccessCapacityService } from './poi-access-capacity.service';
import { PoiAccessCapacityController } from './poi-access-capacity.controller';
import { ParkaCapacityProvider } from './providers/parka-capacity.provider';
import { BokunCapacityProvider } from './providers/bokun-capacity.provider';
import { UmferdinArrivalRateProvider } from './providers/umferdin-arrival-rate.provider';
import { VatnajokullTrailStatusProvider } from './providers/vatnajokull-trail-status.provider';
import { DyrholaeyBreedingStatusProvider } from './providers/dyrholaey-breeding-status.provider';
import { IcelandPoiAccessSyncService } from './services/iceland-poi-access-sync.service';
import { IcelandCapacitySyncService } from './services/iceland-capacity-sync.service';
import { PoiExecutionFeedbackService } from './services/poi-execution-feedback.service';
import { InTripPoiAccessMorningService } from './services/in-trip-poi-access-morning.service';
import { PoiAccessReadinessBridgeService } from './services/poi-access-readiness-bridge.service';
import { PoiAccessP0AssemblyService } from './services/poi-access-p0-assembly.service';
import { IcelandAccessEvidenceRefreshService } from './services/iceland-access-evidence-refresh.service';
import { PoiAccessCapacityEngineService } from './services/poi-access-capacity-engine.service';
import { TripReservationEvidenceService } from './services/trip-reservation-evidence.service';
import { IcelandPoiAccessSyncCron } from './jobs/iceland-poi-access-sync.cron';

@Module({
  imports: [PrismaModule],
  controllers: [PoiAccessCapacityController],
  providers: [
    PoiAccessCapacityService,
    ParkaCapacityProvider,
    BokunCapacityProvider,
    UmferdinArrivalRateProvider,
    VatnajokullTrailStatusProvider,
    DyrholaeyBreedingStatusProvider,
    IcelandPoiAccessSyncService,
    IcelandCapacitySyncService,
    PoiExecutionFeedbackService,
    InTripPoiAccessMorningService,
    IcelandPoiAccessSyncCron,
    PoiAccessCapacityEngineService,
    TripReservationEvidenceService,
    PoiAccessP0AssemblyService,
    PoiAccessReadinessBridgeService,
    IcelandAccessEvidenceRefreshService,
  ],
  exports: [
    PoiAccessCapacityService,
    PoiExecutionFeedbackService,
    IcelandPoiAccessSyncService,
    IcelandCapacitySyncService,
    InTripPoiAccessMorningService,
    PoiAccessCapacityEngineService,
    TripReservationEvidenceService,
    PoiAccessP0AssemblyService,
    PoiAccessReadinessBridgeService,
    IcelandAccessEvidenceRefreshService,
  ],
})
export class PoiAccessCapacityModule {}
