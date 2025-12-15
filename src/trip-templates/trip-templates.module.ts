// src/trip-templates/trip-templates.module.ts
import { Module } from '@nestjs/common';
import { TripTemplatesService } from './trip-templates.service';
import { TripTemplatesController, TripsFromTemplateController } from './trip-templates.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [PrismaModule, TripsModule],
  controllers: [TripTemplatesController, TripsFromTemplateController],
  providers: [TripTemplatesService],
  exports: [TripTemplatesService],
})
export class TripTemplatesModule {}
