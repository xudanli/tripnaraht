/**
 * Travel Outcome Service
 *
 * Calculates and evaluates trip outcomes.
 * This service answers "how good was the trip?" by analyzing completion, budget, satisfaction, etc.
 */

import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  TravelOutcome,
  OutcomeCalculationRequest,
  OutcomeCalculationResult,
  TripDataForOutcome,
  TravelEventData,
  UserFeedback,
  TripSuccessLevel,
  BudgetPerformance,
  CompletionRate,
  CompanionSatisfaction,
  OutcomeMetrics,
  OutcomeFactor,
  OutcomeFactorType,
} from '../types/travel-outcome.types';

/**
 * Travel Outcome Service
 *
 * Calculates comprehensive trip outcomes based on trip data, events, and user feedback.
 */
@Injectable()
export class TravelOutcomeService {
  private readonly logger = new Logger(TravelOutcomeService.name);

  /**
   * Calculate travel outcome for a trip.
   */
  async calculate(request: OutcomeCalculationRequest): Promise<OutcomeCalculationResult> {
    try {
      this.logger.debug(`Calculating outcome for trip ${request.tripId}`);

      // Calculate individual components
      const budgetOutcome = this.calculateBudgetOutcome(request.tripData);
      const completionOutcome = this.calculateCompletionOutcome(request.tripData);
      const companionOutcome = this.calculateCompanionOutcome(request.tripData, request.userFeedback);
      const metrics = this.calculateMetrics(request.events);
      const factors = this.extractFactors(request, budgetOutcome, completionOutcome, metrics);

      // Calculate satisfaction
      const satisfaction = this.calculateSatisfaction(request.userFeedback, factors);

      // Calculate overall success level
      const success = this.calculateSuccessLevel(
        budgetOutcome,
        completionOutcome,
        companionOutcome,
        satisfaction,
        metrics,
      );

      // Calculate overall score
      const overallScore = this.calculateOverallScore(
        success,
        satisfaction,
        budgetOutcome.deviation,
        completionOutcome.percentage,
        companionOutcome.matchScore,
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        budgetOutcome,
        completionOutcome,
        companionOutcome,
        factors,
      );

      // Assess data quality
      const { dataQuality, missingData } = this.assessDataQuality(request);

      // Calculate confidence based on data quality
      const confidence = dataQuality;

      const outcome: TravelOutcome = {
        outcomeId: uuidv4(),
        tripId: request.tripId,
        success,
        satisfaction,
        budgetPerformance: budgetOutcome.performance,
        plannedBudget: request.tripData.plannedBudget,
        actualSpent: budgetOutcome.actualSpent,
        budgetDeviation: budgetOutcome.deviation,
        completionRate: completionOutcome.rate,
        plannedActivities: request.tripData.plannedActivities || 0,
        completedActivities: request.tripData.completedActivities || 0,
        completionPercentage: completionOutcome.percentage,
        companionSatisfaction: companionOutcome.satisfaction,
        companionMatchScore: companionOutcome.matchScore,
        companionCount: request.tripData.memberCount,
        satisfiedCompanions: companionOutcome.satisfiedCount,
        overallScore,
        computedAt: new Date().toISOString(),
        metrics,
        factors,
        recommendations,
      };

      this.logger.debug(
        `Outcome calculated for trip ${request.tripId}: success=${success}, score=${overallScore.toFixed(2)}`,
      );

      return {
        outcome,
        confidence,
        dataQuality,
        missingData,
      };
    } catch (error) {
      this.logger.error(
        `Failed to calculate outcome for trip ${request.tripId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Calculate budget outcome.
   */
  private calculateBudgetOutcome(tripData: TripDataForOutcome): {
    performance: BudgetPerformance;
    actualSpent: number;
    deviation: number;
  } {
    const plannedBudget = tripData.plannedBudget;
    const actualSpent = tripData.actualSpent ?? plannedBudget; // Default to planned if unknown

    const deviation = ((actualSpent - plannedBudget) / plannedBudget) * 100;

    let performance: BudgetPerformance;
    if (deviation < -10) {
      performance = BudgetPerformance.UNDER_BUDGET;
    } else if (deviation <= 10) {
      performance = BudgetPerformance.ON_BUDGET;
    } else if (deviation <= 20) {
      performance = BudgetPerformance.SLIGHTLY_OVER;
    } else {
      performance = BudgetPerformance.SIGNIFICANTLY_OVER;
    }

    return { performance, actualSpent, deviation };
  }

  /**
   * Calculate completion outcome.
   */
  private calculateCompletionOutcome(tripData: TripDataForOutcome): {
    rate: CompletionRate;
    percentage: number;
  } {
    const planned = tripData.plannedActivities ?? 1;
    const completed = tripData.completedActivities ?? planned;

    const percentage = (completed / planned) * 100;

    let rate: CompletionRate;
    if (percentage >= 100) {
      rate = CompletionRate.FULL;
    } else if (percentage >= 80) {
      rate = CompletionRate.HIGH;
    } else if (percentage >= 50) {
      rate = CompletionRate.MODERATE;
    } else {
      rate = CompletionRate.LOW;
    }

    return { rate, percentage };
  }

  /**
   * Calculate companion outcome.
   */
  private calculateCompanionOutcome(
    tripData: TripDataForOutcome,
    userFeedback?: UserFeedback,
  ): {
    satisfaction: CompanionSatisfaction;
    matchScore: number;
    satisfiedCount: number;
  } {
    const memberCount = tripData.memberCount;
    const companionSatisfactionScore = userFeedback?.companionSatisfaction ?? 7; // Default to good

    // Calculate match score based on satisfaction
    const matchScore = companionSatisfactionScore / 10;

    // Estimate satisfied companions based on score
    const satisfiedCount = Math.round(memberCount * matchScore);

    let satisfaction: CompanionSatisfaction;
    if (companionSatisfactionScore >= 9) {
      satisfaction = CompanionSatisfaction.EXCELLENT;
    } else if (companionSatisfactionScore >= 7) {
      satisfaction = CompanionSatisfaction.GOOD;
    } else if (companionSatisfactionScore >= 5) {
      satisfaction = CompanionSatisfaction.MIXED;
    } else {
      satisfaction = CompanionSatisfaction.POOR;
    }

    return { satisfaction, matchScore, satisfiedCount };
  }

  /**
   * Calculate outcome metrics from events.
   */
  private calculateMetrics(events?: TravelEventData[]): OutcomeMetrics {
    if (!events || events.length === 0) {
      return {
        onTimePerformance: 1.0,
        safetyIncidents: 0,
        weatherDisruptions: 0,
        transportIssues: 0,
        accommodationIssues: 0,
        activityCancellations: 0,
        planChanges: 0,
        userEngagement: 0.5,
        stressLevel: 0.3,
      };
    }

    let safetyIncidents = 0;
    let weatherDisruptions = 0;
    let transportIssues = 0;
    let accommodationIssues = 0;
    let activityCancellations = 0;
    let planChanges = 0;

    events.forEach((event) => {
      const eventType = event.eventType.toLowerCase();
      const attribution = event.attribution;

      // Count disruptions based on event types and attribution
      if (eventType.includes('safety') || attribution?.signals.includes('safety')) {
        safetyIncidents++;
      }
      if (eventType.includes('weather') || attribution?.signals.includes('weather')) {
        weatherDisruptions++;
      }
      if (eventType.includes('transport') || attribution?.signals.includes('transport')) {
        transportIssues++;
      }
      if (eventType.includes('accommodation') || attribution?.signals.includes('logistics')) {
        accommodationIssues++;
      }
      if (eventType.includes('cancel') || eventType.includes('rejected')) {
        activityCancellations++;
      }
      if (eventType.includes('change') || eventType.includes('adjust')) {
        planChanges++;
      }
    });

    // Calculate derived metrics
    const totalDisruptions = safetyIncidents + weatherDisruptions + transportIssues + accommodationIssues;
    const onTimePerformance = Math.max(0, 1 - (transportIssues * 0.1) - (weatherDisruptions * 0.05));
    const userEngagement = Math.min(1, 0.5 + (events.length * 0.01));
    const stressLevel = Math.min(1, (totalDisruptions * 0.15) + (planChanges * 0.1));

    return {
      onTimePerformance,
      safetyIncidents,
      weatherDisruptions,
      transportIssues,
      accommodationIssues,
      activityCancellations,
      planChanges,
      userEngagement,
      stressLevel,
    };
  }

  /**
   * Extract outcome factors from data.
   */
  private extractFactors(
    _request: OutcomeCalculationRequest,
    budgetOutcome: { performance: BudgetPerformance; deviation: number },
    completionOutcome: { percentage: number },
    metrics: OutcomeMetrics,
  ): OutcomeFactor[] {
    const factors: OutcomeFactor[] = [];

    // Budget factor
    if (Math.abs(budgetOutcome.deviation) > 10) {
      factors.push({
        type: OutcomeFactorType.BUDGET,
        impact: Math.min(1, Math.abs(budgetOutcome.deviation) / 50),
        description: `Budget ${budgetOutcome.deviation > 0 ? 'over' : 'under'} by ${Math.abs(budgetOutcome.deviation).toFixed(1)}%`,
        polarity: budgetOutcome.deviation > 0 ? 'negative' : 'positive',
      });
    }

    // Completion factor
    if (completionOutcome.percentage < 100) {
      factors.push({
        type: OutcomeFactorType.EXECUTION,
        impact: (100 - completionOutcome.percentage) / 100,
        description: `${completionOutcome.percentage.toFixed(0)}% of activities completed`,
        polarity: 'negative',
      });
    }

    // Weather factor
    if (metrics.weatherDisruptions > 0) {
      factors.push({
        type: OutcomeFactorType.WEATHER,
        impact: Math.min(1, metrics.weatherDisruptions * 0.3),
        description: `${metrics.weatherDisruptions} weather disruption(s)`,
        polarity: 'negative',
      });
    }

    // Transport factor
    if (metrics.transportIssues > 0) {
      factors.push({
        type: OutcomeFactorType.TRANSPORT,
        impact: Math.min(1, metrics.transportIssues * 0.25),
        description: `${metrics.transportIssues} transport issue(s)`,
        polarity: 'negative',
      });
    }

    // Safety factor
    if (metrics.safetyIncidents > 0) {
      factors.push({
        type: OutcomeFactorType.SAFETY,
        impact: Math.min(1, metrics.safetyIncidents * 0.5),
        description: `${metrics.safetyIncidents} safety incident(s)`,
        polarity: 'negative',
      });
    }

    // Plan changes factor
    if (metrics.planChanges > 2) {
      factors.push({
        type: OutcomeFactorType.PLANNING,
        impact: Math.min(1, (metrics.planChanges - 2) * 0.15),
        description: `${metrics.planChanges} plan change(s)`,
        polarity: 'negative',
      });
    }

    return factors.sort((a, b) => b.impact - a.impact);
  }

  /**
   * Calculate satisfaction score.
   */
  private calculateSatisfaction(userFeedback?: UserFeedback, factors?: OutcomeFactor[]): number {
    // Use user feedback if available
    if (userFeedback?.overallSatisfaction !== undefined) {
      return userFeedback.overallSatisfaction;
    }

    // Estimate satisfaction from factors
    if (!factors || factors.length === 0) {
      return 7; // Default to good
    }

    const negativeImpact = factors
      .filter((f) => f.polarity === 'negative')
      .reduce((sum, f) => sum + f.impact, 0);

    const positiveImpact = factors
      .filter((f) => f.polarity === 'positive')
      .reduce((sum, f) => sum + f.impact, 0);

    // Base score of 7, adjusted by factors
    let score = 7 - (negativeImpact * 3) + (positiveImpact * 1);
    return Math.max(0, Math.min(10, score));
  }

  /**
   * Calculate overall success level.
   */
  private calculateSuccessLevel(
    budgetOutcome: { performance: BudgetPerformance; deviation: number },
    completionOutcome: { percentage: number },
    companionOutcome: { satisfaction: CompanionSatisfaction },
    satisfaction: number,
    metrics: OutcomeMetrics,
  ): TripSuccessLevel {
    // Calculate weighted score
    const budgetScore = this.budgetPerformanceToScore(budgetOutcome.performance);
    const completionScore = completionOutcome.percentage / 100;
    const companionScore = this.companionSatisfactionToScore(companionOutcome.satisfaction);
    const satisfactionScore = satisfaction / 10;
    const safetyScore = Math.max(0, 1 - metrics.safetyIncidents * 0.5);

    const weightedScore =
      budgetScore * 0.2 +
      completionScore * 0.3 +
      companionScore * 0.2 +
      satisfactionScore * 0.2 +
      safetyScore * 0.1;

    // Map to success level
    if (weightedScore >= 0.9) {
      return TripSuccessLevel.EXCELLENT;
    } else if (weightedScore >= 0.75) {
      return TripSuccessLevel.GOOD;
    } else if (weightedScore >= 0.6) {
      return TripSuccessLevel.ACCEPTABLE;
    } else if (weightedScore >= 0.4) {
      return TripSuccessLevel.POOR;
    } else {
      return TripSuccessLevel.FAILED;
    }
  }

  /**
   * Convert budget performance to score (0-1).
   */
  private budgetPerformanceToScore(performance: BudgetPerformance): number {
    switch (performance) {
      case BudgetPerformance.UNDER_BUDGET:
        return 1.0;
      case BudgetPerformance.ON_BUDGET:
        return 0.9;
      case BudgetPerformance.SLIGHTLY_OVER:
        return 0.7;
      case BudgetPerformance.SIGNIFICANTLY_OVER:
        return 0.4;
      default:
        return 0.5;
    }
  }

  /**
   * Convert companion satisfaction to score (0-1).
   */
  private companionSatisfactionToScore(satisfaction: CompanionSatisfaction): number {
    switch (satisfaction) {
      case CompanionSatisfaction.EXCELLENT:
        return 1.0;
      case CompanionSatisfaction.GOOD:
        return 0.8;
      case CompanionSatisfaction.MIXED:
        return 0.6;
      case CompanionSatisfaction.POOR:
        return 0.3;
      default:
        return 0.5;
    }
  }

  /**
   * Calculate overall outcome score (0-1).
   */
  private calculateOverallScore(
    success: TripSuccessLevel,
    satisfaction: number,
    budgetDeviation: number,
    completionPercentage: number,
    companionMatchScore: number,
  ): number {
    const successScore = this.successLevelToScore(success);
    const satisfactionScore = satisfaction / 10;
    const budgetScore = Math.max(0, 1 - Math.abs(budgetDeviation) / 100);
    const completionScore = completionPercentage / 100;

    return (
      successScore * 0.3 +
      satisfactionScore * 0.3 +
      budgetScore * 0.2 +
      completionScore * 0.1 +
      companionMatchScore * 0.1
    );
  }

  /**
   * Convert success level to score (0-1).
   */
  private successLevelToScore(success: TripSuccessLevel): number {
    switch (success) {
      case TripSuccessLevel.EXCELLENT:
        return 1.0;
      case TripSuccessLevel.GOOD:
        return 0.8;
      case TripSuccessLevel.ACCEPTABLE:
        return 0.6;
      case TripSuccessLevel.POOR:
        return 0.4;
      case TripSuccessLevel.FAILED:
        return 0.0;
      default:
        return 0.5;
    }
  }

  /**
   * Generate recommendations based on outcomes.
   */
  private generateRecommendations(
    budgetOutcome: { performance: BudgetPerformance; deviation: number },
    completionOutcome: { percentage: number },
    companionOutcome: { satisfaction: CompanionSatisfaction },
    factors: OutcomeFactor[],
  ): string[] {
    const recommendations: string[] = [];

    // Budget recommendations
    if (budgetOutcome.performance === BudgetPerformance.SIGNIFICANTLY_OVER) {
      recommendations.push('Consider increasing budget allocation or finding cost-saving alternatives');
    } else if (budgetOutcome.performance === BudgetPerformance.SLIGHTLY_OVER) {
      recommendations.push('Monitor spending more closely during trip');
    }

    // Completion recommendations
    if (completionOutcome.percentage < 80) {
      recommendations.push('Review activity planning to ensure realistic schedules');
    } else if (completionOutcome.percentage < 100) {
      recommendations.push('Consider building buffer time for unexpected delays');
    }

    // Companion recommendations
    if (companionOutcome.satisfaction === CompanionSatisfaction.POOR) {
      recommendations.push('Reconsider companion matching or group dynamics');
    } else if (companionOutcome.satisfaction === CompanionSatisfaction.MIXED) {
      recommendations.push('Improve communication and expectation alignment with companions');
    }

    // Factor-based recommendations
    factors.forEach((factor) => {
      if (factor.type === OutcomeFactorType.WEATHER && factor.impact > 0.5) {
        recommendations.push('Consider weather contingency planning for future trips');
      }
      if (factor.type === OutcomeFactorType.TRANSPORT && factor.impact > 0.5) {
        recommendations.push('Add transport buffer time and alternative options');
      }
      if (factor.type === OutcomeFactorType.SAFETY && factor.impact > 0.3) {
        recommendations.push('Review safety protocols and destination risk assessment');
      }
    });

    return recommendations.length > 0 ? recommendations : ['No specific recommendations'];
  }

  /**
   * Assess data quality for outcome calculation.
   */
  private assessDataQuality(request: OutcomeCalculationRequest): {
    dataQuality: number;
    missingData: string[];
  } {
    const missingData: string[] = [];
    let qualityScore = 1.0;

    // Check required fields
    if (!request.tripData.plannedBudget) {
      missingData.push('plannedBudget');
      qualityScore -= 0.2;
    }
    if (!request.tripData.memberCount) {
      missingData.push('memberCount');
      qualityScore -= 0.1;
    }
    if (!request.tripData.plannedActivities) {
      missingData.push('plannedActivities');
      qualityScore -= 0.15;
    }
    if (!request.tripData.completedActivities) {
      missingData.push('completedActivities');
      qualityScore -= 0.15;
    }
    if (!request.tripData.actualSpent) {
      missingData.push('actualSpent');
      qualityScore -= 0.1;
    }
    if (!request.userFeedback) {
      missingData.push('userFeedback');
      qualityScore -= 0.1;
    }
    if (!request.events || request.events.length === 0) {
      missingData.push('events');
      qualityScore -= 0.1;
    }

    return {
      dataQuality: Math.max(0, qualityScore),
      missingData,
    };
  }

  /**
   * Batch calculate outcomes for multiple trips.
   */
  async calculateBatch(requests: OutcomeCalculationRequest[]): Promise<OutcomeCalculationResult[]> {
    this.logger.log(`Batch calculating outcomes for ${requests.length} trips`);

    const results = await Promise.all(
      requests.map((request) => this.calculate(request)),
    );

    return results;
  }
}
