/**
 * Travel Outcome Module
 *
 * Provides outcome evaluation capabilities for completed trips.
 * This module answers "how good was the trip?".
 * Round 3: Added 6-dimension scoring and group aggregation.
 */

import { Module } from '@nestjs/common';
import { TravelOutcomeService } from './services/travel-outcome.service';
import { TravelOutcomePersistenceService } from './services/travel-outcome-persistence.service';
import { TripOutcomeCalculator } from './trip-outcome-calculator.service';
import { GroupAggregationService } from './group-aggregation.service';
import { TripOutcomeController } from './trip-outcome.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TripOutcomeController],
  providers: [
    TravelOutcomeService,
    TravelOutcomePersistenceService,
    TripOutcomeCalculator,
    GroupAggregationService,
  ],
  exports: [
    TravelOutcomeService,
    TravelOutcomePersistenceService,
    TripOutcomeCalculator,
    GroupAggregationService,
  ],
})
export class TravelOutcomeModule {}
