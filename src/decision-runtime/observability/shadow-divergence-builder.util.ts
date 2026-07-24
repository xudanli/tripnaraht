/**
 * Build formal OptimizationShadowEvent from authority + shadow strategy runs.
 */

import { randomUUID } from 'crypto';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import { isLegacyFeasibleFromReport } from '../constraints/contracts/canonical-constraint-report';
import type { DecisionCandidate } from '../candidates/contracts/decision-candidate';
import type { OptimizationProblem } from '../contracts/optimization-problem';
import type { OptimizationResult } from '../contracts/optimization-result';
import type { DecisionRuntimeMode } from '../constraints/constraint-evaluation.config';
import { compareLegacyVsCanonicalWinner } from './plan-selection-shadow.util';
import {
  buildAuthorityFinalizeSummary,
  buildResultSummaryFromOptimization,
  buildShadowErrorSummary,
  AUTHORITY_FINALIZE_STRATEGY_ID,
} from './shadow-result-summary.util';
import { buildShadowInputFingerprint, isEligibleForStrategyComparison } from './shadow-input-hash.util';
import { classifyShadowSeverity } from './shadow-severity.util';
import type {
  OptimizationShadowComparison,
  OptimizationShadowEvent,
  ShadowDivergenceType,
  ShadowQualityDeltas,
} from './shadow-divergence.types';
import type { LexicographicStageTrace } from '../optimization/engines/cp-sat-engine.types';

const DEFAULT_SHADOW_STRATEGY_ID = 'cp-sat-lexicographic';

