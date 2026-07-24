import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DestinationPackModule } from '../../../decision-runtime/packs/destination-pack.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RoadIsProviderService } from './road-is-provider.service';
import { EnvSyncWorkerService } from './env-sync-worker.service';
import { OntologyRoadStatusProviderService } from './ontology-road-status-provider.service';

@Module({
  imports: [ConfigModule, PrismaModule, DestinationPackModule],
  providers: [RoadIsProviderService, EnvSyncWorkerService, OntologyRoadStatusProviderService],
  exports: [RoadIsProviderService, OntologyRoadStatusProviderService],
})
export class RoadIsModule {}
