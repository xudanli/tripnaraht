/**
 * Adjudicate shadow observation samples against full expectations.
 */

import type {
  AttentionLevel,
  AttentionShadowAdjudicationResult,
  AttentionShadowSampleExpectation,
  AttentionShadowVerdict,
} from '../contracts/attention-orchestration.types';
import type { AttentionShadowRunOutput } from './attention-shadow-run.util';
import { ATTENTION_LEVEL_ORDER } from '../contracts/attention-orchestration.types';

const PRIORITY_VERDICTS = new Set<AttentionShadowVerdict>([
  'FALSE_MERGE',
  'WRONG_PRIMARY',
  'WRONG_ATTENTION',
  'WRONG_RESOLUTION',
]);

export function adjudicateShadowSample(
  spec: AttentionShadowSampleExpectation,
  output: AttentionShadowRunOutput,
): AttentionShadowAdjudicationResult {
  const openClusters = output.shadowClusters.filter((c) => c.status === 'OPEN');
  const clusterCount = openClusters.length;
  const visibleItemCount = output.shadowPrimaryItems.length;

  const primaryProblemId =
    output.shadowPrimaryItems[0]?.primaryProblemId ??
    openClusters[0]?.primaryProblemId;
  const primarySemanticCapability =
    output.shadowPrimaryItems[0]?.primarySemanticCapability ??
    output.inputProblems.find((p) => p.problemId === primaryProblemId)?.semanticCapability;

  const attentionLevel =
    output.shadowPrimaryItems[0]?.attentionLevel ??
    openClusters[0]?.attentionLevel;

  const reasons: string[] = [];
  let actualVerdict: AttentionShadowVerdict = spec.expectedVerdict;

  if (clusterCount !== spec.expectedClusterCount) {
    reasons.push(`cluster count expected ${spec.expectedClusterCount}, got ${clusterCount}`);
    if (clusterCount < spec.expectedClusterCount) actualVerdict = 'MISSED_MERGE';
    if (clusterCount > spec.expectedClusterCount) actualVerdict = 'FALSE_MERGE';
  }

  if (visibleItemCount !== spec.expectedVisibleItemCount) {
    reasons.push(
      `visible items expected ${spec.expectedVisibleItemCount}, got ${visibleItemCount}`,
    );
    if (spec.expectedResolutionBehavior === 'REMOVE_FROM_VISIBLE' && visibleItemCount > 0) {
      actualVerdict = 'WRONG_RESOLUTION';
    }
  }

  if (
    spec.expectedPrimarySemanticCapability &&
    primarySemanticCapability !== spec.expectedPrimarySemanticCapability
  ) {
    reasons.push(
      `primary expected ${spec.expectedPrimarySemanticCapability}, got ${primarySemanticCapability ?? 'none'}`,
    );
    actualVerdict = 'WRONG_PRIMARY';
  }

  if (spec.expectedAttentionLevel && attentionLevel) {
    if (!attentionAtLeast(attentionLevel, spec.expectedAttentionLevel)) {
      reasons.push(
        `attention expected >= ${spec.expectedAttentionLevel}, got ${attentionLevel}`,
      );
      actualVerdict = 'WRONG_ATTENTION';
    }
  }

  if (output.comparison.verdict === 'FALSE_MERGE') {
    actualVerdict = 'FALSE_MERGE';
    reasons.push(output.comparison.reason);
  }

  const pass = reasons.length === 0;

  const priorityFailure = PRIORITY_VERDICTS.has(actualVerdict)
    ? (actualVerdict as AttentionShadowAdjudicationResult['priorityFailure'])
    : undefined;

  return {
    sampleId: spec.sampleId,
    expected: spec,
    actual: {
      clusterCount,
      visibleItemCount,
      primarySemanticCapability,
      attentionLevel,
      verdict: output.comparison.verdict,
    },
    pass,
    priorityFailure,
    reason: pass ? `Sample ${spec.sampleId} PASS` : reasons.join('; '),
  };
}

