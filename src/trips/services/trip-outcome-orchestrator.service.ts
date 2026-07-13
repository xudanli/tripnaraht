/**
 * Trip Outcome Orchestrator Service
 *
 * Orchestrates outcome calculation when trip status changes.
 * Automatically calculates outcome when trip transitions to COMPLETED.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TripStatus } from '../dto/trip-status.dto';
import { TravelOutcomeService } from '../outcome/services/travel-outcome.service';
import { TravelOutcomePersistenceService } from '../outcome/services/travel-outcome-persistence.service';
import { MoneyDnaService } from '../budget-os/services/money-dna.service';
import { OutcomeCalculationRequest, TripDataForOutcome, TravelEventData } from '../outcome/types/travel-outcome.types';
import { Trip } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReputationEventService } from '../../identity-governance/services/reputation-event.service';

/**
 * Context for outcome calculation.
 */
export interface OutcomeCalculationContext {
  /** Trip entity */
  trip: Trip;

  /** Actual spent (if available) */
  actualSpent?: number;

  /** Completed activities count (if available) */
  completedActivities?: number;

  /** User feedback (if available) */
  userFeedback?: {
    overallSatisfaction?: number;
    budgetSatisfaction?: number;
    activitySatisfaction?: number;
    textFeedback?: string;
    wouldRecommend?: boolean;
    wouldRepeat?: boolean;
  };

  /** Travel events for outcome calculation */
  events?: TravelEventData[];
}

@Injectable()
export class TripOutcomeOrchestratorService {
  private readonly logger = new Logger(TripOutcomeOrchestratorService.name);

  constructor(
    @Optional() private readonly outcomeService?: TravelOutcomeService,
    @Optional() private readonly outcomePersistenceService?: TravelOutcomePersistenceService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly moneyDnaService?: MoneyDnaService,
    @Optional() private readonly reputationEventService?: ReputationEventService,
  ) {}

  /**
   * Handle trip status transition and calculate outcome if needed.
   * Call this when trip status changes to COMPLETED.
   */
  async handleStatusTransition(
    tripId: string,
    newStatus: TripStatus,
    context?: OutcomeCalculationContext,
  ): Promise<void> {
    // Only calculate outcome when trip completes
    if (newStatus !== TripStatus.COMPLETED) {
      return;
    }

    if (!this.outcomeService || !this.outcomePersistenceService) {
      this.logger.debug('Outcome services not available, skipping outcome calculation');
      return;
    }

    try {
      this.logger.log(`Calculating outcome for completed trip ${tripId}`);

      const request = this.buildOutcomeRequest(tripId, context);
      const result = await this.outcomeService.calculate(request);

      const persistenceResult = await this.outcomePersistenceService.persist(result);

      if (persistenceResult.persisted) {
        this.logger.log(
          `Outcome persisted for trip ${tripId}: success=${result.outcome.success}, score=${result.outcome.overallScore.toFixed(2)}`,
        );

        // Record verifiable reputation facts for linked trusted projects
        await this.recordTrustedProjectReputation(tripId, result.outcome);

        // L4: refresh Money DNA for users with value feedback on this trip
        if (this.moneyDnaService) {
          await this.moneyDnaService.recomputeForTrip(tripId).catch((err) => {
            this.logger.warn(`Money DNA recompute skipped for trip ${tripId}: ${err}`);
          });
        }
      } else {
        this.logger.warn(
          `Failed to persist outcome for trip ${tripId}: ${persistenceResult.error}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to calculate outcome for trip ${tripId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Don't throw - outcome calculation failure should not block status transition
    }
  }

  /**
   * Build outcome calculation request from context.
   */
  private buildOutcomeRequest(
    tripId: string,
    context?: OutcomeCalculationContext,
  ): OutcomeCalculationRequest {
    const trip = context?.trip;

    if (!trip) {
      throw new Error('Trip context is required for outcome calculation');
    }

    const budgetConfig = trip.budgetConfig as any;
    const plannedBudget = budgetConfig?.total || budgetConfig?.budget || 0;

    const tripData: TripDataForOutcome = {
      status: trip.status || 'COMPLETED',
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      plannedBudget,
      actualSpent: context?.actualSpent,
      memberCount: this.extractMemberCount(trip),
      plannedActivities: this.extractPlannedActivities(trip),
      completedActivities: context?.completedActivities,
    };

    return {
      tripId,
      tripData,
      events: context?.events,
      userFeedback: context?.userFeedback,
    };
  }

  /**
   * Extract member count from trip.
   */
  private extractMemberCount(trip: Trip): number {
    const metadata = trip.metadata as any;
    return metadata?.memberCount || metadata?.acceptedMemberCount || 1;
  }

  /**
   * Extract planned activities count from trip.
   */
  private extractPlannedActivities(trip: Trip): number {
    const metadata = trip.metadata as any;
    return metadata?.plannedActivities || metadata?.activityCount || 0;
  }

  /**
   * Record reputation events for linked trusted project listings.
   */
  private async recordTrustedProjectReputation(
    tripId: string,
    outcome?: { success?: string; overallScore?: number },
  ): Promise<void> {
    if (!this.reputationEventService) {
      return;
    }

    try {
      await this.reputationEventService.recordTrustedProjectCompletion(tripId, outcome);
    } catch (error) {
      this.logger.error(`Failed to record trusted project reputation for trip ${tripId}: ${error}`);
    }
  }

  /**
   * Manually trigger outcome calculation for a trip.
   * Useful for recalculating outcome after user feedback is received.
   */
  async recalculateOutcome(
    tripId: string,
    context: OutcomeCalculationContext,
  ): Promise<void> {
    if (!this.outcomeService || !this.outcomePersistenceService) {
      throw new Error('Outcome services not available');
    }

    this.logger.log(`Recalculating outcome for trip ${tripId}`);

    const request = this.buildOutcomeRequest(tripId, context);
    const result = await this.outcomeService.calculate(request);

    const persistenceResult = await this.outcomePersistenceService.persist(result);

    if (!persistenceResult.persisted) {
      throw new Error(`Failed to persist outcome: ${persistenceResult.error}`);
    }

    this.logger.log(
      `Outcome recalculated for trip ${tripId}: success=${result.outcome.success}, score=${result.outcome.overallScore.toFixed(2)}`,
    );
  }
}
