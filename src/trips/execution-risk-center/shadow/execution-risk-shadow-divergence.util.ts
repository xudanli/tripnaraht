/**
 * Classify shadow divergence into semantic categories for cutover decisions.
 */

import type {
  ClusterComparison,
  ExecutionRiskShadowDivergenceKind,
  ExecutionRiskShadowLegSnapshot,
  RawRiskComparison,
  SemanticComparison,
} from './execution-risk-shadow-compare.types';

export function classifyShadowDivergenceKinds(input: {
  legacy: ExecutionRiskShadowLegSnapshot;
  canonical: ExecutionRiskShadowLegSnapshot;
  raw: RawRiskComparison;
  cluster: ClusterComparison;
  semantic: SemanticComparison;
  unknownKnowledgeCodeCount: number;
  sourceKeyOverlapRate: number;
  levelAgreement: boolean;
  primaryAgreement: boolean;
  stopMissCount: number;
}): ExecutionRiskShadowDivergenceKind[] {
  const kinds: ExecutionRiskShadowDivergenceKind[] = [];

  const fullyAligned =
    input.raw.legacyCount === input.raw.canonicalCount &&
    input.levelAgreement &&
    input.primaryAgreement &&
    input.sourceKeyOverlapRate >= 0.8 &&
    input.unknownKnowledgeCodeCount === 0 &&
    input.semantic.duplicateVisibleItemCount === 0;

  if (fullyAligned) return ['ALIGNED'];

  if (input.semantic.duplicateVisibleItemCount > 0) {
    kinds.push('DUPLICATE_VISIBLE_ITEM');
  }

  if (input.cluster.duplicateClusterCount > 0) {
    kinds.push('DUPLICATE_VISIBLE_ITEM');
  }

  if (input.stopMissCount > 0) {
    kinds.push('SEVERITY_MISMATCH');
  }

  if (input.semantic.requiredActionMismatchCount > 0) {
    kinds.push('ACTION_MISMATCH');
  }

  if (!input.levelAgreement) kinds.push('SEVERITY_MISMATCH');
  if (input.semantic.primaryRiskMismatchCount > 0) kinds.push('PRIMARY_MISMATCH');

  if (input.raw.unmappedRiskCount > 0 && input.sourceKeyOverlapRate < 0.5) {
    kinds.push('SOURCE_MAPPING_GAP');
  }

  if (input.unknownKnowledgeCodeCount > 0) {
    kinds.push('CANONICAL_FALSE_POSITIVE');
  }

  if (
    input.raw.derivedRiskCount > 0 &&
    input.raw.legacyCount < input.raw.canonicalCount &&
    input.cluster.legacyIssueCount === input.cluster.canonicalClusterCount &&
    !input.semantic.visibleCardCountMismatch
  ) {
    kinds.push('EXPECTED_DERIVED_EXPANSION');
  }

  if (
    input.raw.legacyCount !== input.raw.canonicalCount &&
    input.cluster.legacyIssueCount === input.cluster.canonicalClusterCount &&
    Math.abs(input.semantic.legacyVisibleCardCount - input.semantic.canonicalVisibleCardCount) <= 1
  ) {
    kinds.push('CLUSTER_EQUIVALENT');
  }

  if (input.cluster.unmatchedRootCauses.length > 0) {
    kinds.push('LEGACY_MISSED_ROOT_CAUSE');
  }

  if (
    input.raw.canonicalCount > input.raw.legacyCount &&
    input.raw.overlapRate < 0.4 &&
    input.raw.derivedRiskCount === 0
  ) {
    kinds.push('CANONICAL_FALSE_POSITIVE');
  }

  if (input.raw.legacyCount !== input.raw.canonicalCount && !kinds.includes('CLUSTER_EQUIVALENT')) {
    kinds.push('COUNT_MISMATCH');
  }

  if (!input.primaryAgreement && !kinds.includes('PRIMARY_MISMATCH')) {
    kinds.push('PRIMARY_MISMATCH');
  }

  if (input.sourceKeyOverlapRate < 0.6 && !kinds.includes('SOURCE_MAPPING_GAP')) {
    kinds.push('SOURCE_COVERAGE_MISMATCH');
  }

  if (kinds.length === 0) kinds.push('UNKNOWN_MISMATCH');

  return [...new Set(kinds)];
}

export function pickPrimaryDivergenceKind(
  kinds: ExecutionRiskShadowDivergenceKind[],
): ExecutionRiskShadowDivergenceKind {
  const priority: ExecutionRiskShadowDivergenceKind[] = [
    'ALIGNED',
    'DUPLICATE_VISIBLE_ITEM',
    'SEVERITY_MISMATCH',
    'ACTION_MISMATCH',
    'LEGACY_MISSED_ROOT_CAUSE',
    'CANONICAL_FALSE_POSITIVE',
    'SOURCE_MAPPING_GAP',
    'EXPECTED_DERIVED_EXPANSION',
    'CLUSTER_EQUIVALENT',
    'PRIMARY_MISMATCH',
    'COUNT_MISMATCH',
    'LEVEL_MISMATCH',
    'SOURCE_COVERAGE_MISMATCH',
    'UNKNOWN_KNOWLEDGE_CODES',
    'UNKNOWN_MISMATCH',
  ];

  for (const kind of priority) {
    if (kinds.includes(kind)) return kind;
  }
  return kinds[0] ?? 'UNKNOWN_MISMATCH';
}
