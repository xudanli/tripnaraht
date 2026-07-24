/**
 * In-memory OR-Tools vs Neptune shadow metrics (ADR-008).
 * Disable: OR_TOOLS_SHADOW_METRICS_DISABLED=1
 */

import { Injectable, Logger } from '@nestjs/common';
import type { OrtToolsEvaluateShadowAttachment } from '../bridge/ortools-road-evaluate-shadow.bridge';
import type { OrToolsPlanningLabCompareReport } from '../lab/ortools-planning-lab-compare.util';

export interface OrToolsShadowMetricsSnapshot {
  schemaId: 'tripnara.ortools_shadow_metrics@v1';
  generatedAt: string;
  runsTotal: number;
  solverSolvedTotal: number;
  solverUnavailableTotal: number;
  insufficientNodesTotal: number;
  shadowCandidateSum: number;
  neptuneCandidateSum: number;
  forbiddenEdgeViolationSum: number;
  gatewayEvaluatedTotal: number;
  gatewayPassTotal: number;
  gatewayNonPassTotal: number;
  writeAttemptedTotal: number;
  /** P2 — prior shadow discarded because evidence/snapshot changed */
  staleDiscardTotal: number;
  planningLabCompareTotal: number;
  planningLabShadowCheaperTotal: number;
  planningLabMeanAgreement: number | null;
  recent: Array<{
    tripId: string;
    at: string;
    neptune: number;
    shadow: number;
    forbidViol: number;
    gatewayScores: number;
  }>;
  recentPlanningLab: Array<{
    tripId?: string;
    dayIndex: number;
    agreement: number;
    travelDelta?: number;
    at: string;
  }>;
}

@Injectable()
export class OrToolsShadowMetricsCollector {
  private readonly logger = new Logger(OrToolsShadowMetricsCollector.name);
  private readonly disabled =
    process.env.OR_TOOLS_SHADOW_METRICS_DISABLED === '1';

  private runsTotal = 0;
  private solverSolvedTotal = 0;
  private solverUnavailableTotal = 0;
  private insufficientNodesTotal = 0;
  private shadowCandidateSum = 0;
  private neptuneCandidateSum = 0;
  private forbiddenEdgeViolationSum = 0;
  private gatewayEvaluatedTotal = 0;
  private gatewayPassTotal = 0;
  private gatewayNonPassTotal = 0;
  private writeAttemptedTotal = 0;
  private staleDiscardTotal = 0;
  private planningLabCompareTotal = 0;
  private planningLabShadowCheaperTotal = 0;
  private planningLabAgreementSum = 0;
  private readonly recent: OrToolsShadowMetricsSnapshot['recent'] = [];
  private readonly recentPlanningLab: OrToolsShadowMetricsSnapshot['recentPlanningLab'] =
    [];

  recordPlanningLabCompare(report: OrToolsPlanningLabCompareReport): void {
    if (this.disabled) return;
    this.planningLabCompareTotal += 1;
    this.planningLabAgreementSum += report.legacyShadowOrderAgreement;
    if (
      typeof report.travelDeltaLegacyMinusShadow === 'number' &&
      report.travelDeltaLegacyMinusShadow > 0
    ) {
      this.planningLabShadowCheaperTotal += 1;
    }
    this.recentPlanningLab.unshift({
      tripId: report.tripId,
      dayIndex: report.dayIndex,
      agreement: report.legacyShadowOrderAgreement,
      travelDelta: report.travelDeltaLegacyMinusShadow,
      at: report.generatedAt,
    });
    if (this.recentPlanningLab.length > 50) this.recentPlanningLab.pop();
  }

  recordStaleDiscard(input: {
    tripId: string;
    priorEvidenceVersionId?: string;
    currentEvidenceVersionId?: string;
  }): void {
    if (this.disabled) return;
    this.staleDiscardTotal += 1;
    this.logger.log(
      `ortools shadow stale-discard trip=${input.tripId} ` +
        `prior=${input.priorEvidenceVersionId ?? '?'} current=${input.currentEvidenceVersionId ?? '?'}`,
    );
  }

  recordEvaluateShadow(attachment: OrtToolsEvaluateShadowAttachment): void {
    if (this.disabled) return;

    this.runsTotal += 1;
    this.neptuneCandidateSum += attachment.neptuneCandidateCount;
    this.shadowCandidateSum += attachment.shadowCandidateCount;
    this.forbiddenEdgeViolationSum +=
      attachment.report.forbiddenEdgeViolations;

    if (attachment.solverUnavailableReason === 'insufficient_day_nodes_for_routing') {
      this.insufficientNodesTotal += 1;
    } else if (attachment.solverUnavailableReason) {
      this.solverUnavailableTotal += 1;
    } else if (attachment.shadowCandidateCount > 0) {
      this.solverSolvedTotal += 1;
    }

    const scores = Object.values(attachment.gatewayByCandidateId);
    this.gatewayEvaluatedTotal += scores.length;
    for (const s of scores) {
      if (s.overallStatus === 'PASS' || s.overallStatus === 'FEASIBLE') {
        this.gatewayPassTotal += 1;
      } else {
        this.gatewayNonPassTotal += 1;
      }
    }

    // Defense: should always stay 0
    if (attachment.report.writeAttempted) {
      this.writeAttemptedTotal += 1;
      this.logger.error(
        `OR-TOOLS SHADOW invariant broken: writeAttempted=true trip=${attachment.report.tripId}`,
      );
    }

    this.recent.unshift({
      tripId: attachment.report.tripId,
      at: attachment.report.comparedAt,
      neptune: attachment.neptuneCandidateCount,
      shadow: attachment.shadowCandidateCount,
      forbidViol: attachment.report.forbiddenEdgeViolations,
      gatewayScores: scores.length,
    });
    if (this.recent.length > 50) this.recent.pop();
  }

  snapshot(): OrToolsShadowMetricsSnapshot {
    return {
      schemaId: 'tripnara.ortools_shadow_metrics@v1',
      generatedAt: new Date().toISOString(),
      runsTotal: this.runsTotal,
      solverSolvedTotal: this.solverSolvedTotal,
      solverUnavailableTotal: this.solverUnavailableTotal,
      insufficientNodesTotal: this.insufficientNodesTotal,
      shadowCandidateSum: this.shadowCandidateSum,
      neptuneCandidateSum: this.neptuneCandidateSum,
      forbiddenEdgeViolationSum: this.forbiddenEdgeViolationSum,
      gatewayEvaluatedTotal: this.gatewayEvaluatedTotal,
      gatewayPassTotal: this.gatewayPassTotal,
      gatewayNonPassTotal: this.gatewayNonPassTotal,
      writeAttemptedTotal: this.writeAttemptedTotal,
      staleDiscardTotal: this.staleDiscardTotal,
      planningLabCompareTotal: this.planningLabCompareTotal,
      planningLabShadowCheaperTotal: this.planningLabShadowCheaperTotal,
      planningLabMeanAgreement:
        this.planningLabCompareTotal > 0
          ? Math.round(
              (this.planningLabAgreementSum / this.planningLabCompareTotal) *
                10000,
            ) / 10000
          : null,
      recent: [...this.recent],
      recentPlanningLab: [...this.recentPlanningLab],
    };
  }
}
