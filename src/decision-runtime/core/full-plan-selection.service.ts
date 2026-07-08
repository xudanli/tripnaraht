/**
 * P1 — Full itinerary candidate selection via Canonical Decision Core.
 *
 * Legacy generates candidates → Gateway evaluates → DecisionCore.finalize.
 * SHADOW/DUAL_RUN: parallel CP-SAT lex shadow vs authority finalize (never CP-SAT authority).
 * Does NOT execute Effective Plan changes.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripWorldState } from '../../trips/decision/world-model';
import type { TripPlan } from '../../trips/decision/plan-model';
import { DecisionCoreService } from '../../trips/guardian-decision-core/services/decision-core.service';
import type { Rfc001DecisionRecord } from '../../trips/guardian-decision-core/contracts/decision-record.types';
import { ConstraintEvaluationGatewayService } from '../constraints/constraint-evaluation.gateway.service';
import type { CanonicalConstraintReport } from '../constraints/contracts/canonical-constraint-report';
import {
  isCanonicalPlanSelectionAuthority,
  resolveDecisionRuntimeMode,
  resolveEffectiveRuntimeMode,
  shouldRunFullPlanOptimizationShadow,
} from '../constraints/constraint-evaluation.config';
import { LegacyTripPlanningAdapter } from '../candidates/legacy-planning.adapter';
import type { DecisionCandidate, PlanningContext } from '../candidates/contracts/decision-candidate';
import { buildFullPlanDecisionWorkspace } from './build-full-plan-workspace.util';
import { assembleOptimizationProblem } from './optimization-problem-assembler.util';
import {
  compareLegacyVsCanonicalWinner,
  toLegacyShadowComparison,
} from '../observability/plan-selection-shadow.util';
import type { OptimizationShadowEvent } from '../observability/shadow-divergence.types';
import { ShadowObservabilityService } from '../observability/shadow-observability.service';
import { WorldStateSnapshotService } from '../snapshot/world-state-snapshot.service';
import { LegacyFrozenStrategy } from '../optimization/strategies/legacy-frozen.strategy';
import { CpSatLexicographicStrategy } from '../optimization/strategies/cp-sat-lexicographic.strategy';
import type { OptimizationResult } from '../contracts/optimization-result';

export interface FullPlanSelectionInput {
  worldState: TripWorldState;
  context: PlanningContext;
  problemId?: string;
}

export interface FullPlanSelectionResult {
  schemaId: 'tripnara.full_plan_selection@v1';
  problemId: string;
  snapshotId: string;
  candidates: DecisionCandidate[];
  constraintReports: Record<string, CanonicalConstraintReport>;
  record: Rfc001DecisionRecord;
  humanDecisionRequired: boolean;
  selectedCandidate?: DecisionCandidate;
  recommendedPlan?: TripPlan;
  shadowComparison?: ReturnType<typeof compareLegacyVsCanonicalWinner>;
  /** Authority strategy result (CANONICAL only). */
  optimizationResult?: OptimizationResult;
  /** Parallel CP-SAT lex shadow (SHADOW / DUAL_RUN). */
  shadowOptimizationResult?: OptimizationResult;
  optimizationShadow?: OptimizationShadowEvent;
  /** @deprecated flat comparison — use optimizationShadow */
  optimizationShadowLegacy?: ReturnType<typeof toLegacyShadowComparison>;
}

const SOLVER_BUDGET_MS = 30_000;

@Injectable()
export class FullPlanSelectionService {
  private readonly logger = new Logger(FullPlanSelectionService.name);

  constructor(
    private readonly legacyPlanningAdapter: LegacyTripPlanningAdapter,
    private readonly constraintGateway: ConstraintEvaluationGatewayService,
    private readonly decisionCore: DecisionCoreService,
    @Optional() private readonly snapshotService?: WorldStateSnapshotService,
    @Optional() private readonly legacyFrozenStrategy?: LegacyFrozenStrategy,
    @Optional() private readonly cpSatLexStrategy?: CpSatLexicographicStrategy,
    @Optional() private readonly shadowObservability?: ShadowObservabilityService,
  ) {}

  async selectRecommendedPlan(input: FullPlanSelectionInput): Promise<FullPlanSelectionResult> {
    const tripId = input.context.tripId;
    const problemId =
      input.problemId ??
      input.context.experimentRunId ??
      `full_plan_${tripId}_${Date.now()}`;

    const candidates = await this.legacyPlanningAdapter.generateCandidates(
      input.worldState,
      input.context,
    );

    if (candidates.length === 0) {
      throw new Error('No planning candidates produced by Legacy adapter');
    }

    return this.selectFromPrebuiltCandidates({
      worldState: input.worldState,
      context: input.context,
      candidates,
      problemId,
    });
  }

