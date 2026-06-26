/**
 * Trip Outcome Controller
 *
 * Provides HTTP API for calculating and retrieving trip outcomes.
 * Round 3: 6-dimension scoring and expectation gap.
 */

import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { TripOutcomeCalculator, TripOutcomeRequest, TripOutcomeResponse } from './trip-outcome-calculator.service';

@Controller('trips')
export class TripOutcomeController {
  constructor(private readonly outcomeCalculator: TripOutcomeCalculator) {}

  /**
   * Calculate trip outcome
   * POST /trips/:tripId/outcome
   */
  @Post(':tripId/outcome')
  @HttpCode(HttpStatus.OK)
  async calculateOutcome(
    @Param('tripId') tripId: string,
    @Body() request: Omit<TripOutcomeRequest, 'tripId'>,
  ): Promise<TripOutcomeResponse> {
    const fullRequest: TripOutcomeRequest = {
      ...request,
      tripId,
    };
    return this.outcomeCalculator.calculate(fullRequest);
  }

  /**
   * Batch calculate trip outcomes
   * POST /trips/outcome/batch
   */
  @Post('outcome/batch')
  @HttpCode(HttpStatus.OK)
  async calculateOutcomesBatch(
    @Body() requests: TripOutcomeRequest[],
  ): Promise<TripOutcomeResponse[]> {
    return this.outcomeCalculator.calculateBatch(requests);
  }
}
