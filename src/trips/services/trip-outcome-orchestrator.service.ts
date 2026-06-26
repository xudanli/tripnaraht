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
    companionSatisfaction?: number;
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

        // Trigger recruiting outcome evaluation if this trip is linked to a MatchSquare post
        await this.evaluateRecruitingOutcome(tripId, result);

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
   * Evaluate recruiting outcome for linked MatchSquare post.
   * Called when trip outcome is calculated.
   */
  private async evaluateRecruitingOutcome(
    tripId: string,
    tripOutcome: { outcome: any },
  ): Promise<void> {
    if (!this.prisma) {
      return;
    }

    try {
      // Find MatchSquare post linked to this trip
      const recruitingPost = await this.prisma.matchSquarePost.findFirst({
        where: { tripId },
      });

      if (!recruitingPost) {
        this.logger.debug(`No MatchSquare post linked to trip ${tripId}`);
        return;
      }

      // Get all applications for this post
      const applications = await this.prisma.matchSquareApplication.findMany({
        where: { postId: recruitingPost.id },
      });

      // Calculate recruiting metrics
      const approvedCount = applications.filter(a => a.status === 'approved').length;
      const rejectedCount = applications.filter(a => a.status === 'rejected').length;
      const conversionRate = applications.length > 0 ? approvedCount / applications.length : 0;

      // Build recruiting outcome
      const recruitingOutcome = {
        successLevel: this.mapTripSuccessToRecruitingSuccess(tripOutcome.outcome.success),
        metrics: {
          timeToFill: recruitingPost.publishedAt && recruitingPost.closedAt
            ? Math.ceil((new Date(recruitingPost.closedAt).getTime() - new Date(recruitingPost.publishedAt).getTime()) / (1000 * 60 * 60 * 24))
            : 0,
          applicationCount: applications.length,
          approvedCount,
          rejectedCount,
          conversionRate,
          matchSuccessRate: approvedCount > 0 ? 0.8 : 0, // Simplified
          teamPerformance: tripOutcome.outcome.overallScore,
          attritionRate: 0.1, // Default, should be calculated from actual data
        },
        factors: [],
        recommendations: this.generateRecruitingRecommendations(tripOutcome.outcome, conversionRate),
        computedAt: new Date(),
        dataQuality: 0.8,
        confidence: 0.7,
      };

      // Update MatchSquare post with recruiting outcome
      await this.prisma.matchSquarePost.update({
        where: { id: recruitingPost.id },
        data: { outcome: recruitingOutcome as any },
      });

      this.logger.log(
        `Recruiting outcome evaluated for post ${recruitingPost.id}: success=${recruitingOutcome.successLevel}`,
      );
    } catch (error) {
      this.logger.error(`Failed to evaluate recruiting outcome for trip ${tripId}: ${error}`);
      // Don't throw - recruiting outcome evaluation failure should not block main flow
    }
  }

  /**
   * Map Trip success level to Recruiting success level.
   */
  private mapTripSuccessToRecruitingSuccess(tripSuccess: string): string {
    const mapping: Record<string, string> = {
      EXCELLENT: 'EXCELLENT',
      GOOD: 'GOOD',
      ACCEPTABLE: 'ACCEPTABLE',
      POOR: 'POOR',
      FAILED: 'FAILED',
    };
    return mapping[tripSuccess] || 'ACCEPTABLE';
  }

  /**
   * Generate recruiting recommendations based on trip outcome.
   */
  private generateRecruitingRecommendations(tripOutcome: any, conversionRate: number): string[] {
    const recommendations: string[] = [];

    if (tripOutcome.success === 'EXCELLENT' || tripOutcome.success === 'GOOD') {
      recommendations.push('招募表现优秀，建议复制当前策略到其他招募');
    } else if (tripOutcome.success === 'POOR' || tripOutcome.success === 'FAILED') {
      recommendations.push('招募结果不佳，建议重新评估筛选标准和匹配算法');
    }

    if (conversionRate < 0.3) {
      recommendations.push('申请转化率较低，建议优化招募帖文案或降低筛选标准');
    }

    if (tripOutcome.companionSatisfaction === 'POOR') {
      recommendations.push('同伴满意度较低，建议强化个性匹配和交互模式分析');
    }

    return recommendations.length > 0 ? recommendations : ['招募表现正常，继续监控'];
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
