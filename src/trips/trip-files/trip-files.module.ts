import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TripFilesController } from './trip-files.controller';
import { TripFileService } from './services/trip-file.service';
import { TripFileAccessService } from './services/trip-file-access.service';
import { TripFileStorageService } from './services/trip-file-storage.service';

@Module({
  imports: [PrismaModule],
  controllers: [TripFilesController],
  providers: [TripFileService, TripFileAccessService, TripFileStorageService],
  exports: [TripFileService],
})
export class TripFilesModule {}
