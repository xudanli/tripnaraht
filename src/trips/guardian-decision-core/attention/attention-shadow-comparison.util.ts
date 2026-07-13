/**
 * Slice 4 Shadow — legacy queue vs shadow cluster comparison.
 */

import type {
  AttentionOrchestrationProblemInput,
  AttentionShadowComparison,
  AttentionShadowReviewStatus,
  AttentionShadowVerdict,
  RootCauseCluster,
  UnifiedDecisionItemProjection,
} from '../contracts/attention-orchestration.types';
import { shouldMergeProblems } from './attention-orchestration.runtime';
import { buildShadowOrchestrationContext } from './unified-row-to-orchestration-input.adapter';
import {
  isSlice4ShadowObserveOnlyCapability,
  normalizeShadowSemanticCapability,
} from './unified-row-to-orchestration-input.adapter';

export interface AttentionShadowComparisonInput {
  tripId: string;
  inputProblems: AttentionOrchestrationProblemInput[];
  legacyVisible: Array<{ problemId: string; semanticKey: string }>;
  shadowClusters: RootCauseCluster[];
  shadowPrimaryItems: UnifiedDecisionItemProjection[];
  observeOnlyProblems?: AttentionOrchestrationProblemInput[];
}

export interface ShadowQuickExpectation {
  verdict: AttentionShadowVerdict;
  shadowClusterCount?: number;
  shadowVisibleCount?: number;
  primarySemanticCapability?: string;
  minAttentionLevel?: string;
  rootCauseType?: string;
}

export function compareAttentionShadowProjection(
  input: AttentionShadowComparisonInput,
  expectation?: ShadowQuickExpectation,
): AttentionShadowComparison {
  if (expectation) {
    return compareWithExpectation(input, expectation);
  }
  return compareHeuristic(input);
}

function compareWithExpectation(
  input: AttentionShadowComparisonInput,
  expectation: ShadowQuickExpectation,
): AttentionShadowComparison {
  const legacyVisibleCount = input.legacyVisible.length;
  const shadowVisibleCount = input.shadowPrimaryItems.length;
  const shadowClusterCount = input.shadowClusters.filter((c) => c.status === 'OPEN').length;

  const mismatches: string[] = [];

  if (
    expectation.shadowClusterCount != null &&
    shadowClusterCount !== expectation.shadowClusterCount
  ) {
    mismatches.push(
      `expected ${expectation.shadowClusterCount} clusters, got ${shadowClusterCount}`,
    );
  }
  if (
    expectation.shadowVisibleCount != null &&
    shadowVisibleCount !== expectation.shadowVisibleCount
  ) {
    mismatches.push(
      `expected ${expectation.shadowVisibleCount} visible items, got ${shadowVisibleCount}`,
    );
  }
  if (expectation.primarySemanticCapability) {
    const primary = input.shadowPrimaryItems[0];
    if (primary?.primarySemanticCapability !== expectation.primarySemanticCapability) {
      mismatches.push(
        `expected primary ${expectation.primarySemanticCapability}, got ${primary?.primarySemanticCapability ?? 'none'}`,
      );
    }
  }
  if (expectation.rootCauseType) {
    const cluster = input.shadowClusters[0];
    if (cluster?.rootCauseType !== expectation.rootCauseType) {
      mismatches.push(
        `expected rootCauseType ${expectation.rootCauseType}, got ${cluster?.rootCauseType ?? 'none'}`,
      );
    }
  }

  const reviewStatus: AttentionShadowReviewStatus =
    mismatches.length === 0 ? 'AUTO_PASS' : 'AUTO_PENDING_HUMAN';

  return {
    verdict: mismatches.length === 0 ? expectation.verdict : mapVerdictOnMismatch(expectation.verdict),
    reason:
      mismatches.length === 0
        ? `Deterministic expectation ${expectation.verdict} met`
        : mismatches.join('; '),
    reviewStatus,
    legacyVisibleCount,
    shadowVisibleCount,
    shadowClusterCount,
  };
}

function mapVerdictOnMismatch(expected: AttentionShadowVerdict): AttentionShadowVerdict {
  switch (expected) {
    case 'CORRECT_MERGE':
      return 'MISSED_MERGE';
    case 'CORRECT_SEPARATION':
      return 'FALSE_MERGE';
    default:
      return 'INCONCLUSIVE';
  }
}