export function buildOptimizationShadowEvent(input: {
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
  shadowStrategyId?: string;
  inputMismatch?: boolean;
}): OptimizationShadowEvent {
  const comparisonId = `cmp_${randomUUID()}`;
  const shadowStrategyId =
    input.shadowStrategyId ??
    input.shadowOptimizationResult?.solverMetadata.strategyId ??
    DEFAULT_SHADOW_STRATEGY_ID;

  const authorityStrategyId =
    input.authorityOptimizationResult?.solverMetadata.strategyId ??
    AUTHORITY_FINALIZE_STRATEGY_ID;

  const authorityReport = input.authoritySelectedId
    ? input.constraintReports[input.authoritySelectedId]
    : undefined;

  const authorityResult = input.authorityOptimizationResult
    ? buildResultSummaryFromOptimization(
        input.authorityOptimizationResult,
        authorityReport,
      )
    : buildAuthorityFinalizeSummary({
        selectedCandidateId: input.authoritySelectedId,
        candidates: input.candidates,
        report: authorityReport,
        elapsedMs: input.authorityElapsedMs,
      });

  let shadowResult = input.shadowOptimizationResult
    ? buildResultSummaryFromOptimization(
        input.shadowOptimizationResult,
        input.shadowOptimizationResult.recommendedCandidateId
          ? input.constraintReports[input.shadowOptimizationResult.recommendedCandidateId]
          : undefined,
      )
    : undefined;

  if (input.shadowError && !shadowResult) {
    shadowResult = buildShadowErrorSummary({
      strategyId: shadowStrategyId,
      strategyVersion: '0.0.0',
      error: input.shadowError,
    });
  }

  const inputFingerprint = buildShadowInputFingerprint({
    snapshotId: input.problem.snapshotId,
    snapshot: input.problem.snapshot,
    candidates: input.candidates,
    constraintReports: input.constraintReports,
    objectiveRegistryVersion: input.problem.objectiveRegistryVersion,
    objectiveProfile: input.problem.objectiveProfile,
    authorityStrategyVersion: authorityResult.strategyVersion,
    shadowStrategyVersion: shadowResult?.strategyVersion,
  });

  const inputConsistent = !input.inputMismatch;
  const eligibleForStrategyComparison =
    inputConsistent && isEligibleForStrategyComparison(inputFingerprint);

  const lexicographicStageTraces = extractLexStageTraces(
    input.shadowOptimizationResult,
  );
  const stageTraceComplete =
    lexicographicStageTraces.length > 0 &&
    lexicographicStageTraces.every(
      (s) =>
        s.eliminatedCandidateIds.length >= 0 &&
        s.remainingCandidateIds.length >= 0 &&
        s.objectiveId.length > 0,
    );

  const utilityComparison = compareLegacyVsCanonicalWinner({
    candidates: input.candidates,
    constraintReports: input.constraintReports,
    selectedCandidateId: input.authoritySelectedId,
  });

  const types = classifyDivergenceTypes({
    authority: authorityResult,
    shadow: shadowResult,
    constraintReports: input.constraintReports,
    inputConsistent,
    shadowOptimizationResult: input.shadowOptimizationResult,
  });

  const top3OverlapRate = computeTop3Overlap(
    authorityResult.rankedTop3,
    shadowResult?.rankedTop3 ?? [],
  );
  const rankingCorrelation = computeRankingCorrelation(
    input.candidates,
    authorityResult.rankedTop3,
    shadowResult?.rankedTop3 ?? [],
  );

  const qualityDeltas = computeQualityDeltas(
    input.authorityOptimizationResult,
    input.shadowOptimizationResult,
    input.authoritySelectedId,
    shadowResult?.selectedCandidateId,
  );

  const severity = classifyShadowSeverity({
    types,
    authority: authorityResult,
    shadow: shadowResult,
    authorityReport,
    shadowReport: shadowResult?.selectedCandidateId
      ? input.constraintReports[shadowResult.selectedCandidateId]
      : undefined,
    qualityDeltas,
  });

  const explainability = buildExplainability({
    types,
    severity,
    authority: authorityResult,
    shadow: shadowResult,
    qualityDeltas,
    utilityWinnerId: utilityComparison.legacyWinnerId,
    stageTraces: lexicographicStageTraces,
  });

  const sameWinner =
    authorityResult.selectedCandidateId != null &&
    shadowResult?.selectedCandidateId != null &&
    authorityResult.selectedCandidateId === shadowResult.selectedCandidateId;

  const diverged =
    eligibleForStrategyComparison &&
    (types.includes('DIFFERENT_WINNER') ||
      types.includes('FEASIBILITY_DIFFERENCE') ||
      types.includes('CONSTRAINT_DIFFERENCE') ||
      types.includes('POST_VALIDATION_DIFFERENCE'));

  return {
    schemaId: 'tripnara.optimization_shadow_event@v1',
    comparisonId,
    tripId: input.tripId,
    decisionRunId: input.decisionRunId,
    problemId: input.problem.problemId,
    snapshotId: input.problem.snapshotId,
    runtimeMode: input.runtimeMode,
    authorityStrategyId,
    shadowStrategyId,
    inputFingerprint,
    inputConsistent,
    eligibleForStrategyComparison,
    authorityResult,
    shadowResult,
    divergence: {
      diverged,
      sameWinner,
      types,
      severity,
      top3OverlapRate,
      rankingCorrelation,
      explainability,
      stageTraceComplete,
    },
    lexicographicStageTraces,
    qualityDeltas,
    createdAt: new Date().toISOString(),
    legacyFinalizeSelectedId: input.authoritySelectedId,
    strategySelectedId: shadowResult?.selectedCandidateId,
    strategyId: shadowStrategyId,
    legacyUtilityWinnerId: utilityComparison.legacyWinnerId,
    utilityVsStrategyDiverged:
      utilityComparison.legacyWinnerId != null &&
      shadowResult?.selectedCandidateId != null &&
      utilityComparison.legacyWinnerId !== shadowResult.selectedCandidateId,
  };
}

