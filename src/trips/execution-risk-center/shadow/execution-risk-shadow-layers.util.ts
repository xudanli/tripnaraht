/**
 * Three-layer shadow compare inputs — raw risk, cluster, user-visible semantic.
 */

import type { ActiveRisk } from '../types/execution-risk.types';
import {
  aggregateExecutionAlertRisks,
  resolveRequiredAction,
} from '../utils/execution-alerts-aggregation.util';
import { buildExecutionRiskClusters } from '../utils/execution-risk-cluster.util';
import { executionGateToAlertLevel } from '../utils/execution-alerts-projection.util';
import { buildClusterVisibilityComparison } from './cluster-visibility-audit.util';
import type {
  ClusterComparison,
  ExecutionRiskShadowFingerprint,
  RawRiskComparison,
  SemanticComparison,
} from './execution-risk-shadow-compare.types';

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

function canonicalRootSourceKeys(risks: ActiveRisk[]): string[] {
  return risks
    .filter((r) => r.isRootCause !== false)
    .flatMap((r) => r.sourceRefs.map((s) => `${s.sourceSystem}:${s.sourceId}`));
}

function isDerivedRisk(risk: ActiveRisk): boolean {
  return risk.isRootCause === false;
}

function isUnmappedRisk(risk: ActiveRisk): boolean {
  return !risk.knowledgeCode || risk.knowledgeCode === 'UNKNOWN';
}

export function buildRawRiskComparison(input: {
  legacyFingerprints: ExecutionRiskShadowFingerprint[];
  canonicalRisks: ActiveRisk[];
  canonicalFingerprints: ExecutionRiskShadowFingerprint[];
}): RawRiskComparison {
  const legacyKeys = input.legacyFingerprints.map((f) => f.sourceKey);
  const canonicalKeys = input.canonicalFingerprints.map((f) => f.sourceKey);
  const derivedRiskCount = input.canonicalRisks.filter(isDerivedRisk).length;
  const rootCauseCount = input.canonicalRisks.filter((r) => r.isRootCause !== false).length;

  return {
    legacyCount: input.legacyFingerprints.length,
    canonicalCount: input.canonicalFingerprints.length,
    directRiskCount: input.canonicalFingerprints.length - derivedRiskCount,
    derivedRiskCount,
    rootCauseCount,
    unmappedRiskCount: input.canonicalRisks.filter(isUnmappedRisk).length,
    overlapRate: jaccard(legacyKeys, canonicalKeys),
  };
}

export function buildClusterComparison(input: {
  legacyFingerprints: ExecutionRiskShadowFingerprint[];
  canonicalRisks: ActiveRisk[];
  canonicalPrimaryId?: string;
}): ClusterComparison {
  const clusters = buildExecutionRiskClusters(input.canonicalRisks);
  const aggregation = aggregateExecutionAlertRisks(input.canonicalRisks);

  const legacyPrimary = input.legacyFingerprints[0];
  const canonicalPrimary = aggregation.primary?.risk;
  const primaryRiskAgreement =
    Boolean(legacyPrimary) &&
    Boolean(canonicalPrimary) &&
    (legacyPrimary!.sourceKey ===
      `${canonicalPrimary!.sourceRefs[0]?.sourceSystem}:${canonicalPrimary!.sourceRefs[0]?.sourceId}` ||
      legacyPrimary!.title === canonicalPrimary!.title);

  const rootKeys = canonicalRootSourceKeys(input.canonicalRisks);
  const legacyKeys = new Set(input.legacyFingerprints.map((f) => f.sourceKey));
  const unmatchedRootCauses = rootKeys.filter((k) => !legacyKeys.has(k));

  const seenRoots = new Set<string>();
  let duplicateClusterCount = 0;
  for (const cluster of clusters) {
    const key = cluster.rootEventId ?? cluster.primaryKnowledgeCode ?? cluster.primaryRiskId;
    if (seenRoots.has(key)) duplicateClusterCount += 1;
    seenRoots.add(key);
  }

  const legacyIssueCount = input.legacyFingerprints.length;
  const canonicalClusterCount = clusters.length;
  const clusterSemanticAgreementRate =
    legacyIssueCount === 0 && canonicalClusterCount === 0
      ? 1
      : 1 - Math.abs(legacyIssueCount - canonicalClusterCount) / Math.max(legacyIssueCount, canonicalClusterCount, 1);

  return {
    legacyIssueCount,
    canonicalClusterCount,
    canonicalIndependentCount: aggregation.independent.length,
    duplicateClusterCount,
    primaryRiskAgreement,
    unmatchedRootCauses,
    clusterSemanticAgreementRate,
  };
}

