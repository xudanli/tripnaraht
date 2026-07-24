/**
 * ADR-008 S4 — Planning Orchestrator day VRPTW shadow (non-authoritative).
 * Intents: OPTIMIZE_ROUTE · AUTO_ARRANGE (densest day only).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { PlanProposalChange } from '../../../trips/arrange-itinerary/types/plan-proposal.types';
import { OrToolsSolverClient } from '../ortools-solver.client';
import {
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from '../ortools-solver.config';
import {
  buildSolverProblemFromDayItems,
  type DayVrptwItemInput,
} from '../projection/build-solver-problem-from-day-items.util';
import {
  pickBestSolverCandidate,
  solverCandidateToPlanProposalChanges,
} from '../adapters/ortools-to-plan-proposal-changes.adapter';
import { buildOrToolsRepairShadowReport } from '../shadow/ortools-repair-shadow.compare';
import type { OrToolsRepairShadowReport } from '../shadow/ortools-repair-shadow.types';
import type { SolverProblem } from '../contracts/solver-problem';
import { OrToolsShadowMetricsCollector } from '../observability/ortools-shadow-metrics.collector';
import {
  buildOrToolsPlanningLabCompare,
  type OrToolsPlanningLabCompareReport,
} from '../lab/ortools-planning-lab-compare.util';
import { stampOrtToolsShadowFreshness } from '../lab/ortools-shadow-evidence-freshness.util';
import type { DecisionProviderId } from '../../candidates/contracts/decision-providers';

export type OrtToolsPlanningShadowIntent = 'OPTIMIZE_ROUTE' | 'AUTO_ARRANGE';

export interface OrtToolsPlanningShadowAttachment {
  schemaId: 'tripnara.ortools_planning_shadow@v1';
  shadowAuthority: false;
  planningIntent: OrtToolsPlanningShadowIntent;
  report: OrToolsRepairShadowReport;
  dayIndex: number;
  legacyChangeCount: number;
  shadowChangeCount: number;
  shadowChanges: PlanProposalChange[];
  contextVersion: number;
  evidenceVersionId?: string;
  snapshotId?: string;
  /** P2 main-chain freshness stamp */
  evidenceFreshness?: 'FRESH' | 'STALE';
  discardedStalePrior?: boolean;
  evidenceBoundAt?: string;
  solverUnavailableReason?: string;
  /** Debug / Lab — omitted from hot logs when large */
  solverProblemRequestId?: string;
  /** Legacy vs OR-Tools quality compare (observational) */
  labCompare?: OrToolsPlanningLabCompareReport;
}

/** Observational stub when VRPTW cannot run — so FE always sees ortoolsShadow when Shadow is on. */
export function buildOrtToolsPlanningShadowSkippedAttachment(input: {
  tripId: string;
  planningIntent: OrtToolsPlanningShadowIntent;
  authorityProviderId: DecisionProviderId;
  dayIndex: number;
  contextVersion: number;
  legacyChangeCount: number;
  reason: string;
}): OrtToolsPlanningShadowAttachment {
  const requestId = `ortools-plan:skip:${input.planningIntent}:${input.tripId}:${Date.now()}`;
  const evidenceVersionId = `ctx:${input.contextVersion}`;
  return {
    schemaId: 'tripnara.ortools_planning_shadow@v1',
    shadowAuthority: false,
    planningIntent: input.planningIntent,
    report: buildOrToolsRepairShadowReport({
      tripId: input.tripId,
      requestId,
      authorityProviderId: input.authorityProviderId,
      authority: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: input.authorityProviderId,
        tripId: input.tripId,
        proposals: [],
        generatedAt: new Date().toISOString(),
      },
      shadow: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'ortools-repair',
        tripId: input.tripId,
        proposals: [],
        generatedAt: new Date().toISOString(),
      },
      problem: {
        schemaId: 'tripnara.solver_problem@v1',
        requestId,
        tripId: input.tripId,
        planVersionId: 'skip',
        operation: 'SWAP',
        scope: { dayIds: [`day-${input.dayIndex}`] },
        nodes: [],
        travelMatrix: { nodeIds: [], costsMin: [] },
        constraints: [],
        objectives: [],
        solverConfig: { maxCandidates: 3, timeLimitMs: 1, seed: 0 },
      },
      solverResponse: null,
    }),
    dayIndex: input.dayIndex,
    legacyChangeCount: input.legacyChangeCount,
    shadowChangeCount: 0,
    shadowChanges: [],
    contextVersion: input.contextVersion,
    evidenceVersionId,
    snapshotId: evidenceVersionId,
    evidenceFreshness: 'FRESH',
    solverUnavailableReason: input.reason,
  };
}