export function toLegacyShadowComparison(
  event: OptimizationShadowEvent,
): OptimizationShadowComparison {
  return {
    legacyFinalizeSelectedId: event.legacyFinalizeSelectedId,
    strategySelectedId: event.strategySelectedId,
    strategyId: event.strategyId,
    diverged: event.divergence.diverged,
    legacyUtilityWinnerId: event.legacyUtilityWinnerId,
    utilityVsStrategyDiverged: event.utilityVsStrategyDiverged ?? false,
  };
}

function classifyDivergenceTypes(input: {
  authority: import('./shadow-divergence.types').ResultSummary;
  shadow?: import('./shadow-divergence.types').ResultSummary;
  constraintReports: Record<string, CanonicalConstraintReport>;
  inputConsistent: boolean;
  shadowOptimizationResult?: OptimizationResult;
}): ShadowDivergenceType[] {
  const types: ShadowDivergenceType[] = [];

  if (!input.inputConsistent) {
    types.push('INPUT_MISMATCH');
    return types;
  }

  if (!input.shadow) {
    types.push('NO_SHADOW_RESULT');
    return types;
  }

  if (input.shadow.error) {
    types.push('SHADOW_ERROR');
    return types;
  }
  if (input.shadow.timedOut) types.push('SHADOW_TIMEOUT');

  const authId = input.authority.selectedCandidateId;
  const shadowId = input.shadow.selectedCandidateId;

  if (input.authority.postValidationRejected || input.shadow.postValidationRejected) {
    types.push('POST_VALIDATION_DIFFERENCE');
  }

  const tieBreakUsed = input.shadowOptimizationResult?.optimizationTrace?.steps?.some(
    (s) => s.detail?.tieBreakUsed === true,
  );
  if (tieBreakUsed && authId != null && shadowId != null && authId !== shadowId) {
    types.push('TIE_BREAK_DIFFERENCE');
  }

  if (authId != null && shadowId != null && authId === shadowId) {
    types.push('SAME_WINNER');
  } else if (authId != null && shadowId != null) {
    types.push('DIFFERENT_WINNER');
  }

  if (input.authority.feasibilityStatus !== input.shadow.feasibilityStatus) {
    types.push('FEASIBILITY_DIFFERENCE');
  }

  const authReport = authId ? input.constraintReports[authId] : undefined;
  const shadowReport = shadowId ? input.constraintReports[shadowId] : undefined;
  if (
    authReport &&
    shadowReport &&
    authReport.overallStatus !== shadowReport.overallStatus
  ) {
    types.push('CONSTRAINT_DIFFERENCE');
  } else if (
    (authReport && !isLegacyFeasibleFromReport(authReport)) !==
    (shadowReport && !isLegacyFeasibleFromReport(shadowReport))
  ) {
    types.push('CONSTRAINT_DIFFERENCE');
  }

  if (
    authId &&
    shadowId &&
    authId !== shadowId &&
    input.authority.rankedTop3.join(',') !== input.shadow.rankedTop3.join(',')
  ) {
    types.push('RANKING_DIFFERENCE');
  }

  if (types.length === 0) types.push('SAME_WINNER');
  return types;
}

function computeTop3Overlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setB = new Set(b);
  const overlap = a.filter((id) => setB.has(id)).length;
  const denom = Math.max(a.length, b.length, 1);
  return overlap / denom;
}

function computeRankingCorrelation(
  candidates: DecisionCandidate[],
  rankA: string[],
  rankB: string[],
): number {
  const ids = candidates.map((c) => c.candidateId);
  if (ids.length < 2) return 1;

  const posA = rankPositionMap(rankA, ids);
  const posB = rankPositionMap(rankB, ids);

  const n = ids.length;
  let sumD2 = 0;
  for (const id of ids) {
    const d = (posA.get(id) ?? n) - (posB.get(id) ?? n);
    sumD2 += d * d;
  }
  const denom = n * (n * n - 1);
  if (denom === 0) return 1;
  return 1 - (6 * sumD2) / denom;
}

function rankPositionMap(rank: string[], allIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  rank.forEach((id, i) => map.set(id, i + 1));
  allIds.forEach((id, i) => {
    if (!map.has(id)) map.set(id, rank.length + i + 1);
  });
  return map;
}