function attentionAtLeast(actual: AttentionLevel, minimum: AttentionLevel): boolean {
  return ATTENTION_LEVEL_ORDER[actual] >= ATTENTION_LEVEL_ORDER[minimum];
}

export function computeObservationRates(input: {
  results: AttentionShadowAdjudicationResult[];
  deterministicCount: number;
  stagingReplayCount: number;
  duplicateReductionTotal: number;
  legacyVisibleTotal: number;
  resolutionPassCount: number;
  resolutionSampleCount: number;
  preservedCount: number;
}): import('../contracts/attention-orchestration.types').AttentionShadowObservationRates {
  const n = input.results.length || 1;
  const countVerdict = (v: AttentionShadowVerdict) =>
    input.results.filter((r) => r.actual.verdict === v || (!r.pass && r.priorityFailure === v)).length;

  const falseMerge = countVerdict('FALSE_MERGE');
  const missedMerge = countVerdict('MISSED_MERGE');
  const wrongPrimary = input.results.filter((r) => r.priorityFailure === 'WRONG_PRIMARY').length;
  const wrongAttention = input.results.filter((r) => r.priorityFailure === 'WRONG_ATTENTION').length;
  const wrongResolution = input.results.filter((r) => r.priorityFailure === 'WRONG_RESOLUTION').length;
  const passCount = input.results.filter((r) => r.pass).length;

  return {
    sampleCount: input.results.length,
    deterministicCount: input.deterministicCount,
    stagingReplayCount: input.stagingReplayCount,
    falseMergeRate: falseMerge / n,
    missedMergeRate: missedMerge / n,
    wrongPrimaryRate: wrongPrimary / n,
    wrongAttentionRate: wrongAttention / n,
    wrongResolutionRate: wrongResolution / n,
    duplicateReductionRate:
      input.legacyVisibleTotal > 0
        ? input.duplicateReductionTotal / input.legacyVisibleTotal
        : 0,
    resolutionAccuracyRate:
      input.resolutionSampleCount > 0
        ? input.resolutionPassCount / input.resolutionSampleCount
        : 1,
    passRate: passCount / n,
    underlyingProblemsPreservedRate: input.preservedCount / n,
  };
}

export function evaluateExitCriteria(
  rates: import('../contracts/attention-orchestration.types').AttentionShadowObservationRates,
  opts?: { repeatedPollingDuplicates?: number },
): import('../contracts/attention-orchestration.types').AttentionShadowExitCriteria {
  return {
    falseMergeRate: { target: '0%', actual: rates.falseMergeRate, pass: rates.falseMergeRate === 0 },
    wrongPrimaryRate: { target: '0%', actual: rates.wrongPrimaryRate, pass: rates.wrongPrimaryRate === 0 },
    wrongAttentionRate: {
      target: '0%',
      actual: rates.wrongAttentionRate,
      pass: rates.wrongAttentionRate === 0,
    },
    wrongResolutionRate: {
      target: '0%',
      actual: rates.wrongResolutionRate,
      pass: rates.wrongResolutionRate === 0,
    },
    missedMergeRate: {
      target: '≤5%',
      actual: rates.missedMergeRate,
      pass: rates.missedMergeRate <= 0.05,
    },
    duplicateReduction: {
      target: '>0',
      actual: rates.duplicateReductionRate,
      pass: rates.duplicateReductionRate > 0,
    },
    repeatedPollingDuplicate: {
      target: '0',
      actual: opts?.repeatedPollingDuplicates ?? 0,
      pass: (opts?.repeatedPollingDuplicates ?? 0) === 0,
    },
    underlyingProblemsPreserved: {
      target: '100%',
      actual: rates.underlyingProblemsPreservedRate,
      pass: rates.underlyingProblemsPreservedRate === 1,
    },
  };
}
