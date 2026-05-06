import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RoadIsProviderService } from './road-is-provider.service';
import { EnvSyncWorkerService } from './env-sync-worker.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [RoadIsProviderService, EnvSyncWorkerService],
  exports: [RoadIsProviderService],
})
export class RoadIsModule {}
