/**
 * Compare Legacy alert fingerprints vs Canonical ActiveRisk — three-layer v2.
 */

import type { ActiveRisk } from '../types/execution-risk.types';
import type {
  ExecutionRiskShadowComparison,
  ExecutionRiskShadowFingerprint,
  ExecutionRiskShadowLegSnapshot,
} from './execution-risk-shadow-compare.types';
import { EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID } from './execution-risk-shadow-compare.types';
import {
  buildClusterComparison,
  buildRawRiskComparison,
  buildSemanticComparison,
  computeRecallMetrics,
} from './execution-risk-shadow-layers.util';
import {
  classifyShadowDivergenceKinds,
  pickPrimaryDivergenceKind,
} from './execution-risk-shadow-divergence.util';

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 1 : inter / union;
}

function toLegSnapshot(
  fingerprints: ExecutionRiskShadowFingerprint[],
  primaryId?: string,
): ExecutionRiskShadowLegSnapshot {
  const primary = primaryId
    ? fingerprints.find((f) => f.id === primaryId) ?? fingerprints[0]
    : fingerprints[0];

  return {
    alertCount: fingerprints.length,
    topLevel: fingerprints[0]?.level,
    primaryId: primary?.id,
    primaryTitle: primary?.title,
    fingerprintIds: fingerprints.map((f) => f.id),
    sourceKeys: fingerprints.map((f) => f.sourceKey),
  };
}

export function buildExecutionRiskShadowComparison(input: {
  tripId: string;
  legacyFingerprints: ExecutionRiskShadowFingerprint[];
  canonicalFingerprints: ExecutionRiskShadowFingerprint[];
  canonicalRisks: ActiveRisk[];
  canonicalPrimaryId?: string;
  unknownKnowledgeCodeCount?: number;
  planVersionId?: string;
}): ExecutionRiskShadowComparison {
  const legacy = toLegSnapshot(input.legacyFingerprints);
  const canonical = toLegSnapshot(input.canonicalFingerprints, input.canonicalPrimaryId);

  const rawRiskComparison = buildRawRiskComparison({
    legacyFingerprints: input.legacyFingerprints,
    canonicalRisks: input.canonicalRisks,
    canonicalFingerprints: input.canonicalFingerprints,
  });

  const clusterComparison = buildClusterComparison({
    legacyFingerprints: input.legacyFingerprints,
    canonicalRisks: input.canonicalRisks,
    canonicalPrimaryId: input.canonicalPrimaryId,
  });

  const semanticComparison = buildSemanticComparison({
    legacyFingerprints: input.legacyFingerprints,
    canonicalRisks: input.canonicalRisks,
    canonicalPrimaryId: input.canonicalPrimaryId,
  });

  const sourceKeyOverlapRate = jaccard(legacy.sourceKeys, canonical.sourceKeys);
  const levelAgreement = legacy.topLevel === canonical.topLevel;
  const primaryAgreement =
    clusterComparison.primaryRiskAgreement ||
    (Boolean(legacy.primaryId) &&
      Boolean(canonical.primaryId) &&
      sourceKeyOverlapRate >= 0.8);

  const unknownKnowledgeCodeCount = input.unknownKnowledgeCodeCount ?? 0;
  const recall = computeRecallMetrics({
    legacyFingerprints: input.legacyFingerprints,
    canonicalRisks: input.canonicalRisks,
  });

  const divergenceKinds = classifyShadowDivergenceKinds({
    legacy,
    canonical,
    raw: rawRiskComparison,
    cluster: clusterComparison,
    semantic: semanticComparison,
    unknownKnowledgeCodeCount,
    sourceKeyOverlapRate,
    levelAgreement,
    primaryAgreement,
    stopMissCount: recall.stopMissCount,
  });

  const divergenceKind = pickPrimaryDivergenceKind(divergenceKinds);

  return {
    schemaId: EXECUTION_RISK_SHADOW_COMPARISON_SCHEMA_ID,
    tripId: input.tripId,
    comparedAt: new Date().toISOString(),
    planVersionId: input.planVersionId,
    diverged: divergenceKind !== 'ALIGNED',
    divergenceKind,
    divergenceKinds,
    legacy,
    canonical,
    rawRiskComparison,
    clusterComparison,
    semanticComparison,
    metrics: {
      sourceKeyOverlapRate,
      levelAgreement,
      primaryAgreement,
      countDelta: canonical.alertCount - legacy.alertCount,
      unknownKnowledgeCodeCount,
      rootCauseRecallRate: recall.rootCauseRecallRate,
      highPriorityRecallRate: recall.highPriorityRecallRate,
      stopMissCount: recall.stopMissCount,
    },
  };
}