function compareHeuristic(input: AttentionShadowComparisonInput): AttentionShadowComparison {
  const legacyVisibleCount = input.legacyVisible.length;
  const shadowVisibleCount = input.shadowPrimaryItems.length;
  const openClusters = input.shadowClusters.filter((c) => c.status === 'OPEN');
  const shadowClusterCount = openClusters.length;

  const falseMerge = detectFalseMerge(input, openClusters);
  if (falseMerge) {
    return buildComparison('FALSE_MERGE', falseMerge, legacyVisibleCount, shadowVisibleCount, shadowClusterCount);
  }

  const missedMerge = detectMissedMerge(input, openClusters);
  if (missedMerge) {
    return buildComparison('MISSED_MERGE', missedMerge, legacyVisibleCount, shadowVisibleCount, shadowClusterCount);
  }

  if (legacyVisibleCount > 1 && shadowVisibleCount === 1 && shadowClusterCount === 1) {
    return buildComparison(
      'CORRECT_MERGE',
      'Legacy queue has multiple visible items; shadow converged to one primary item',
      legacyVisibleCount,
      shadowVisibleCount,
      shadowClusterCount,
      'AUTO_PENDING_HUMAN',
    );
  }

  if (legacyVisibleCount >= 2 && shadowClusterCount >= 2) {
    return buildComparison(
      'CORRECT_SEPARATION',
      'Unrelated problems remain in separate clusters',
      legacyVisibleCount,
      shadowVisibleCount,
      shadowClusterCount,
      'AUTO_PENDING_HUMAN',
    );
  }

  if (legacyVisibleCount === 0 && shadowVisibleCount === 0) {
    return buildComparison(
      'NO_OP',
      'No visible legacy or shadow items',
      legacyVisibleCount,
      shadowVisibleCount,
      shadowClusterCount,
      'AUTO_PASS',
    );
  }

  return buildComparison(
    'INCONCLUSIVE',
    'Heuristic could not classify merge/separation outcome',
    legacyVisibleCount,
    shadowVisibleCount,
    shadowClusterCount,
    'AUTO_PENDING_HUMAN',
  );
}

function detectFalseMerge(
  input: AttentionShadowComparisonInput,
  clusters: RootCauseCluster[],
): string | null {
  const ctx = buildShadowOrchestrationContext(input.tripId, input.inputProblems);
  const byId = new Map(input.inputProblems.map((p) => [p.problemId, p]));

  for (const cluster of clusters) {
    const memberIds = [cluster.primaryProblemId, ...cluster.relatedProblemIds];
    const members = memberIds.map((id) => byId.get(id)).filter(Boolean) as AttentionOrchestrationProblemInput[];

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        if (!shouldMergeProblems(members[i], members[j], ctx, undefined)) {
          return `Cluster ${cluster.clusterId} merges unrelated problems ${members[i].problemId} and ${members[j].problemId}`;
        }
      }
    }
  }

  const observe = input.observeOnlyProblems ?? [];
  for (const cluster of clusters) {
    if (cluster.rootCauseType !== 'WEATHER_STRONG_WIND') continue;
    for (const road of observe) {
      if (isSlice4ShadowObserveOnlyCapability(road.semanticCapability)) {
        const memberIds = new Set([cluster.primaryProblemId, ...cluster.relatedProblemIds]);
        if (memberIds.has(road.problemId)) {
          return `Weather cluster incorrectly includes road problem ${road.problemId}`;
        }
      }
    }
  }

  return null;
}

function detectMissedMerge(
  input: AttentionShadowComparisonInput,
  clusters: RootCauseCluster[],
): string | null {
  const ctx = buildShadowOrchestrationContext(input.tripId, input.inputProblems);
  const windProblems = input.inputProblems.filter(
    (p) => normalizeShadowSemanticCapability(p.semanticCapability) === 'WEATHER_STRONG_WIND' ||
      p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE' ||
      p.semanticCapability === 'NIGHT_DRIVING_RISK',
  );

  if (windProblems.length < 2) return null;

  const clusterByProblem = new Map<string, string>();
  for (const cluster of clusters) {
    clusterByProblem.set(cluster.primaryProblemId, cluster.clusterId);
    for (const id of cluster.relatedProblemIds) {
      clusterByProblem.set(id, cluster.clusterId);
    }
  }

  const rootKeys = new Set<string>();
  for (const p of windProblems) {
    if (shouldMergeProblems(windProblems[0], p, ctx, undefined)) {
      rootKeys.add(clusterByProblem.get(p.problemId) ?? 'missing');
    }
  }

  if (rootKeys.size > 1) {
    return `Wind-chain problems split across ${rootKeys.size} clusters`;
  }

  return null;
}

function buildComparison(
  verdict: AttentionShadowVerdict,
  reason: string,
  legacyVisibleCount: number,
  shadowVisibleCount: number,
  shadowClusterCount: number,
  reviewStatus: AttentionShadowReviewStatus = 'AUTO_PENDING_HUMAN',
): AttentionShadowComparison {
  return {
    verdict,
    reason,
    reviewStatus,
    legacyVisibleCount,
    shadowVisibleCount,
    shadowClusterCount,
  };
}

export function countCrossModuleClusters(clusters: RootCauseCluster[]): number {
  return clusters.filter((c) => {
    const caps = new Set(
      [c.primaryProblemId, ...c.relatedProblemIds].map(() => c.rootCauseType),
    );
    return caps.size > 1;
  }).length;
}

export function clusterHasExecutionAndWeather(cluster: RootCauseCluster): boolean {
  return (
    cluster.rootCauseType === 'WEATHER_STRONG_WIND' &&
    cluster.relatedProblemIds.length > 0
  );
}

export function clusterHasExecutionAndNightRisk(
  cluster: RootCauseCluster,
  problems: AttentionOrchestrationProblemInput[],
): boolean {
  const ids = new Set([cluster.primaryProblemId, ...cluster.relatedProblemIds]);
  const caps = problems.filter((p) => ids.has(p.problemId)).map((p) => p.semanticCapability);
  return (
    caps.includes('EXECUTION_SCHEDULE_INFEASIBLE') && caps.includes('NIGHT_DRIVING_RISK')
  );
}