function computeQualityDeltas(
  authorityResult?: OptimizationResult,
  shadowResult?: OptimizationResult,
  authorityId?: string,
  shadowId?: string,
): ShadowQualityDeltas | undefined {
  const authEvals = objectiveMap(authorityResult, authorityId);
  const shadowEvals = objectiveMap(shadowResult, shadowId);
  if (!authEvals && !shadowEvals) return undefined;

  const delta = (key: string) =>
    (shadowEvals?.get(key) ?? 0) - (authEvals?.get(key) ?? 0);

  return {
    corePoiDelta: delta('interest_match'),
    travelTimeDelta: delta('daily_driving_load'),
    loadDelta: delta('daily_physical_load'),
    minMemberUtilityDelta: delta('min_member_utility'),
    budgetDeviationDelta: delta('budget_deviation'),
    l2LoadDelta: delta('daily_driving_load'),
    l3ExperienceDelta: delta('interest_match'),
    l4EfficiencyDelta: delta('buffer_time'),
  };
}

function extractLexStageTraces(
  result?: OptimizationResult,
): LexicographicStageTrace[] {
  const raw = result?.optimizationTrace?.steps?.find(
    (s) => s.kind === 'CP_SAT_LEX_V1' || s.kind === 'CP_SAT_LEX_LAB_V0',
  )?.detail?.stageTraces;
  if (!Array.isArray(raw)) return [];
  return raw as LexicographicStageTrace[];
}

function objectiveMap(
  result?: OptimizationResult,
  candidateId?: string,
): Map<string, number> | undefined {
  if (!result?.objectiveEvaluations?.length) return undefined;
  if (result.recommendedCandidateId && result.recommendedCandidateId !== candidateId) {
    return undefined;
  }
  return new Map(
    result.objectiveEvaluations.map((e) => [e.objectiveId, e.normalizedValue]),
  );
}

function buildExplainability(input: {
  types: ShadowDivergenceType[];
  severity: import('./shadow-divergence.types').DivergenceSeverity;
  authority: import('./shadow-divergence.types').ResultSummary;
  shadow?: import('./shadow-divergence.types').ResultSummary;
  qualityDeltas?: ShadowQualityDeltas;
  utilityWinnerId?: string;
  stageTraces?: LexicographicStageTrace[];
}): string[] {
  const lines: string[] = [];

  if (input.types.includes('INPUT_MISMATCH')) {
    lines.push('Input fingerprint mismatch — excluded from strategy quality stats');
    return lines;
  }
  if (input.types.includes('SHADOW_ERROR')) {
    lines.push(`Shadow strategy error: ${input.shadow?.error ?? 'unknown'}`);
    return lines;
  }
  if (input.types.includes('SHADOW_TIMEOUT')) {
    lines.push('Shadow strategy hit time limit');
  }
  if (input.types.includes('SAME_WINNER')) {
    lines.push('Authority and shadow selected the same candidate');
  }
  if (input.types.includes('DIFFERENT_WINNER')) {
    lines.push(
      `Winner differs: authority=${input.authority.selectedCandidateId} shadow=${input.shadow?.selectedCandidateId}`,
    );
    if (
      input.utilityWinnerId &&
      input.utilityWinnerId !== input.shadow?.selectedCandidateId
    ) {
      lines.push('Shadow diverges from utility-max feasible candidate — likely objective ordering');
    }
  }
  if (input.types.includes('FEASIBILITY_DIFFERENCE')) {
    lines.push('Feasibility status differs between authority and shadow');
  }
  if (input.types.includes('CONSTRAINT_DIFFERENCE')) {
    lines.push('Constraint report status differs for selected candidates');
  }
  if (input.types.includes('RANKING_DIFFERENCE')) {
    lines.push('Top-3 ranking order differs');
  }
  if (input.types.includes('TIE_BREAK_DIFFERENCE')) {
    lines.push('Utility tie-break resolved differently between authority and shadow');
  }
  if (input.types.includes('POST_VALIDATION_DIFFERENCE')) {
    lines.push('PostValidator outcome differs between authority and shadow');
  }
  const lastStage = input.stageTraces?.[input.stageTraces.length - 1];
  if (lastStage && input.types.includes('DIFFERENT_WINNER')) {
    lines.push(
      `Lex eliminated ${lastStage.eliminatedCandidateIds.length} at ${lastStage.layer}/${lastStage.objectiveId}; remaining=${lastStage.remainingCandidateIds.join(',')}`,
    );
  }
  if (input.qualityDeltas) {
    const { travelTimeDelta, loadDelta, minMemberUtilityDelta } = input.qualityDeltas;
    if (Math.abs(travelTimeDelta ?? 0) > 0.05) {
      lines.push(`Driving load delta: ${(travelTimeDelta ?? 0).toFixed(3)}`);
    }
    if (Math.abs(loadDelta ?? 0) > 0.05) {
      lines.push(`Physical load delta: ${(loadDelta ?? 0).toFixed(3)}`);
    }
    if (Math.abs(minMemberUtilityDelta ?? 0) > 0.05) {
      lines.push(`Min member utility delta: ${(minMemberUtilityDelta ?? 0).toFixed(3)}`);
    }
  }
  lines.push(`Severity: ${input.severity}`);
  return lines;
}

