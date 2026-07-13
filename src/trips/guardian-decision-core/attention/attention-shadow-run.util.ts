/**
 * Pure Shadow run — rebuild projection from problems (no persistence, no queue mutation).
 */

import type { DecisionProblemOccurrence } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { InternalUnifiedProblemRow } from '../../../decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import type {
  AttentionOrchestrationProblemInput,
  AttentionShadowComparison,
  AttentionShadowEvidence,
  AttentionShadowRunResult,
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../contracts/attention-orchestration.types';
import { AttentionOrchestrationRuntime } from './attention-orchestration.runtime';
import {
  clusterHasExecutionAndNightRisk,
  clusterHasExecutionAndWeather,
  compareAttentionShadowProjection,
  type ShadowQuickExpectation,
} from './attention-shadow-comparison.util';
import {
  buildShadowOrchestrationContext,
  filterRowsForSlice4ShadowIngest,
  mapUnifiedRowToOrchestrationInput,
  projectLegacyVisibleQueueItems,
  isSlice4ShadowObserveOnlyCapability,
} from './unified-row-to-orchestration-input.adapter';
import { buildAttentionShadowEvidence } from './attention-shadow-evidence.writer';
import type { AttentionOrchestrationShadowMetricsSnapshot } from '../contracts/attention-orchestration.types';

export interface AttentionShadowRunInput {
  tripId: string;
  rows: InternalUnifiedProblemRow[];
  source: AttentionShadowEvidence['source'];
  runAt?: string;
  contextOverrides?: {
    routeSegmentId?: string;
    weatherEpisodeId?: string;
    now?: string;
  };
  expectation?: ShadowQuickExpectation;
  lineageOverlay?: Array<{
    problemId: string;
    weatherEpisodeId?: string;
    causedByProblemId?: string;
  }>;
  sampleId?: string;
  sampleGroup?: AttentionShadowEvidence['sampleGroup'];
  writeEvidence?: (evidence: AttentionShadowEvidence) => string | undefined;
}

export interface AttentionShadowRunOutput {
  inputProblems: AttentionOrchestrationProblemInput[];
  observeOnlyProblems: AttentionOrchestrationProblemInput[];
  legacyVisible: ReturnType<typeof projectLegacyVisibleQueueItems>;
  shadowClusters: RootCauseCluster[];
  shadowPrimaryItems: UnifiedDecisionItemProjection[];
  comparison: AttentionShadowComparison;
  metricsDelta: Partial<AttentionOrchestrationShadowMetricsSnapshot>;
}

export function runAttentionShadowProjection(
  input: AttentionShadowRunInput,
): AttentionShadowRunOutput {
  const runAt = input.runAt ?? new Date().toISOString();
  const ingestRows = filterRowsForSlice4ShadowIngest(input.rows);

  const inputProblems: AttentionOrchestrationProblemInput[] = [];
  for (const row of ingestRows) {
    const mapped = mapUnifiedRowToOrchestrationInput(row);
    if (mapped) inputProblems.push({ ...mapped, tripId: input.tripId });
  }

  applyLineageOverlay(inputProblems, input.lineageOverlay ?? []);

  const observeOnlyProblems: AttentionOrchestrationProblemInput[] = [];
  for (const row of input.rows) {
    if (!isSlice4ShadowObserveOnlyCapability(row.semanticKey)) continue;
    observeOnlyProblems.push({
      problemId: row.problemId,
      tripId: input.tripId,
      semanticCapability: row.semanticKey,
      status: 'OPEN',
      detectedAt:
        row.occurrences[0]?.observedAt ?? input.runAt ?? new Date().toISOString(),
      routeSegmentId: row.scope.routeSegmentIds?.[0],
      urgency: row.enforcement === 'BLOCK' ? 'CRITICAL' : undefined,
    });
  }

  const context = buildShadowOrchestrationContext(
    input.tripId,
    inputProblems,
    input.contextOverrides,
  );

  const runtime = new AttentionOrchestrationRuntime({ now: context.now ?? runAt });
  const sorted = [...inputProblems].sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
  for (const problem of sorted) {
    runtime.ingestProblem(problem, context);
  }

  const shadowClusters = runtime.store.listAll();
  const shadowPrimaryItems = runtime.listVisiblePrimaryItems();
  const legacyVisible = projectLegacyVisibleQueueItems(input.rows);

  const comparison = compareAttentionShadowProjection(
    {
      tripId: input.tripId,
      inputProblems,
      legacyVisible,
      shadowClusters,
      shadowPrimaryItems,
      observeOnlyProblems,
    },
    input.expectation,
  );

  const metricsDelta = buildMetricsDelta({
    inputProblems,
    legacyVisible,
    shadowPrimaryItems,
    shadowClusters,
    comparison,
  });

  return {
    inputProblems,
    observeOnlyProblems,
    legacyVisible,
    shadowClusters,
    shadowPrimaryItems,
    comparison,
    metricsDelta,
  };
}

export function executeAttentionShadowRun(
  input: AttentionShadowRunInput,
): AttentionShadowRunResult {
  const runAt = input.runAt ?? new Date().toISOString();
  const output = runAttentionShadowProjection(input);

  const evidence = buildAttentionShadowEvidence({
    tripId: input.tripId,
    runAt,
    source: input.source,
    sampleId: input.sampleId,
    sampleGroup: input.sampleGroup,
    inputProblems: output.inputProblems,
    legacyProjection: output.legacyVisible,
    shadowClusters: output.shadowClusters,
    shadowPrimaryItems: output.shadowPrimaryItems,
    comparison: output.comparison,
    metricsSnapshot: output.metricsDelta,
  });

  const evidencePath = input.writeEvidence?.(evidence);

  return { evidence, evidencePath };
}

