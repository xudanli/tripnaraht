/**
 * Task D — Shadow dual-run harness (in-process, no Effective Plan writes).
 *
 * Validates Full Plan Candidate Selection: authority finalize vs cp-sat-lex-v1 shadow.
 * NOT POI-level CP-SAT planning validation.
 */

import type { DecisionCandidate } from '../../decision-runtime/candidates/contracts/decision-candidate';
import type { CanonicalConstraintReport } from '../../decision-runtime/constraints/contracts/canonical-constraint-report';
import type { OptimizationProblem } from '../../decision-runtime/contracts/optimization-problem';
import type { OptimizationResult } from '../../decision-runtime/contracts/optimization-result';
import { assembleOptimizationProblem } from '../../decision-runtime/core/optimization-problem-assembler.util';
import { buildFullPlanDecisionWorkspace } from '../../decision-runtime/core/build-full-plan-workspace.util';
import { DecisionCoreService } from '../../trips/guardian-decision-core/services/decision-core.service';
import { CpSatLexicographicStrategy } from '../../decision-runtime/optimization/strategies/cp-sat-lexicographic.strategy';
import { LegacyFrozenStrategy } from '../../decision-runtime/optimization/strategies/legacy-frozen.strategy';
import { ObjectiveSemanticsRegistry } from '../../decision-runtime/objectives/objective-semantics.registry';
import { CanonicalSolutionPostValidatorService } from '../../decision-runtime/optimization/post-validator.service';
import { tripWorldStateToCanonicalSnapshot } from '../../decision-runtime/snapshot/trip-world-to-canonical.util';
import { buildOptimizationShadowEvent } from '../../decision-runtime/observability/shadow-divergence-builder.util';
import type { OptimizationShadowEvent } from '../../decision-runtime/observability/shadow-divergence.types';
import type { TripWorldState } from '../../trips/decision/world-model';
import { CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY } from '../../decision-runtime/optimization/solver-capability.constants';

export interface ShadowDualRunInput {
  tripId: string;
  problemId?: string;
  worldState: TripWorldState;
  candidates: DecisionCandidate[];
  constraintReports: Record<string, CanonicalConstraintReport>;
  /** Simulate shadow failure without blocking authority */
  shadowError?: string;
  shadowTimeLimitMs?: number;
  inputMismatch?: boolean;
}

export interface ShadowDualRunResult {
  authoritySelectedId?: string;
  authorityElapsedMs: number;
  shadowResult?: OptimizationResult;
  shadowEvent: OptimizationShadowEvent;
  /** Confirms shadow metadata nomenclature */
  shadowCapability: typeof CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY;
}

const decisionCore = new DecisionCoreService();
const objectiveRegistry = new ObjectiveSemanticsRegistry();
const postValidator = new CanonicalSolutionPostValidatorService();
const legacyFrozen = new LegacyFrozenStrategy(
  decisionCore,
  postValidator,
  objectiveRegistry,
);
const cpSatLex = new CpSatLexicographicStrategy(objectiveRegistry);

export async function runShadowDualRun(
  input: ShadowDualRunInput,
): Promise<ShadowDualRunResult> {
  const tripId = input.tripId;
  const problemId = input.problemId ?? `task_d_${tripId}`;
  const snapshotId = `ws_${tripId}`;

  const snapshot = tripWorldStateToCanonicalSnapshot({
    tripId,
    snapshotId,
    revision: '1',
    worldState: input.worldState,
    plan: input.candidates[0]?.plan,
  });

  const problem = assembleOptimizationProblem({
    tripId,
    snapshot,
    candidates: input.candidates,
    constraintReportsByCandidateId: input.constraintReports,
    worldState: input.worldState,
    problemId,
  });

  const authorityStarted = Date.now();
  const { workspace, baseCandidateId } = buildFullPlanDecisionWorkspace({
    problemId,
    context: { tripId, worldStateSnapshotId: snapshotId },
    candidates: input.candidates,
    constraintReportsByCandidateId: input.constraintReports,
  });

  const finalize = decisionCore.finalize({
    workspace,
    currentWorldStateSnapshotId: snapshotId,
    baseCandidateId,
    defaultAuthorizationLevel: 'L2',
  });
  const authorityElapsedMs = Date.now() - authorityStarted;

  let shadowResult: OptimizationResult | undefined;
  let shadowError = input.shadowError;

  if (!shadowError) {
    try {
      shadowResult = await cpSatLex.solve(problem, {
        timeLimitMs: input.shadowTimeLimitMs ?? 30_000,
        proveOptimality: true,
      });
    } catch (err: unknown) {
      shadowError = err instanceof Error ? err.message : String(err);
    }
  }

  const shadowEvent = buildOptimizationShadowEvent({
    tripId,
    decisionRunId: finalize.record.decisionId ?? problemId,
    runtimeMode: 'SHADOW',
    problem,
    candidates: input.candidates,
    constraintReports: input.constraintReports,
    authoritySelectedId: finalize.record.selectedCandidateId,
    shadowOptimizationResult: shadowResult,
    shadowError,
    authorityElapsedMs,
    inputMismatch: input.inputMismatch,
  });

  return {
    authoritySelectedId: finalize.record.selectedCandidateId,
    authorityElapsedMs,
    shadowResult,
    shadowEvent,
    shadowCapability: CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY,
  };
}

/** Reference authority via LegacyFrozen for strategy comparison scenarios */
export async function runLegacyFrozenVsLexDualRun(
  input: ShadowDualRunInput,
): Promise<{
  legacyResult: OptimizationResult;
  lexResult: OptimizationResult;
  shadowEvent: OptimizationShadowEvent;
}> {
  const tripId = input.tripId;
  const problemId = input.problemId ?? `task_d_legacy_${tripId}`;
  const snapshotId = `ws_${tripId}`;

  const snapshot = tripWorldStateToCanonicalSnapshot({
    tripId,
    snapshotId,
    revision: '1',
    worldState: input.worldState,
    plan: input.candidates[0]?.plan,
  });

  const problem = assembleOptimizationProblem({
    tripId,
    snapshot,
    candidates: input.candidates,
    constraintReportsByCandidateId: input.constraintReports,
    worldState: input.worldState,
    problemId,
  });

  const budget = { timeLimitMs: 30_000, proveOptimality: true };
  const legacyResult = await legacyFrozen.solve(problem, budget);
  const lexResult = await cpSatLex.solve(problem, budget);

  const shadowEvent = buildOptimizationShadowEvent({
    tripId,
    decisionRunId: problemId,
    runtimeMode: 'SHADOW',
    problem,
    candidates: input.candidates,
    constraintReports: input.constraintReports,
    authoritySelectedId: legacyResult.recommendedCandidateId,
    authorityOptimizationResult: legacyResult,
    shadowOptimizationResult: lexResult,
  });

  return { legacyResult, lexResult, shadowEvent };
}
