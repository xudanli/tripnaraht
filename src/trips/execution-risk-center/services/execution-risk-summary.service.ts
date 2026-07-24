import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ExecutionRiskSummaryDto } from '../types/execution-risk.types';
import {
  aggregateImpactWindows,
  computeExecutionGateFromRisks,
  computeOverallLevel,
  defaultSummaryText,
} from '../utils/risk-level.util';
import { ActiveRiskAggregationService } from './active-risk-aggregation.service';

@Injectable()
export class ExecutionRiskSummaryService {
  constructor(private readonly aggregation: ActiveRiskAggregationService) {}

  async getSummary(tripId: string, userId: string, date?: string): Promise<ExecutionRiskSummaryDto> {
    const activeRisks = await this.aggregation.listRisks(tripId, userId);
    const overallLevel = computeOverallLevel({ activeRisks });
    const executionGate = computeExecutionGateFromRisks(activeRisks);
    const unacknowledgedCount = activeRisks.filter((r) => r.acknowledgementStatus === 'UNSEEN').length;
    const unresolvedCount = activeRisks.filter((r) => r.lifecycleStatus !== 'RESOLVED').length;
    const actionRequiredCount = activeRisks.filter(
      (r) => r.treatmentStatus === 'ACTION_REQUIRED' || r.treatmentStatus === 'DECISION_REQUIRED',
    ).length;
    const recommendation = await this.aggregation.buildSummaryRecommendation(tripId, userId, activeRisks);

    return {
      tripId,
      date: date ?? DateTime.now().toISODate() ?? '',
      overallLevel,
      executionGate,
      activeRiskCount: activeRisks.length,
      unacknowledgedCount,
      unresolvedCount,
      actionRequiredCount,
      impactWindows: aggregateImpactWindows(activeRisks),
      summary: defaultSummaryText(overallLevel, executionGate),
      recommendation,
      generatedAt: new Date().toISOString(),
    };
  }
}