function buildMetricsDelta(input: {
  inputProblems: AttentionOrchestrationProblemInput[];
  legacyVisible: Array<{ problemId: string }>;
  shadowPrimaryItems: UnifiedDecisionItemProjection[];
  shadowClusters: RootCauseCluster[];
  comparison: AttentionShadowComparison;
}): Partial<AttentionOrchestrationShadowMetricsSnapshot> {
  const reduction = Math.max(
    0,
    input.legacyVisible.length - input.shadowPrimaryItems.length,
  );

  let weatherToExecutionClusterCount = 0;
  let executionToNightRiskClusterCount = 0;
  for (const cluster of input.shadowClusters) {
    if (clusterHasExecutionAndWeather(cluster)) weatherToExecutionClusterCount += 1;
    if (clusterHasExecutionAndNightRisk(cluster, input.inputProblems)) {
      executionToNightRiskClusterCount += 1;
    }
  }

  const delta: Partial<AttentionOrchestrationShadowMetricsSnapshot> = {
    inputProblemCount: input.inputProblems.length,
    legacyVisibleItemCount: input.legacyVisible.length,
    shadowVisibleItemCount: input.shadowPrimaryItems.length,
    duplicateVisibleCardReductionCount: reduction,
    duplicateVisibleCardsAvoided: reduction,
    weatherToExecutionClusterCount,
    executionToNightRiskClusterCount,
  };

  switch (input.comparison.verdict) {
    case 'CORRECT_MERGE':
      delta.correctMergeCount = 1;
      break;
    case 'CORRECT_SEPARATION':
      delta.correctSeparationCount = 1;
      break;
    case 'FALSE_MERGE':
      delta.falseMergeCount = 1;
      break;
    case 'MISSED_MERGE':
      delta.missedMergeCount = 1;
      break;
    case 'WRONG_PRIMARY':
      delta.wrongPrimaryCount = 1;
      break;
    case 'WRONG_ATTENTION_LEVEL':
      delta.wrongAttentionLevelCount = 1;
      break;
    default:
      break;
  }

  return delta;
}

export function shadowOccurrence(observedAt: string): DecisionProblemOccurrence {
  return {
    occurrenceId: `occ_${observedAt.replace(/[:.]/g, '_')}`,
    observedAt,
  };
}

/** Build minimal unified row for deterministic drills (no DB). */
export function mockUnifiedProblemRow(
  input: Partial<InternalUnifiedProblemRow> & {
    problemId: string;
    semanticKey: string;
    tripId: string;
  },
): InternalUnifiedProblemRow {
  const tripId = input.tripId;
  const observedAt = input.occurrences?.[0]?.observedAt ?? '2026-07-12T12:00:00.000Z';
  return {
    problemId: input.problemId,
    authority: input.authority ?? 'CANONICAL',
    semanticKey: input.semanticKey,
    instanceKey: input.instanceKey ?? `${input.semanticKey}:${tripId}:${input.problemId}`,
    type: input.type ?? 'INFEASIBILITY',
    dimension: input.dimension ?? 'ENVIRONMENT',
    enforcement: input.enforcement ?? 'REQUIRE_CONFIRMATION',
    phase: input.phase ?? 'EXECUTION',
    affectsPlan: input.affectsPlan ?? true,
    workflowStatus: input.workflowStatus ?? 'WAITING_DECISION',
    executionStatus: input.executionStatus ?? 'NOT_STARTED',
    title: input.title ?? input.semanticKey,
    summary: input.summary ?? input.semanticKey,
    scope: input.scope ?? { tripId, routeSegmentIds: [`segment:${tripId}:drive_day2`] },
    evidenceCount: input.evidenceCount ?? 1,
    evidenceFreshness: input.evidenceFreshness ?? 'FRESH',
    occurrenceCount: input.occurrenceCount ?? 1,
    occurrences: input.occurrences ?? [shadowOccurrence(observedAt)],
    hasExecutableOptions: input.hasExecutableOptions ?? true,
    sourceIds: input.sourceIds ?? [input.problemId],
    detectors: input.detectors ?? [],
    origin: input.origin ?? { authority: 'CANONICAL', primaryDetector: 'RFC001' },
    queueTitle: input.queueTitle,
    queueDescription: input.queueDescription,
    rawCanonical: input.rawCanonical,
    rawLegacy: input.rawLegacy,
  };
}

export type MockUnifiedRowInput = Parameters<typeof mockUnifiedProblemRow>[0];

function applyLineageOverlay(
  problems: AttentionOrchestrationProblemInput[],
  overlay: Array<{
    problemId: string;
    weatherEpisodeId?: string;
    causedByProblemId?: string;
  }>,
): void {
  const byId = new Map(overlay.map((o) => [o.problemId, o]));
  for (let i = 0; i < problems.length; i++) {
    const o = byId.get(problems[i].problemId);
    if (!o) continue;
    problems[i] = {
      ...problems[i],
      weatherEpisodeId: o.weatherEpisodeId ?? problems[i].weatherEpisodeId,
      causedByProblemId: o.causedByProblemId ?? problems[i].causedByProblemId,
    };
  }
}
