/**
 * Travel Outcome Persistence Service
 *
 * Handles persistence of travel outcome data.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TravelOutcome,
  OutcomeCalculationResult,
} from '../types/travel-outcome.types';

/**
 * Persistence result for travel outcomes.
 */
export interface OutcomePersistenceResult {
  /** Whether the outcome was persisted */
  persisted: boolean;

  /** The outcome ID */
  outcomeId: string;

  /** Error message if persistence failed */
  error?: string;
}

@Injectable()
export class TravelOutcomePersistenceService {
  private readonly logger = new Logger(TravelOutcomePersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist a travel outcome.
   */
  async persist(
    result: OutcomeCalculationResult,
  ): Promise<OutcomePersistenceResult> {
    try {
      const outcome = result.outcome;

      await this.prisma.travelOutcome.create({
        data: {
          id: outcome.outcomeId,
          tripId: outcome.tripId,
          success: outcome.success,
          satisfaction: outcome.satisfaction,
          budgetPerformance: outcome.budgetPerformance,
          plannedBudget: outcome.plannedBudget,
          actualSpent: outcome.actualSpent,
          budgetDeviation: outcome.budgetDeviation,
          completionRate: outcome.completionRate,
          plannedActivities: outcome.plannedActivities,
          completedActivities: outcome.completedActivities,
          completionPercentage: outcome.completionPercentage,
          overallScore: outcome.overallScore,
          metrics: outcome.metrics as any,
          factors: outcome.factors as any,
          recommendations: outcome.recommendations as any,
          computedAt: new Date(outcome.computedAt),
          dataQuality: result.dataQuality,
          confidence: result.confidence,
        },
      });

      this.logger.log(
        `Persisted outcome for trip ${outcome.tripId}: success=${outcome.success}, score=${outcome.overallScore.toFixed(2)}`,
      );

      return {
        persisted: true,
        outcomeId: outcome.outcomeId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to persist outcome for trip ${result.outcome.tripId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        persisted: false,
        outcomeId: result.outcome.outcomeId,
        error: message,
      };
    }
  }

  /**
   * Get outcome for a trip.
   */
  async getByTripId(tripId: string): Promise<TravelOutcome | null> {
    try {
      const record = await this.prisma.travelOutcome.findFirst({
        where: { tripId },
        orderBy: { computedAt: 'desc' },
      });

      if (!record) {
        return null;
      }

      return this.mapToTravelOutcome(record);
    } catch (error) {
      this.logger.error(`Failed to get outcome for trip ${tripId}: ${error}`);
      return null;
    }
  }

  /**
   * Get outcomes for multiple trips.
   */
  async getByTripIds(tripIds: string[]): Promise<Map<string, TravelOutcome>> {
    try {
      const records = await this.prisma.travelOutcome.findMany({
        where: { tripId: { in: tripIds } },
        orderBy: { computedAt: 'desc' },
      });

      const map = new Map<string, TravelOutcome>();
      records.forEach((record) => {
        // Keep only the latest outcome per trip
        if (!map.has(record.tripId)) {
          map.set(record.tripId, this.mapToTravelOutcome(record));
        }
      });

      return map;
    } catch (error) {
      this.logger.error(`Failed to get outcomes for trips: ${error}`);
      return new Map();
    }
  }

  /**
   * Get outcomes by success level.
   */
  async getBySuccessLevel(success: string): Promise<TravelOutcome[]> {
    try {
      const records = await this.prisma.travelOutcome.findMany({
        where: { success },
        orderBy: { computedAt: 'desc' },
        take: 100,
      });

      return records.map((record) => this.mapToTravelOutcome(record));
    } catch (error) {
      this.logger.error(`Failed to get outcomes by success level ${success}: ${error}`);
      return [];
    }
  }

  /**
   * Get outcome statistics.
   */
  async getStatistics(): Promise<{
    totalOutcomes: number;
    averageScore: number;
    averageSatisfaction: number;
    successDistribution: Record<string, number>;
    budgetPerformanceDistribution: Record<string, number>;
  }> {
    try {
      const outcomes = await this.prisma.travelOutcome.findMany({
        select: {
          overallScore: true,
          satisfaction: true,
          success: true,
          budgetPerformance: true,
        },
      });

      if (outcomes.length === 0) {
        return {
          totalOutcomes: 0,
          averageScore: 0,
          averageSatisfaction: 0,
          successDistribution: {},
          budgetPerformanceDistribution: {},
        };
      }

      const totalOutcomes = outcomes.length;
      const averageScore =
        outcomes.reduce((sum, o) => sum + o.overallScore, 0) / totalOutcomes;
      const averageSatisfaction =
        outcomes.reduce((sum, o) => sum + o.satisfaction, 0) / totalOutcomes;

      const successDistribution: Record<string, number> = {};
      const budgetPerformanceDistribution: Record<string, number> = {};

      outcomes.forEach((o) => {
        successDistribution[o.success] = (successDistribution[o.success] || 0) + 1;
        budgetPerformanceDistribution[o.budgetPerformance] =
          (budgetPerformanceDistribution[o.budgetPerformance] || 0) + 1;
      });

      return {
        totalOutcomes,
        averageScore,
        averageSatisfaction,
        successDistribution,
        budgetPerformanceDistribution,
      };
    } catch (error) {
      this.logger.error(`Failed to get outcome statistics: ${error}`);
      return {
        totalOutcomes: 0,
        averageScore: 0,
        averageSatisfaction: 0,
        successDistribution: {},
        budgetPerformanceDistribution: {},
      };
    }
  }

  /**
   * Map Prisma record to TravelOutcome.
   */
  private mapToTravelOutcome(record: any): TravelOutcome {
    return {
      outcomeId: record.id,
      tripId: record.tripId,
      success: record.success,
      satisfaction: record.satisfaction,
      budgetPerformance: record.budgetPerformance,
      plannedBudget: record.plannedBudget,
      actualSpent: record.actualSpent,
      budgetDeviation: record.budgetDeviation,
      completionRate: record.completionRate,
      plannedActivities: record.plannedActivities,
      completedActivities: record.completedActivities,
      completionPercentage: record.completionPercentage,
      overallScore: record.overallScore,
      metrics: record.metrics,
      factors: record.factors,
      recommendations: record.recommendations,
      computedAt: record.computedAt.toISOString(),
    };
  }
}
