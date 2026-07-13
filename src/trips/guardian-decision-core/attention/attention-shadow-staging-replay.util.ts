/**
 * Staging real-DB replay — enriched evidence from Unified Read Model + Shadow Runtime.
 */

import { randomUUID } from 'crypto';
import type { InternalUnifiedProblemRow } from '../../../decision-runtime/gateway/utils/unified-decision-problem-projection.util';
import type {
  AttentionOrchestrationProblemInput,
  AttentionShadowNormalizedInputAudit,
  AttentionShadowResolutionBehavior,
  AttentionShadowSampleExpectation,
  AttentionShadowStagingReplayComparison,
  AttentionShadowStagingReplayEvidence,
  AttentionShadowVerdict,
  RootCauseCluster,
} from '../contracts/attention-orchestration.types';
import {
  isAttentionOrchestrationPrimarySsoEnabled,
  isAttentionOrchestrationShadowEnabled,
} from '../config/rfc002-canonical.config';
import { adjudicateShadowSample } from './attention-shadow-adjudication.util';
import { resolveRootCauseKey } from './attention-orchestration.runtime';
import {
  problemHasMergeAuthority,
  resolveWeatherEpisodeId,
} from './episode-merge-authority.util';
import { selectPrimaryProblem } from './primary-problem-selector.util';
import { computeAttentionLevelForProblems } from './attention-admission.util';
import type { AttentionShadowRunOutput } from './attention-shadow-run.util';
import {
  buildShadowOrchestrationContext,
  mapUnifiedRowToOrchestrationInput,
} from './unified-row-to-orchestration-input.adapter';
import { runAttentionShadowProjection } from './attention-shadow-run.util';

export interface StagingReplayScenarioSpec {
  scenarioId: string;
  title: string;
  setupHint: string;
  tripId: string;
  expectation: Partial<AttentionShadowSampleExpectation> & {
    expectedVerdict: AttentionShadowVerdict;
    expectedClusterCount: number;
    expectedVisibleItemCount: number;
    expectedResolutionBehavior?: AttentionShadowResolutionBehavior;
  };
}

export function sanitizeUnifiedRowForEvidence(
  row: InternalUnifiedProblemRow,
): Record<string, unknown> {
  return {
    problemId: row.problemId,
    authority: row.authority,
    semanticKey: row.semanticKey,
    instanceKey: row.instanceKey,
    workflowStatus: row.workflowStatus,
    enforcement: row.enforcement,
    title: row.title,
    summary: row.summary,
    scope: row.scope,
    occurrenceCount: row.occurrenceCount,
    detectors: row.detectors,
    origin: row.origin,
    queueTitle: row.queueTitle,
    queueDescription: row.queueDescription,
  };
}

export function auditNormalizedInputs(input: {
  problems: AttentionOrchestrationProblemInput[];
  rows: InternalUnifiedProblemRow[];
  context: ReturnType<typeof buildShadowOrchestrationContext>;
}): AttentionShadowNormalizedInputAudit[] {
  const rowById = new Map(input.rows.map((r) => [r.problemId, r]));
  return input.problems.map((problem) => {
    const row = rowById.get(problem.problemId);
    const parent = problem.causedByProblemId
      ? input.problems.find((p) => p.problemId === problem.causedByProblemId)
      : undefined;
    const episodeFromRow = row
      ? resolveWeatherEpisodeId({
          problem: {
            ...problem,
            weatherEpisodeId: mapUnifiedRowToOrchestrationInput(row)?.weatherEpisodeId,
          },
          contextEpisodeId: input.context.weatherEpisodeId,
        })
      : undefined;

    let episodeSource: AttentionShadowNormalizedInputAudit['episodeSource'] = 'MISSING';
    if (problem.weatherEpisodeId) episodeSource = 'LINEAGE';
    else if (episodeFromRow) episodeSource = 'ROW';
    else if (parent?.weatherEpisodeId) episodeSource = 'LINEAGE';
    else if (input.context.weatherEpisodeId && problem.semanticCapability.includes('WEATHER')) {
      episodeSource = 'CONTEXT';
    }

    const rootCauseKey = resolveRootCauseKey(problem, input.context);

    return {
      problemId: problem.problemId,
      semanticCapability: problem.semanticCapability,
      status: problem.status,
      weatherEpisodeId: problem.weatherEpisodeId ?? episodeFromRow,
      episodeSource,
      causedByProblemId: problem.causedByProblemId,
      rootCauseKey,
      mergeAuthority: problemHasMergeAuthority(problem),
      routeSegmentId: problem.routeSegmentId,
    };
  });
}

export function explainPrimarySelection(problems: AttentionOrchestrationProblemInput[]): string {
  const primary = selectPrimaryProblem(problems);
  if (!primary) return 'no open primary candidate';
  return `selected ${primary.semanticCapability} (${primary.problemId}) by decision-driving > root-cause priority`;
}