/** @deprecated Prefer buildOptimizationShadowEvent */
export function compareOptimizationShadow(input: {
  candidates: DecisionCandidate[];
  constraintReports: Record<string, CanonicalConstraintReport>;
  legacyFinalizeSelectedId?: string;
  optimizationResult?: OptimizationResult;
}): OptimizationShadowComparison {
  const event = buildOptimizationShadowEvent({
    tripId: 'legacy',
    decisionRunId: 'legacy',
    runtimeMode: 'SHADOW',
    problem: {
      schemaId: 'tripnara.optimization_problem@v1',
      problemId: input.optimizationResult?.problemId ?? 'legacy',
      tripId: input.optimizationResult?.tripId ?? 'legacy',
      snapshotId: input.optimizationResult?.snapshotId ?? 'legacy',
      createdAt: new Date().toISOString(),
      snapshot: input.optimizationResult?.snapshotId
        ? {
            schemaId: 'tripnara.canonical_world_state_snapshot@v1',
            snapshotId: input.optimizationResult.snapshotId,
            tripId: input.optimizationResult.tripId,
            revision: '1',
            createdAt: '',
            weather: [],
            roads: [],
            hazards: [],
            ferries: [],
            poiStates: [],
            travelMatrix: { matrixId: '', entries: [] },
            completeness: {
              roads: 'MISSING',
              weather: 'MISSING',
              hazards: 'MISSING',
              ferries: 'MISSING',
              openingHours: 'MISSING',
            },
            sourceVersions: [],
          }
        : ({} as import('../contracts/world-state-snapshot').CanonicalWorldStateSnapshot),
      profile: {
        phase: 'PLANNING',
        poiCount: 0,
        dayCount: 1,
        memberCount: 1,
        enabledObjectiveCount: 0,
        dataCompleteness: 0,
      },
      objectiveProfile: { registryVersion: 'objectives@v1', enabledObjectives: [] },
      candidates: input.candidates,
      constraintReport: Object.values(input.constraintReports)[0]!,
      constraintReportsByCandidateId: input.constraintReports,
      mandatoryEvaluations: [],
      objectiveRegistryVersion: 'objectives@v1',
      constraintPolicyVersion: 'constraint-policy@v1',
    },
    candidates: input.candidates,
    constraintReports: input.constraintReports,
    authoritySelectedId: input.legacyFinalizeSelectedId,
    shadowOptimizationResult: input.optimizationResult,
  });
  return toLegacyShadowComparison(event);
}