@Injectable()
export class OrToolsPlanningOrchestratorShadowBridge {
  private readonly logger = new Logger(
    OrToolsPlanningOrchestratorShadowBridge.name,
  );

  constructor(
    private readonly solverClient: OrToolsSolverClient,
    @Optional() private readonly metrics?: OrToolsShadowMetricsCollector,
  ) {}

  async runForOptimizeRoute(input: {
    tripId: string;
    dayIndex: number;
    contextVersion: number;
    planVersionId: string;
    legacyChanges: PlanProposalChange[];
    items: DayVrptwItemInput[];
  }): Promise<OrtToolsPlanningShadowAttachment | null> {
    return this.runForPlanningDay({
      ...input,
      planningIntent: 'OPTIMIZE_ROUTE',
      authorityProviderId: 'legacy-optimize-route',
    });
  }

  async runForAutoArrange(input: {
    tripId: string;
    dayIndex: number;
    contextVersion: number;
    planVersionId: string;
    legacyChanges: PlanProposalChange[];
    items: DayVrptwItemInput[];
  }): Promise<OrtToolsPlanningShadowAttachment | null> {
    return this.runForPlanningDay({
      ...input,
      planningIntent: 'AUTO_ARRANGE',
      authorityProviderId: 'legacy-auto-arrange',
    });
  }

