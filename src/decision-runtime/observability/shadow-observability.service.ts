/**
 * Shadow observability orchestration — event build + metrics + query.
 */

import { Injectable, Optional } from '@nestjs/common';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { OptimizationProblem } from '../contracts/optimization-problem';
import type { OptimizationResult } from '../contracts/optimization-result';
import type { DecisionRuntimeMode } from '../constraints/constraint-evaluation.config';
import { buildOptimizationShadowEvent } from './shadow-divergence-builder.util';
import type {
  OptimizationShadowDashboardSnapshot,
  OptimizationShadowEvent,
} from './shadow-divergence.types';
import { OptimizationShadowMetricsCollector } from './optimization-shadow-metrics.collector';
import { ShadowEvidenceStore } from './shadow-evidence.store';

@Injectable()
export class ShadowObservabilityService {
  constructor(
    @Optional()
    private readonly metrics?: OptimizationShadowMetricsCollector,
    @Optional()
    private readonly evidenceStore?: ShadowEvidenceStore,
  ) {}

  recordComparison(input: {
    tripId: string;
    decisionRunId: string;
    runtimeMode: DecisionRuntimeMode;
    problem: OptimizationProblem;
    candidates: DecisionCandidate[];
    constraintReports: Record<string, CanonicalConstraintReport>;
    authoritySelectedId?: string;
    authorityOptimizationResult?: OptimizationResult;
    shadowOptimizationResult?: OptimizationResult;
    shadowError?: string;
    authorityElapsedMs?: number;
    inputMismatch?: boolean;
    experimentId?: string;
    scenarioId?: string;
    benchmarkRunId?: string;
    /** Frozen before solvers — preserves full plan JSON for review materialization */
    reviewArtifactCandidatesById?: Record<string, DecisionCandidate>;
  }): OptimizationShadowEvent {
    const event = buildOptimizationShadowEvent(input);
    const candidatesById =
      input.reviewArtifactCandidatesById ??
      Object.fromEntries(input.candidates.map((c) => [c.candidateId, c]));
    const artifacts = {
      tripId: input.tripId,
      candidatesById: cloneReviewCandidatesById(candidatesById),
      constraintReportsByCandidateId: input.constraintReports,
    };
    this.metrics?.recordShadowEvent(event, artifacts);
    void this.evidenceStore
      ?.appendComparison(event, artifacts, {
        experimentId: input.experimentId,
        scenarioId: input.scenarioId,
        benchmarkRunId: input.benchmarkRunId,
      })
      .catch(() => undefined);
    return event;
  }

  getDashboard(limit = 20): OptimizationShadowDashboardSnapshot {
    return (
      this.metrics?.getDashboardSnapshot(limit) ?? emptyDashboard()
    );
  }

  getRecentEvents(limit = 50): OptimizationShadowEvent[] {
    return this.metrics?.getRecentEvents(limit) ?? [];
  }

  getRecentEventsFiltered(input: {
    limit?: number;
    decisionRunId?: string;
    tripId?: string;
  }): OptimizationShadowEvent[] {
    return this.metrics?.getRecentEventsFiltered(input) ?? [];
  }

  getEvent(comparisonId: string): OptimizationShadowEvent | undefined {
    return (
      this.metrics?.getEventByComparisonId(comparisonId) ??
      undefined
    );
  }

  async getEventAsync(comparisonId: string): Promise<OptimizationShadowEvent | undefined> {
    const mem = this.getEvent(comparisonId);
    if (mem) return mem;
    return this.evidenceStore?.getEvent(comparisonId);
  }

  getReviewArtifact(comparisonId: string) {
    return this.metrics?.getReviewArtifact(comparisonId);
  }

  async getReviewArtifactAsync(comparisonId: string) {
    return (
      this.getReviewArtifact(comparisonId) ??
      (await this.evidenceStore?.getArtifacts(comparisonId))
    );
  }
}

function cloneReviewCandidatesById(
  byId: Record<string, DecisionCandidate>,
): Record<string, DecisionCandidate> {
  return JSON.parse(JSON.stringify(byId)) as Record<string, DecisionCandidate>;
}

function emptyDashboard(): OptimizationShadowDashboardSnapshot {
  return {
    schemaId: 'tripnara.optimization_shadow_dashboard@v1',
    collectedAt: new Date().toISOString(),
    runtimeHealth: {
      shadow_run_total: 0,
      shadow_success_rate: 0,
      shadow_timeout_rate: 0,
      shadow_error_rate: 0,
      input_mismatch_rate: 0,
      shadow_elapsed_ms_p50: 0,
      shadow_elapsed_ms_p95: 0,
    },
    divergence: {
      top1_divergence_rate: 0,
      top3_overlap_rate_avg: 0,
      ranking_correlation_avg: 0,
      tie_break_divergence_rate: 0,
      feasibility_divergence_rate: 0,
      constraint_divergence_rate: 0,
      divergence_explained_rate: 0,
      stage_trace_complete_rate: 0,
      by_type: {},
      by_severity: {
        NONE: 0,
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
    },
    safety: {
      authority_hard_violation_count: 0,
      shadow_hard_violation_count: 0,
      post_validation_rejection_count: 0,
      unknown_to_pass_count: 0,
      write_guard_bypass_count: 0,
    },
    quality: {
      shadow_core_poi_delta_avg: 0,
      shadow_travel_time_delta_avg: 0,
      shadow_load_delta_avg: 0,
      shadow_min_member_utility_delta_avg: 0,
      shadow_budget_deviation_delta_avg: 0,
    },
    recentEvents: [],
  };
}