export function buildSemanticComparison(input: {
  legacyFingerprints: ExecutionRiskShadowFingerprint[];
  canonicalRisks: ActiveRisk[];
  canonicalPrimaryId?: string;
}): SemanticComparison {
  const aggregation = aggregateExecutionAlertRisks(input.canonicalRisks);
  const clusters = buildExecutionRiskClusters(input.canonicalRisks);

  const legacyTop = input.legacyFingerprints[0]?.level;
  const canonicalTop = aggregation.primary
    ? executionGateToAlertLevel(
        aggregation.primary.risk.executionGate,
        aggregation.primary.risk.level,
      )
    : aggregation.independent[0]
      ? executionGateToAlertLevel(
          aggregation.independent[0].risk.executionGate,
          aggregation.independent[0].risk.level,
        )
      : undefined;

  const legacyRequiredAction = legacyTop ? resolveRequiredAction(legacyTop) : 'NONE';
  const canonicalRequiredAction = canonicalTop ? resolveRequiredAction(canonicalTop) : 'NONE';

  const canonicalVisibleCardCount = aggregation.listAlerts.filter(
    (e) => e.role === 'PRIMARY' || e.role === 'INDEPENDENT',
  ).length;

  const legacyVisibleCardCount = input.legacyFingerprints.length;
  const canonicalAdjustmentItemCount = clusters.filter((c) => c.requiresUserDecision).length;
  const legacyAdjustmentItemCount = input.legacyFingerprints.filter(
    (f) => f.level === 'STOP' || f.level === 'REPLAN_REQUIRED',
  ).length;

  const visibleIds = aggregation.listAlerts.map((e) => e.risk.id);
  const duplicateVisibleItemCount = visibleIds.length - new Set(visibleIds).size;

  const clusterVisibility = buildClusterVisibilityComparison({
    clusters,
    listAlerts: aggregation.listAlerts,
    risks: input.canonicalRisks,
  });

  return {
    legacyVisibleCardCount,
    canonicalVisibleCardCount,
    legacyAdjustmentItemCount,
    canonicalAdjustmentItemCount,
    severityMismatchCount: legacyTop && canonicalTop && legacyTop !== canonicalTop ? 1 : 0,
    requiredActionMismatchCount:
      legacyRequiredAction !== canonicalRequiredAction &&
      (legacyRequiredAction === 'STOP' ||
        canonicalRequiredAction === 'STOP' ||
        legacyRequiredAction === 'REPLAN' ||
        canonicalRequiredAction === 'REPLAN')
        ? 1
        : 0,
    primaryRiskMismatchCount:
      input.legacyFingerprints[0] && aggregation.primary
        ? input.legacyFingerprints[0].sourceKey !==
            `${aggregation.primary.risk.sourceRefs[0]?.sourceSystem}:${aggregation.primary.risk.sourceRefs[0]?.sourceId}` &&
          input.legacyFingerprints[0].title !== aggregation.primary.risk.title
          ? 1
          : 0
        : 0,
    visibleCardCountMismatch: legacyVisibleCardCount !== canonicalVisibleCardCount,
    duplicateVisibleItemCount,
    legacyRequiredAction,
    canonicalRequiredAction,
    legacyTopLevel: legacyTop,
    canonicalTopLevel: canonicalTop,
    clusterVisibility,
  };
}

export function computeRecallMetrics(input: {
  legacyFingerprints: ExecutionRiskShadowFingerprint[];
  canonicalRisks: ActiveRisk[];
}): {
  rootCauseRecallRate: number;
  highPriorityRecallRate: number;
  stopMissCount: number;
} {
  const legacyKeys = new Set(input.legacyFingerprints.map((f) => f.sourceKey));
  const roots = input.canonicalRisks.filter((r) => r.isRootCause !== false);
  const rootKeys = roots.flatMap((r) =>
    r.sourceRefs.map((s) => `${s.sourceSystem}:${s.sourceId}`),
  );

  const recalled = rootKeys.filter((k) => legacyKeys.has(k)).length;
  const rootCauseRecallRate = rootKeys.length === 0 ? 1 : recalled / rootKeys.length;

  const highPriority = input.canonicalRisks.filter(
    (r) => r.executionGate === 'STOP' || r.executionGate === 'REPLAN_REQUIRED' || r.level === 'CRITICAL',
  );
  const highKeys = highPriority.flatMap((r) =>
    r.sourceRefs.map((s) => `${s.sourceSystem}:${s.sourceId}`),
  );
  const highRecalled = highKeys.filter((k) => legacyKeys.has(k)).length;
  const highPriorityRecallRate = highKeys.length === 0 ? 1 : highRecalled / highKeys.length;

  const canonicalStop = input.canonicalRisks.some((r) => r.executionGate === 'STOP');
  const legacyStop = input.legacyFingerprints.some((f) => f.level === 'STOP');
  const stopMissCount = canonicalStop && !legacyStop ? 1 : 0;

  return { rootCauseRecallRate, highPriorityRecallRate, stopMissCount };
}