  async runForPlanningDay(input: {
    tripId: string;
    dayIndex: number;
    contextVersion: number;
    planVersionId: string;
    legacyChanges: PlanProposalChange[];
    items: DayVrptwItemInput[];
    planningIntent: OrtToolsPlanningShadowIntent;
    authorityProviderId: DecisionProviderId;
  }): Promise<OrtToolsPlanningShadowAttachment | null> {
    if (!isOrToolsRepairShadowEnabled() || !resolveOrToolsSolverBaseUrl()) {
      return null;
    }

    const requestId = `ortools-plan:${input.planningIntent}:${input.tripId}:d${input.dayIndex}:${Date.now()}`;
    const evidenceVersionId = `ctx:${input.contextVersion}`;
    const authorityId: DecisionProviderId = input.authorityProviderId;

    const problem: SolverProblem | null = buildSolverProblemFromDayItems({
      requestId,
      tripId: input.tripId,
      planVersionId: input.planVersionId,
      evidenceVersionId,
      snapshotId: evidenceVersionId,
      dayIndex: input.dayIndex,
      items: input.items,
    });

    if (!problem) {
      return {
        schemaId: 'tripnara.ortools_planning_shadow@v1',
        shadowAuthority: false,
        planningIntent: input.planningIntent,
        report: buildOrToolsRepairShadowReport({
          tripId: input.tripId,
          requestId,
          authorityProviderId: authorityId,
          authority: {
            schemaId: 'tripnara.repair_provider_result@v1',
            providerId: authorityId,
            tripId: input.tripId,
            proposals: input.legacyChanges.map((c, i) => ({
              proposalId: `legacy-${i}`,
              candidateId: c.itemId ?? c.candidateId ?? `legacy-${i}`,
            })),
            generatedAt: new Date().toISOString(),
          },
          shadow: {
            schemaId: 'tripnara.repair_provider_result@v1',
            providerId: 'ortools-repair',
            tripId: input.tripId,
            proposals: [],
            generatedAt: new Date().toISOString(),
          },
          problem: {
            schemaId: 'tripnara.solver_problem@v1',
            requestId,
            tripId: input.tripId,
            planVersionId: input.planVersionId,
            operation: 'SWAP',
            scope: { dayIds: [`day-${input.dayIndex}`] },
            nodes: [],
            travelMatrix: { nodeIds: [], costsMin: [] },
            constraints: [],
            objectives: [],
            solverConfig: { maxCandidates: 3, timeLimitMs: 1, seed: 0 },
          },
          solverResponse: null,
        }),
        dayIndex: input.dayIndex,
        legacyChangeCount: input.legacyChanges.length,
        shadowChangeCount: 0,
        shadowChanges: [],
        contextVersion: input.contextVersion,
        evidenceVersionId,
        solverUnavailableReason: 'insufficient_day_nodes_for_routing',
      };
    }

    const solverResponse = await this.solverClient.solve(problem);
    const best = pickBestSolverCandidate(solverResponse?.candidates ?? []);
    const shadowChanges = best
      ? solverCandidateToPlanProposalChanges({
          candidate: best,
          dayIndex: input.dayIndex,
          items: input.items,
        })
      : [];

    const report = buildOrToolsRepairShadowReport({
      tripId: input.tripId,
      requestId,
      authorityProviderId: authorityId,
      authority: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: authorityId,
        tripId: input.tripId,
        proposals: input.legacyChanges.map((c, i) => ({
          proposalId: `legacy-${i}`,
          candidateId: c.itemId ?? c.candidateId ?? `legacy-${i}`,
        })),
        generatedAt: new Date().toISOString(),
      },
      shadow: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'ortools-repair',
        tripId: input.tripId,
        proposals: shadowChanges.map((c, i) => ({
          proposalId: c.itemId ?? `shadow-${i}`,
          candidateId: c.itemId ?? `shadow-${i}`,
        })),
        generatedAt: new Date().toISOString(),
      },
      problem,
      solverResponse,
    });

    const labCompare = buildOrToolsPlanningLabCompare({
      tripId: input.tripId,
      dayIndex: input.dayIndex,
      items: input.items,
      legacyChanges: input.legacyChanges,
      shadowChanges,
      shadowNodeOrder: best?.dayPlans[0]?.nodeIds,
      problem,
    });

    this.logger.log(
      `ortools planning-shadow intent=${input.planningIntent} trip=${input.tripId} ` +
        `day=${input.dayIndex} legacy=${input.legacyChanges.length} ` +
        `shadow=${shadowChanges.length} travelΔ=${labCompare.travelDeltaLegacyMinusShadow ?? 'n/a'} ` +
        `agree=${labCompare.legacyShadowOrderAgreement} ` +
        `status=${solverResponse?.status ?? 'n/a'} authority=false`,
    );

    this.metrics?.recordEvaluateShadow({
      schemaId: 'tripnara.ortools_evaluate_shadow@v1',
      report,
      gatewayByCandidateId: {},
      neptuneCandidateCount: input.legacyChanges.length,
      shadowCandidateCount: shadowChanges.length,
      shadowAuthority: false,
      shadowRepairCandidates: [],
      evidenceVersionId,
      snapshotId: evidenceVersionId,
      solverUnavailableReason: solverResponse
        ? undefined
        : 'solver_http_unavailable',
    });
    this.metrics?.recordPlanningLabCompare(labCompare);

    // Object spread in stamp widens string literals; keep attachment typed.
    return stampOrtToolsShadowFreshness({
      attachment: {
        schemaId: 'tripnara.ortools_planning_shadow@v1' as const,
        shadowAuthority: false as const,
        planningIntent: input.planningIntent,
        report,
        dayIndex: input.dayIndex,
        legacyChangeCount: input.legacyChanges.length,
        shadowChangeCount: shadowChanges.length,
        shadowChanges,
        contextVersion: input.contextVersion,
        evidenceVersionId,
        snapshotId: evidenceVersionId,
        solverProblemRequestId: problem.requestId,
        labCompare,
        solverUnavailableReason: solverResponse
          ? undefined
          : 'solver_http_unavailable',
      } satisfies OrtToolsPlanningShadowAttachment,
      currentEvidenceVersionId: evidenceVersionId,
      currentSnapshotId: evidenceVersionId,
    }) as OrtToolsPlanningShadowAttachment;
  }
}
