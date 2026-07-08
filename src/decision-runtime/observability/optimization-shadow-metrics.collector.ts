/**
 * In-memory optimization shadow metrics — structured logs + dashboard snapshot.
 * Disable: OPTIMIZATION_SHADOW_METRICS_DISABLED=1
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  DivergenceSeverity,
  OptimizationShadowDashboardSnapshot,
  OptimizationShadowEvent,
} from './shadow-divergence.types';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';

const MAX_EVENT_RING = 200;
const MAX_LATENCY_SAMPLES = 500;
const MAX_REVIEW_ARTIFACTS = 200;

export interface ShadowReviewArtifact {
  comparisonId: string;
  tripId: string;
  candidatesById: Record<string, DecisionCandidate>;
  constraintReportsByCandidateId: Record<string, CanonicalConstraintReport>;
  recordedAt: string;
}

@Injectable()
export class OptimizationShadowMetricsCollector {
  private readonly logger = new Logger(OptimizationShadowMetricsCollector.name);
  private readonly disabled = process.env.OPTIMIZATION_SHADOW_METRICS_DISABLED === '1';

  private shadowRunTotal = 0;
  private shadowSuccessCount = 0;
  private shadowTimeoutCount = 0;
  private shadowErrorCount = 0;
  private inputMismatchCount = 0;
  private top1DivergenceCount = 0;
  private feasibilityDivergenceCount = 0;
  private constraintDivergenceCount = 0;
  private tieBreakDivergenceCount = 0;
  private divergenceExplainedCount = 0;
  private stageTraceCompleteCount = 0;
  private authorityHardViolationCount = 0;
  private shadowHardViolationCount = 0;
  private postValidationRejectionCount = 0;
  private unknownToPassCount = 0;

  private top3OverlapSum = 0;
  private rankingCorrelationSum = 0;
  private qualitySampleCount = 0;
  private corePoiDeltaSum = 0;
  private travelTimeDeltaSum = 0;
  private loadDeltaSum = 0;
  private minMemberUtilityDeltaSum = 0;
  private budgetDeviationDeltaSum = 0;

  private readonly byType = new Map<string, number>();
  private readonly bySeverity = new Map<DivergenceSeverity, number>();
  private readonly latencySamples: number[] = [];
  private readonly eventRing: OptimizationShadowEvent[] = [];
  private readonly reviewArtifacts = new Map<string, ShadowReviewArtifact>();

  recordShadowEvent(
    event: OptimizationShadowEvent,
    artifacts?: Omit<ShadowReviewArtifact, 'comparisonId' | 'recordedAt'>,
  ): void {
    if (this.disabled) return;

    this.shadowRunTotal += 1;
    this.eventRing.unshift(event);
    if (this.eventRing.length > MAX_EVENT_RING) this.eventRing.pop();

    if (artifacts) {
      this.reviewArtifacts.set(event.comparisonId, {
        comparisonId: event.comparisonId,
        tripId: event.tripId,
        candidatesById: artifacts.candidatesById,
        constraintReportsByCandidateId: artifacts.constraintReportsByCandidateId,
        recordedAt: new Date().toISOString(),
      });
      if (this.reviewArtifacts.size > MAX_REVIEW_ARTIFACTS) {
        const oldest = [...this.reviewArtifacts.keys()][0];
        if (oldest) this.reviewArtifacts.delete(oldest);
      }
    }

    const shadow = event.shadowResult;
    if (shadow?.success) this.shadowSuccessCount += 1;
    if (shadow?.timedOut) this.shadowTimeoutCount += 1;
    if (shadow?.error || event.divergence.types.includes('SHADOW_ERROR')) {
      this.shadowErrorCount += 1;
    }
    if (!event.inputConsistent || event.divergence.types.includes('INPUT_MISMATCH')) {
      this.inputMismatchCount += 1;
    }

    if (event.divergence.types.includes('DIFFERENT_WINNER')) {
      this.top1DivergenceCount += 1;
    }
    if (event.divergence.types.includes('FEASIBILITY_DIFFERENCE')) {
      this.feasibilityDivergenceCount += 1;
    }
    if (event.divergence.types.includes('CONSTRAINT_DIFFERENCE')) {
      this.constraintDivergenceCount += 1;
    }
    if (event.divergence.types.includes('TIE_BREAK_DIFFERENCE')) {
      this.tieBreakDivergenceCount += 1;
    }
    if (event.divergence.explainability.length > 0) {
      this.divergenceExplainedCount += 1;
    }
    if (event.divergence.stageTraceComplete) {
      this.stageTraceCompleteCount += 1;
    }

    if (event.authorityResult.hardViolation) this.authorityHardViolationCount += 1;
    if (shadow?.hardViolation) this.shadowHardViolationCount += 1;
    if (event.authorityResult.postValidationRejected || shadow?.postValidationRejected) {
      this.postValidationRejectionCount += 1;
    }
    if (
      event.authorityResult.feasibilityStatus === 'FEASIBLE' &&
      shadow?.feasibilityStatus === 'UNVERIFIED'
    ) {
      this.unknownToPassCount += 1;
    }

    for (const t of event.divergence.types) {
      this.byType.set(t, (this.byType.get(t) ?? 0) + 1);
    }
    this.bySeverity.set(
      event.divergence.severity,
      (this.bySeverity.get(event.divergence.severity) ?? 0) + 1,
    );

    if (event.divergence.top3OverlapRate != null) {
      this.top3OverlapSum += event.divergence.top3OverlapRate;
    }
    if (event.divergence.rankingCorrelation != null) {
      this.rankingCorrelationSum += event.divergence.rankingCorrelation;
    }

    if (event.qualityDeltas) {
      this.qualitySampleCount += 1;
      this.corePoiDeltaSum += event.qualityDeltas.corePoiDelta ?? 0;
      this.travelTimeDeltaSum += event.qualityDeltas.travelTimeDelta ?? 0;
      this.loadDeltaSum += event.qualityDeltas.loadDelta ?? 0;
      this.minMemberUtilityDeltaSum += event.qualityDeltas.minMemberUtilityDelta ?? 0;
      this.budgetDeviationDeltaSum += event.qualityDeltas.budgetDeviationDelta ?? 0;
    }

    if (shadow?.elapsedMs != null) {
      this.latencySamples.push(shadow.elapsedMs);
      if (this.latencySamples.length > MAX_LATENCY_SAMPLES) {
        this.latencySamples.shift();
      }
    }

    this.logger.log(
      JSON.stringify({
        tripnara_metric: 'optimization_shadow_comparison',
        comparison_id: event.comparisonId,
        trip_id: event.tripId,
        runtime_mode: event.runtimeMode,
        authority_strategy: event.authorityStrategyId,
        shadow_strategy: event.shadowStrategyId,
        diverged: event.divergence.diverged,
        severity: event.divergence.severity,
        types: event.divergence.types,
        input_consistent: event.inputConsistent,
        authority_selected: event.authorityResult.selectedCandidateId,
        shadow_selected: event.shadowResult?.selectedCandidateId,
        explainability: event.divergence.explainability,
      }),
    );
  }

  getDashboardSnapshot(limit = 20): OptimizationShadowDashboardSnapshot {
    const total = Math.max(this.shadowRunTotal, 1);
    const qualityN = Math.max(this.qualitySampleCount, 1);

    return {
      schemaId: 'tripnara.optimization_shadow_dashboard@v1',
      collectedAt: new Date().toISOString(),
      runtimeHealth: {
        shadow_run_total: this.shadowRunTotal,
        shadow_success_rate: this.shadowSuccessCount / total,
        shadow_timeout_rate: this.shadowTimeoutCount / total,
        shadow_error_rate: this.shadowErrorCount / total,
        input_mismatch_rate: this.inputMismatchCount / total,
        shadow_elapsed_ms_p50: percentile(this.latencySamples, 50),
        shadow_elapsed_ms_p95: percentile(this.latencySamples, 95),
      },
      divergence: {
        top1_divergence_rate: this.top1DivergenceCount / total,
        top3_overlap_rate_avg: this.top3OverlapSum / total,
        ranking_correlation_avg: this.rankingCorrelationSum / total,
        tie_break_divergence_rate: this.tieBreakDivergenceCount / total,
        feasibility_divergence_rate: this.feasibilityDivergenceCount / total,
        constraint_divergence_rate: this.constraintDivergenceCount / total,
        divergence_explained_rate: this.divergenceExplainedCount / total,
        stage_trace_complete_rate: this.stageTraceCompleteCount / total,
        by_type: Object.fromEntries(this.byType.entries()),
        by_severity: severityRecord(this.bySeverity),
      },
      safety: {
        authority_hard_violation_count: this.authorityHardViolationCount,
        shadow_hard_violation_count: this.shadowHardViolationCount,
        post_validation_rejection_count: this.postValidationRejectionCount,
        unknown_to_pass_count: this.unknownToPassCount,
        write_guard_bypass_count: 0,
      },
      quality: {
        shadow_core_poi_delta_avg: this.corePoiDeltaSum / qualityN,
        shadow_travel_time_delta_avg: this.travelTimeDeltaSum / qualityN,
        shadow_load_delta_avg: this.loadDeltaSum / qualityN,
        shadow_min_member_utility_delta_avg: this.minMemberUtilityDeltaSum / qualityN,
        shadow_budget_deviation_delta_avg: this.budgetDeviationDeltaSum / qualityN,
      },
      recentEvents: this.eventRing.slice(0, limit),
    };
  }

  getRecentEvents(limit = 50): OptimizationShadowEvent[] {
    return this.eventRing.slice(0, limit);
  }

  getRecentEventsFiltered(input: {
    limit?: number;
    decisionRunId?: string;
    tripId?: string;
  }): OptimizationShadowEvent[] {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
    let events = this.eventRing;
    if (input.tripId) {
      events = events.filter((e) => e.tripId === input.tripId);
    }
    if (input.decisionRunId) {
      events = events.filter((e) => e.decisionRunId === input.decisionRunId);
    }
    return events.slice(0, limit);
  }

  getEventByComparisonId(comparisonId: string): OptimizationShadowEvent | undefined {
    return this.eventRing.find((e) => e.comparisonId === comparisonId);
  }

  getReviewArtifact(comparisonId: string): ShadowReviewArtifact | undefined {
    return this.reviewArtifacts.get(comparisonId);
  }
}

function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function severityRecord(
  map: Map<DivergenceSeverity, number>,
): Record<DivergenceSeverity, number> {
  const severities: DivergenceSeverity[] = [
    'NONE',
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ];
  const out = {} as Record<DivergenceSeverity, number>;
  for (const s of severities) out[s] = map.get(s) ?? 0;
  return out;
}
