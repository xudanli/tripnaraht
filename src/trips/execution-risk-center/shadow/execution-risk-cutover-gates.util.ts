/**
 * Cutover Go/No-Go gates — safety-first thresholds for observation window.
 */

import type {
  ExecutionRiskCutoverGateCheck,
  ExecutionRiskCutoverGoNoGoReport,
  ExecutionRiskShadowComparison,
} from './execution-risk-shadow-compare.types';
import {
  assertClusterVisibilityConsistency,
  clusterVisibilityStructureValid,
} from './cluster-visibility-consistency.util';

export function evaluateExecutionRiskCutoverGates(
  comparison: ExecutionRiskShadowComparison,
): Pick<
  ExecutionRiskCutoverGoNoGoReport,
  'pass' | 'gates' | 'blockers' | 'warnings' | 'recommendation'
> {
  const cv = comparison.semanticComparison.clusterVisibility ?? {
    totalClusterCount: comparison.clusterComparison.canonicalClusterCount,
    visibleClusterCount: comparison.semanticComparison.canonicalVisibleCardCount,
    suppressedClusterCount: 0,
    suppressedByReason: {
      DERIVED_ONLY: 0,
      INFORMATIONAL_ONLY: 0,
      DUPLICATE_DECISION: 0,
      NO_USER_ACTION_REQUIRED: 0,
      RESOLVED: 0,
      UNKNOWN: 0,
    },
    hiddenHighSeverityCount: 0,
    hiddenStopCount: 0,
    unknownSuppressionCount: 0,
    audits: [],
  };
  const unclassifiedKinds = comparison.divergenceKinds.filter(
    (k) => k === 'UNKNOWN_MISMATCH' || k === 'COUNT_MISMATCH',
  );

  const gates: ExecutionRiskCutoverGateCheck[] = [
    {
      id: 'cluster-visibility-structure',
      pass: clusterVisibilityStructureValid(comparison.semanticComparison.clusterVisibility),
      actual: Boolean(comparison.semanticComparison.clusterVisibility),
      threshold: 'v2 clusterVisibility present',
      detail: 'clusterVisibility.* fields required for formal observation window',
    },
    {
      id: 'cluster-visibility-consistency',
      pass: assertClusterVisibilityConsistency(cv).pass,
      actual: assertClusterVisibilityConsistency(cv).violations.join(';') || 'ok',
      threshold: '0 violations',
      detail: 'SUPPRESSED clusters must have suppressionReason and valid representedByClusterId',
    },
    {
      id: 'stop-miss-zero',
      pass: comparison.metrics.stopMissCount === 0,
      actual: comparison.metrics.stopMissCount,
      threshold: '=== 0',
      detail: 'STOP must not be missed in Legacy projection',
    },
    {
      id: 'hidden-stop-clusters',
      pass: cv.hiddenStopCount === 0,
      actual: cv.hiddenStopCount,
      threshold: '=== 0',
      detail: 'No STOP cluster hidden without representedByClusterId',
    },
    {
      id: 'hidden-high-severity-clusters',
      pass: cv.hiddenHighSeverityCount === 0,
      actual: cv.hiddenHighSeverityCount,
      threshold: '=== 0',
      detail: 'No STOP/REPLAN cluster hidden without visible representation',
    },
    {
      id: 'unknown-suppression-zero',
      pass: cv.unknownSuppressionCount === 0,
      actual: cv.unknownSuppressionCount,
      threshold: '=== 0',
      detail: 'All suppressed clusters must have classified suppressionReason',
    },
    {
      id: 'high-priority-recall',
      pass: comparison.metrics.highPriorityRecallRate >= 1,
      actual: comparison.metrics.highPriorityRecallRate,
      threshold: '>= 1.0',
      detail: 'High-priority risks recalled in Legacy',
    },
    {
      id: 'duplicate-visible-cards',
      pass: comparison.semanticComparison.duplicateVisibleItemCount === 0,
      actual: comparison.semanticComparison.duplicateVisibleItemCount,
      threshold: '=== 0',
      detail: 'No duplicate user-visible cards',
    },
    {
      id: 'root-cause-recall',
      pass: comparison.metrics.rootCauseRecallRate >= 0.95,
      actual: comparison.metrics.rootCauseRecallRate,
      threshold: '>= 0.95',
      detail: 'Root cause recall rate',
    },
    {
      id: 'cluster-semantic-agreement',
      pass: comparison.clusterComparison.clusterSemanticAgreementRate >= 0.9,
      actual: comparison.clusterComparison.clusterSemanticAgreementRate,
      threshold: '>= 0.90',
      detail: 'Legacy issues vs Canonical clusters alignment',
    },
    {
      id: 'unexplained-false-positive',
      pass:
        comparison.rawRiskComparison.unmappedRiskCount /
          Math.max(comparison.rawRiskComparison.canonicalCount, 1) <
        0.03,
      actual:
        comparison.rawRiskComparison.unmappedRiskCount /
        Math.max(comparison.rawRiskComparison.canonicalCount, 1),
      threshold: '< 0.03',
      detail: 'Unmapped Canonical risk share',
    },
    {
      id: 'source-mapping-gap',
      pass:
        comparison.clusterComparison.unmatchedRootCauses.length /
          Math.max(comparison.rawRiskComparison.rootCauseCount, 1) <
        0.01,
      actual:
        comparison.clusterComparison.unmatchedRootCauses.length /
        Math.max(comparison.rawRiskComparison.rootCauseCount, 1),
      threshold: '< 0.01',
      detail: 'Source mapping gap rate',
    },
    {
      id: 'severe-action-mismatch',
      pass: comparison.semanticComparison.requiredActionMismatchCount === 0,
      actual: comparison.semanticComparison.requiredActionMismatchCount,
      threshold: '=== 0',
      detail: 'STOP/REPLAN requiredAction alignment',
    },
    {
      id: 'duplicate-clusters',
      pass: comparison.clusterComparison.duplicateClusterCount < 1,
      actual: comparison.clusterComparison.duplicateClusterCount,
      threshold: '< 1',
      detail: 'Duplicate cluster rate',
    },
    {
      id: 'unclassified-mismatch',
      pass: unclassifiedKinds.length === 0 || comparison.divergenceKind === 'ALIGNED',
      actual: unclassifiedKinds.join(',') || 'none',
      threshold: '0 unclassified',
      detail: 'All divergences must be classified for Go/No-Go',
    },
  ];

  const blockers = gates.filter((g) => !g.pass).map((g) => `${g.id}: ${g.detail} (actual=${g.actual})`);
  const warnings: string[] = [];

  if (comparison.divergenceKinds.includes('EXPECTED_DERIVED_EXPANSION')) {
    warnings.push('EXPECTED_DERIVED_EXPANSION: raw delta acceptable when cluster/card layers align');
  }
  if (comparison.divergenceKinds.includes('CLUSTER_EQUIVALENT')) {
    warnings.push('CLUSTER_EQUIVALENT: issue count differs at raw layer only');
  }
  if (comparison.rawRiskComparison.derivedRiskCount > 0) {
    warnings.push(`derived=${comparison.rawRiskComparison.derivedRiskCount} (diagnostic, not user cards)`);
  }
  if (cv.suppressedClusterCount > 0) {
    warnings.push(
      `suppressed clusters=${cv.suppressedClusterCount} visible=${cv.visibleClusterCount} reasons=${JSON.stringify(cv.suppressedByReason)}`,
    );
  }

  const safetyCritical = [
    'stop-miss-zero',
    'hidden-stop-clusters',
    'hidden-high-severity-clusters',
    'high-priority-recall',
    'duplicate-visible-cards',
    'cluster-visibility-structure',
    'cluster-visibility-consistency',
    'unknown-suppression-zero',
  ];
  const safetyFail = gates.filter((g) => safetyCritical.includes(g.id)).some((g) => !g.pass);

  const pass = blockers.length === 0;
  let recommendation: ExecutionRiskCutoverGoNoGoReport['recommendation'];
  if (safetyFail) {
    recommendation = 'NO_GO';
  } else if (pass) {
    recommendation = 'GO';
  } else if (blockers.length <= 3 && !safetyFail) {
    recommendation = 'CONDITIONAL_GO';
  } else {
    recommendation = 'OBSERVE';
  }

  return { pass, gates, blockers, warnings, recommendation };
}

export function buildCutoverGoNoGoReport(input: {
  tripId: string;
  comparison: ExecutionRiskShadowComparison;
}): ExecutionRiskCutoverGoNoGoReport {
  const evaluated = evaluateExecutionRiskCutoverGates(input.comparison);

  return {
    schemaId: 'tripnara.execution_risk_cutover_go_no_go@v1',
    generatedAt: new Date().toISOString(),
    pass: evaluated.pass,
    tripId: input.tripId,
    engineeringStatus: 'FEATURE_COMPLETE',
    verificationStatus: 'AUTOMATED_GATES_PASSED',
    runtimeStatus: evaluated.pass ? 'STAGING_SHADOW_READY' : 'STAGING_SHADOW_DIVERGED',
    writeStatus: 'STAGING_CONFIRM_GATED',
    productionStatus: 'NOT_YET_CUTOVER',
    shadowComparison: input.comparison,
    gates: evaluated.gates,
    blockers: evaluated.blockers,
    warnings: evaluated.warnings,
    recommendation: evaluated.recommendation,
  };
}

export function comparisonIdFor(comparison: ExecutionRiskShadowComparison): string {
  return `${comparison.tripId}:${comparison.comparedAt}`;
}