export function explainAttentionLevel(
  problems: AttentionOrchestrationProblemInput[],
  clusterStatus: RootCauseCluster['status'],
): string {
  const level = computeAttentionLevelForProblems(problems, clusterStatus);
  const caps = [...new Set(problems.map((p) => p.semanticCapability))];
  return `attention=${level} from capabilities [${caps.join(', ')}] clusterStatus=${clusterStatus}`;
}

export function buildStagingReplayEvidence(input: {
  spec: StagingReplayScenarioSpec;
  rows: InternalUnifiedProblemRow[];
  output: AttentionShadowRunOutput;
  commitSha?: string;
  runId?: string;
}): AttentionShadowStagingReplayEvidence {
  const runId = input.runId ?? randomUUID();
  const runAt = new Date().toISOString();
  const context = buildShadowOrchestrationContext(input.spec.tripId, input.output.inputProblems);
  const openClusters = input.output.shadowClusters.filter((c) => c.status === 'OPEN');
  const primaryProblemId =
    input.output.shadowPrimaryItems[0]?.primaryProblemId ?? openClusters[0]?.primaryProblemId;
  const primarySemantic =
    input.output.shadowPrimaryItems[0]?.primarySemanticCapability ??
    input.output.inputProblems.find((p) => p.problemId === primaryProblemId)?.semanticCapability;
  const attentionLevel =
    input.output.shadowPrimaryItems[0]?.attentionLevel ?? openClusters[0]?.attentionLevel;

  const fullExpectation: AttentionShadowSampleExpectation = {
    sampleId: input.spec.scenarioId,
    group: 'STAGING_REPLAY',
    title: input.spec.title,
    expectedVerdict: input.spec.expectation.expectedVerdict,
    expectedClusterCount: input.spec.expectation.expectedClusterCount,
    expectedPrimarySemanticCapability: input.spec.expectation.expectedPrimarySemanticCapability,
    expectedAttentionLevel: input.spec.expectation.expectedAttentionLevel,
    expectedVisibleItemCount: input.spec.expectation.expectedVisibleItemCount,
    expectedResolutionBehavior: input.spec.expectation.expectedResolutionBehavior ?? 'NONE',
    notes: input.spec.setupHint,
  };

  const adjudication = adjudicateShadowSample(fullExpectation, input.output);

  const comparison: AttentionShadowStagingReplayComparison = {
    expectedClusterCount: input.spec.expectation.expectedClusterCount,
    actualClusterCount: openClusters.length,
    expectedPrimary: input.spec.expectation.expectedPrimarySemanticCapability,
    actualPrimary: primarySemantic,
    primarySelectionReason: explainPrimarySelection(input.output.inputProblems),
    expectedAttention: input.spec.expectation.expectedAttentionLevel,
    actualAttention: attentionLevel,
    attentionReason: explainAttentionLevel(
      input.output.inputProblems,
      openClusters[0]?.status ?? 'OPEN',
    ),
    expectedVisibleItemCount: input.spec.expectation.expectedVisibleItemCount,
    actualVisibleItemCount: input.output.shadowPrimaryItems.length,
    verdict: adjudication.pass ? fullExpectation.expectedVerdict : adjudication.actual.verdict,
    reviewStatus: adjudication.pass ? 'AUTO_PASS' : 'AUTO_PENDING_HUMAN',
    reason: adjudication.reason,
    underlyingProblemCount: input.output.inputProblems.length,
  };

  return {
    schemaId: 'tripnara.attention_shadow_staging_replay@v1',
    tripId: input.spec.tripId,
    runId,
    scenarioId: input.spec.scenarioId,
    scenarioTitle: input.spec.title,
    setupHint: input.spec.setupHint,
    runAt,
    commitSha: input.commitSha,
    featureFlags: {
      attentionOrchestration: isAttentionOrchestrationShadowEnabled(),
      primarySso: isAttentionOrchestrationPrimarySsoEnabled(),
    },
    inputRows: input.rows.map(sanitizeUnifiedRowForEvidence),
    normalizedInputs: auditNormalizedInputs({
      problems: input.output.inputProblems,
      rows: input.rows,
      context,
    }),
    clusters: input.output.shadowClusters,
    primaryItems: input.output.shadowPrimaryItems,
    legacyVisibleItems: input.output.legacyVisible,
    comparison,
    humanAdjudication: {
      shouldMerge: 'PENDING',
      rootCauseKeyCorrect: 'PENDING',
      primaryCorrect: 'PENDING',
      attentionCorrect: 'PENDING',
      visibleCardCountCorrect: 'PENDING',
      resolutionBehaviorCorrect: 'PENDING',
      eligibleForCanary: 'PENDING',
    },
  };
}

export function runStagingReplayFromRows(input: {
  spec: StagingReplayScenarioSpec;
  rows: InternalUnifiedProblemRow[];
  commitSha?: string;
}): AttentionShadowStagingReplayEvidence {
  const output = runAttentionShadowProjection({
    tripId: input.spec.tripId,
    rows: input.rows,
    source: 'STAGING_REPLAY',
    sampleId: input.spec.scenarioId,
    sampleGroup: 'STAGING_REPLAY',
  });
  return buildStagingReplayEvidence({ ...input, output });
}