  async evaluatePrebuiltCandidates(input: {
    worldState: TripWorldState;
    context: PlanningContext;
    candidates: DecisionCandidate[];
    problemId?: string;
  }): Promise<{
    problemId: string;
    candidates: DecisionCandidate[];
    constraintReports: Record<string, CanonicalConstraintReport>;
  }> {
    const tripId = input.context.tripId;
    const problemId = input.problemId ?? `prebuilt_${tripId}_${Date.now()}`;
    const constraintReports = await this.evaluateAllCandidates(
      tripId,
      input.candidates,
      input.worldState,
    );
    return { problemId, candidates: input.candidates, constraintReports };
  }

  async selectFromPrebuiltCandidates(input: {
    worldState: TripWorldState;
    context: PlanningContext;
    candidates: DecisionCandidate[];
    problemId?: string;
    constraintReportsByCandidateId?: Record<string, CanonicalConstraintReport>;
  }): Promise<FullPlanSelectionResult> {
    const tripId = input.context.tripId;
    const candidates = input.candidates;

    if (candidates.length === 0) {
      throw new Error('selectFromPrebuiltCandidates requires at least one candidate');
    }

    const problemId =
      input.problemId ??
      input.context.experimentRunId ??
      `prebuilt_${tripId}_${Date.now()}`;

    let constraintReports: Record<string, CanonicalConstraintReport>;
    if (input.constraintReportsByCandidateId) {
      constraintReports = input.constraintReportsByCandidateId;
      for (const c of candidates) {
        if (!constraintReports[c.candidateId]) {
          throw new Error(
            `constraintReportsByCandidateId missing report for ${c.candidateId}`,
          );
        }
      }
    } else {
      const evaluated = await this.evaluatePrebuiltCandidates(input);
      constraintReports = evaluated.constraintReports;
    }

    const reviewArtifactCandidatesById = Object.fromEntries(
      candidates.map((c) => [c.candidateId, JSON.parse(JSON.stringify(c)) as DecisionCandidate]),
    );

    const snapshotId =
      input.context.worldStateSnapshotId ?? `ws_${tripId}_${Date.now()}`;
    let capturedSnapshotId = snapshotId;
    let snapshotForProblem = optimizationProblemInlineSnapshot(
      capturedSnapshotId,
      tripId,
      constraintReports[candidates[0].candidateId],
    );

    if (this.snapshotService) {
      const captured = await this.snapshotService.capture({
        tripId,
        worldState: input.worldState,
        snapshotId,
        plan: candidates[0]?.plan,
        persist: false,
      });
      capturedSnapshotId = captured.snapshotId;
      snapshotForProblem = captured.snapshot;
    }

    const optimizationProblem = assembleOptimizationProblem({
      tripId,
      snapshot: snapshotForProblem,
      candidates,
      constraintReportsByCandidateId: constraintReports,
      worldState: input.worldState,
      context: { ...input.context, worldStateSnapshotId: capturedSnapshotId },
      problemId,
    });

    const solverBudget = { timeLimitMs: SOLVER_BUDGET_MS, proveOptimality: true };
    const runtimeMode = resolveDecisionRuntimeMode();
    const effectiveMode = resolveEffectiveRuntimeMode();
    const runShadowComparison = shouldRunFullPlanOptimizationShadow();
    const authorityStarted = Date.now();

    let optimizationResult: OptimizationResult | undefined;
    if (
      isCanonicalPlanSelectionAuthority() &&
      this.legacyFrozenStrategy != null
    ) {
      optimizationResult = await this.legacyFrozenStrategy.solve(
        optimizationProblem,
        solverBudget,
      );
    }

    let record: Rfc001DecisionRecord;
    let humanDecisionRequired: boolean;

    if (
      isCanonicalPlanSelectionAuthority() &&
      optimizationResult?.decisionRecord
    ) {
      record = optimizationResult.decisionRecord;
      humanDecisionRequired = optimizationResult.humanDecisionRequired ?? false;
    } else {
      const legacyFinalize = this.finalizeDirect({
        problemId,
        context: { ...input.context, worldStateSnapshotId: capturedSnapshotId },
        candidates,
        constraintReports,
        snapshotId: capturedSnapshotId,
      });
      record = legacyFinalize.record;
      humanDecisionRequired = legacyFinalize.humanDecisionRequired;
    }

    const authorityElapsedMs = Date.now() - authorityStarted;

    let shadowOptimizationResult: OptimizationResult | undefined;
    let shadowError: string | undefined;
    const stagingShadow = input.context.stagingShadowOptions;
    if (runShadowComparison && this.cpSatLexStrategy != null) {
      if (stagingShadow?.shadowError) {
        shadowError = stagingShadow.shadowError;
      } else {
        try {
          const shadowBudget =
            stagingShadow?.shadowTimeLimitMs != null
              ? {
                  ...solverBudget,
                  timeLimitMs: stagingShadow.shadowTimeLimitMs,
                }
              : solverBudget;
          shadowOptimizationResult = await this.cpSatLexStrategy.solve(
            optimizationProblem,
            shadowBudget,
          );
        } catch (err: unknown) {
          shadowError = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[FullPlanSelection:shadow] trip=${tripId} shadow error: ${shadowError}`,
          );
        }
      }
    }

    const selectedCandidate = candidates.find(
      (c) => c.candidateId === record.selectedCandidateId,
    );

    const shadowComparison = compareLegacyVsCanonicalWinner({
      candidates,
      constraintReports,
      selectedCandidateId: record.selectedCandidateId,
    });

    const optimizationShadow =
      runShadowComparison && this.shadowObservability
        ? this.shadowObservability.recordComparison({
            tripId,
            decisionRunId:
              input.context.experimentRunId ?? record.decisionId ?? problemId,
            runtimeMode: effectiveMode,
            problem: optimizationProblem,
            candidates,
            constraintReports,
            authoritySelectedId: record.selectedCandidateId,
            authorityOptimizationResult: optimizationResult,
            shadowOptimizationResult,
            shadowError,
            authorityElapsedMs,
            inputMismatch: stagingShadow?.inputMismatch,
            reviewArtifactCandidatesById,
          })
        : undefined;

    if (optimizationShadow?.divergence.diverged) {
      this.logger.warn(
        `[FullPlanSelection:shadow] trip=${tripId} mode=${runtimeMode} authority=${optimizationShadow.authorityResult.selectedCandidateId} shadow=${optimizationShadow.shadowResult?.selectedCandidateId} severity=${optimizationShadow.divergence.severity}`,
      );
    }

    this.logger.log(
      `[FullPlanSelection] trip=${tripId} mode=${runtimeMode} candidates=${candidates.length} selected=${record.selectedCandidateId} shadow=${!!optimizationShadow?.divergence.diverged}`,
    );

    return {
      schemaId: 'tripnara.full_plan_selection@v1',
      problemId,
      snapshotId: capturedSnapshotId,
      candidates,
      constraintReports,
      record,
      humanDecisionRequired,
      selectedCandidate,
      recommendedPlan: selectedCandidate?.plan,
      shadowComparison,
      optimizationResult,
      shadowOptimizationResult,
      optimizationShadow,
      optimizationShadowLegacy: optimizationShadow
        ? toLegacyShadowComparison(optimizationShadow)
        : undefined,
    };
  }

  private finalizeDirect(input: {
    problemId: string;
    context: PlanningContext;
    candidates: DecisionCandidate[];
    constraintReports: Record<string, CanonicalConstraintReport>;
    snapshotId: string;
  }) {
    const { workspace, baseCandidateId } = buildFullPlanDecisionWorkspace({
      problemId: input.problemId,
      context: input.context,
      candidates: input.candidates,
      constraintReportsByCandidateId: input.constraintReports,
    });

    return this.decisionCore.finalize({
      workspace,
      currentWorldStateSnapshotId: input.snapshotId,
      baseCandidateId,
      defaultAuthorizationLevel: 'L2',
    });
  }

  private async evaluateAllCandidates(
    tripId: string,
    candidates: DecisionCandidate[],
    worldState: TripWorldState,
  ): Promise<Record<string, CanonicalConstraintReport>> {
    const constraintReports: Record<string, CanonicalConstraintReport> = {};
    for (const candidate of candidates) {
      constraintReports[candidate.candidateId] = await this.constraintGateway.evaluateCandidate({
        tripId,
        candidateId: candidate.candidateId,
        plan: candidate.plan,
        worldState,
        countryCode: worldState.context.destination,
      });
    }
    return constraintReports;
  }
}

function optimizationProblemInlineSnapshot(
  snapshotId: string,
  tripId: string,
  report?: CanonicalConstraintReport,
): import('../contracts/world-state-snapshot').CanonicalWorldStateSnapshot {
  return {
    schemaId: 'tripnara.canonical_world_state_snapshot@v1',
    snapshotId,
    tripId,
    revision: '1',
    createdAt: new Date().toISOString(),
    weather: [],
    roads: [],
    hazards: [],
    ferries: [],
    poiStates: [],
    travelMatrix: { matrixId: 'inline', entries: [] },
    completeness: report?.completeness ?? {
      roads: 'MISSING',
      weather: 'MISSING',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'MISSING',
    },
    sourceVersions: [],
  };
}
