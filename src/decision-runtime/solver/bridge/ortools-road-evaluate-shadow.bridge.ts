/**
 * Evaluate-chain bridge: RoutePlan → SolverProblem → OR-Tools → TripPlan → Gateway.
 * Shadow only — never authorize / write Plan Version (ADR-008).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { RoadCloseImpactResult } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';
import type { RoadSegmentBindings } from '../../../trips/guardian-decision-core/detection/road-close-impact.types';
import type { Rfc001DecisionProblem } from '../../../trips/guardian-decision-core/contracts/decision-problem.types';
import type { Rfc001RepairCandidate } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import { ConstraintEvaluationGatewayService } from '../../constraints/constraint-evaluation.gateway.service';
import { OrToolsSolverClient } from '../ortools-solver.client';
import {
  isOrToolsRepairShadowEnabled,
  resolveOrToolsSolverBaseUrl,
} from '../ortools-solver.config';
import { buildSolverProblemFromRoutePlan } from '../projection/build-solver-problem-from-route-plan.util';
import {
  buildOrtToolsRfc001RepairCandidates,
  materializeOrtToolsCandidatePlan,
} from '../adapters/ortools-to-rfc001-repair.adapter';
import { routePlanDraftToTripPlan } from '../materialize/route-plan-to-trip-plan.util';
import { buildOrToolsRepairShadowReport } from '../shadow/ortools-repair-shadow.compare';
import type { OrToolsRepairShadowReport } from '../shadow/ortools-repair-shadow.types';
import type { SolverResponse } from '../contracts/solver-response';
import { OrToolsShadowMetricsCollector } from '../observability/ortools-shadow-metrics.collector';

export interface OrtToolsGatewayShadowScore {
  candidateId: string;
  overallStatus: string;
  degraded: boolean;
  assertionCount: number;
}

export interface OrtToolsEvaluateCanaryAttachmentMeta {
  canaryStage: string;
  authoritativeProviderId: 'neptune-repair' | 'ortools-repair';
  whitelistMatched: boolean;
  operation: string;
  authorityArtifactId?: string;
  authorityTokenId?: string;
  gateAuthoritativePromotion: boolean;
  mergedIntoRepairCandidates: boolean;
  mergedCandidateIds: string[];
}

export interface OrtToolsEvaluateShadowAttachment {
  schemaId: 'tripnara.ortools_evaluate_shadow@v1';
  report: OrToolsRepairShadowReport;
  gatewayByCandidateId: Record<string, OrtToolsGatewayShadowScore>;
  neptuneCandidateCount: number;
  shadowCandidateCount: number;
  /**
   * Write-side flag — always false on evaluate attach (ADR-008).
   * Canary candidate-set merge is recorded in `canary`, not this flag.
   */
  shadowAuthority: false;
  /** Shadow repair candidates (not merged into authority set by default) */
  shadowRepairCandidates: Rfc001RepairCandidate[];
  /** M4 canary wire result (observability + merge audit) */
  canary?: OrtToolsEvaluateCanaryAttachmentMeta;
  /** Solver operation used for this shadow run (incl. deepen fallback) */
  solverOperation?: string;
  /** Bind shadow to evidence — stale when Evidence version changes */
  evidenceVersionId?: string;
  snapshotId?: string;
  /** P2 main-chain freshness stamp */
  evidenceFreshness?: 'FRESH' | 'STALE';
  discardedStalePrior?: boolean;
  evidenceBoundAt?: string;
  solverUnavailableReason?: string;
}

function minimalWorld(tripId: string): TripWorldState {
  return {
    context: {
      tripId,
      destination: 'IS',
      startDate: '1970-01-01',
      durationDays: 1,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {},
    signals: { lastUpdatedAt: new Date().toISOString() },
  };
}

@Injectable()
export class OrToolsRoadEvaluateShadowBridge {
  private readonly logger = new Logger(OrToolsRoadEvaluateShadowBridge.name);

  constructor(
    private readonly solverClient: OrToolsSolverClient,
    @Optional() private readonly gateway?: ConstraintEvaluationGatewayService,
    @Optional() private readonly metrics?: OrToolsShadowMetricsCollector,
  ) {}

  async run(input: {
    tripId: string;
    workspaceId: string;
    problem: Rfc001DecisionProblem;
    impact: RoadCloseImpactResult;
    basePlan: RoutePlanDraft;
    bindings?: RoadSegmentBindings;
    neptuneCandidates: Rfc001RepairCandidate[];
    evidenceRefs?: string[];
    worldState?: TripWorldState;
  }): Promise<OrtToolsEvaluateShadowAttachment | null> {
    if (!isOrToolsRepairShadowEnabled() || !resolveOrToolsSolverBaseUrl()) {
      return null;
    }

    const requestId = `ortools-eval:${input.problem.problemId}:${Date.now()}`;
    const problem = buildSolverProblemFromRoutePlan({
      requestId,
      tripId: input.tripId,
      planVersionId: input.problem.planVersionId,
      evidenceVersionId: input.problem.worldStateSnapshotId,
      snapshotId: input.problem.worldStateSnapshotId,
      plan: input.basePlan,
      impact: input.impact,
      bindings: input.bindings,
    });

    if (!problem) {
      const emptyAttach: OrtToolsEvaluateShadowAttachment = {
        schemaId: 'tripnara.ortools_evaluate_shadow@v1',
        report: buildOrToolsRepairShadowReport({
          tripId: input.tripId,
          requestId,
          authorityProviderId: 'neptune-repair',
          authority: {
            schemaId: 'tripnara.repair_provider_result@v1',
            providerId: 'neptune-repair',
            tripId: input.tripId,
            proposals: input.neptuneCandidates.map((c) => ({
              proposalId: c.candidateId,
              candidateId: c.candidateId,
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
            planVersionId: input.problem.planVersionId,
            operation: 'SWAP',
            scope: { dayIds: ['day-0'] },
            nodes: [],
            travelMatrix: { nodeIds: [], costsMin: [] },
            constraints: [],
            objectives: [],
            solverConfig: { maxCandidates: 3, timeLimitMs: 1, seed: 0 },
          },
          solverResponse: null,
        }),
        gatewayByCandidateId: {},
        neptuneCandidateCount: input.neptuneCandidates.length,
        shadowCandidateCount: 0,
        shadowAuthority: false,
        shadowRepairCandidates: [],
        solverOperation: 'SWAP',
        evidenceVersionId: input.problem.worldStateSnapshotId,
        snapshotId: input.problem.worldStateSnapshotId,
        solverUnavailableReason: 'insufficient_day_nodes_for_routing',
      };
      this.metrics?.recordEvaluateShadow(emptyAttach);
      return emptyAttach;
    }

    let solverResponse: SolverResponse | null =
      await this.solverClient.solve(problem);
    let effectiveOperation = String(problem.operation);

    // Shadow deepen: empty primary → SHORTEN → REPLACE (REPLACE_POOL / drop).
    // Still non-authoritative; Gateway remains required upstream.
    const deepenOps = ['SHORTEN', 'REPLACE'] as const;
    for (const op of deepenOps) {
      if (solverResponse?.candidates?.length) break;
      if (!solverResponse) break;
      if (problem.operation === op) continue;
      const deepenProblem = {
        ...problem,
        requestId: `${requestId}:${op.toLowerCase()}`,
        operation: op,
        solverConfig: {
          ...problem.solverConfig,
          timeLimitMs: Math.min(problem.solverConfig.timeLimitMs, 800),
        },
      };
      const deepenResp = await this.solverClient.solve(deepenProblem);
      if (deepenResp?.candidates?.length) {
        solverResponse = deepenResp;
        effectiveOperation = op;
        this.logger.log(
          `ortools evaluate-shadow fallback ${op} trip=${input.tripId} ` +
            `candidates=${deepenResp.candidates.length}`,
        );
      }
    }

    const shadowCandidates = solverResponse
      ? buildOrtToolsRfc001RepairCandidates({
          workspaceId: input.workspaceId,
          basePlanVersionId: input.problem.planVersionId,
          basePlan: input.basePlan,
          impact: input.impact,
          candidates: solverResponse.candidates,
          evidenceRefs: input.evidenceRefs,
        })
      : [];

    const gatewayByCandidateId: Record<string, OrtToolsGatewayShadowScore> = {};
    const world = input.worldState ?? minimalWorld(input.tripId);

    if (solverResponse && this.gateway) {
      for (const cand of solverResponse.candidates) {
        const draft = materializeOrtToolsCandidatePlan(
          input.basePlan,
          cand,
          input.impact,
        );
        const startMinByNodeId: Record<string, number> = {};
        const day = cand.dayPlans[0];
        if (day?.startMin) {
          day.nodeIds.forEach((id, i) => {
            if (day.startMin?.[i] != null) startMinByNodeId[id] = day.startMin[i]!;
          });
        }
        const tripPlan = routePlanDraftToTripPlan(draft, { startMinByNodeId });
        try {
          const report = await this.gateway.evaluateCandidate({
            tripId: input.tripId,
            candidateId: cand.candidateId,
            plan: tripPlan,
            worldState: world,
            countryCode: 'IS',
            evaluationMode: 'PLAN_VERIFY',
          });
          gatewayByCandidateId[cand.candidateId] = {
            candidateId: cand.candidateId,
            overallStatus: report.overallStatus,
            degraded: report.degraded,
            assertionCount: report.assertions.length,
          };
        } catch (err) {
          this.logger.warn(
            `gateway shadow failed candidate=${cand.candidateId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          gatewayByCandidateId[cand.candidateId] = {
            candidateId: cand.candidateId,
            overallStatus: 'UNVERIFIED',
            degraded: true,
            assertionCount: 0,
          };
        }
      }
    }

    const report = buildOrToolsRepairShadowReport({
      tripId: input.tripId,
      requestId,
      authorityProviderId: 'neptune-repair',
      authority: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'neptune-repair',
        tripId: input.tripId,
        proposals: input.neptuneCandidates.map((c) => ({
          proposalId: c.candidateId,
          candidateId: c.candidateId,
        })),
        generatedAt: new Date().toISOString(),
      },
      shadow: {
        schemaId: 'tripnara.repair_provider_result@v1',
        providerId: 'ortools-repair',
        tripId: input.tripId,
        proposals: shadowCandidates.map((c) => ({
          proposalId: c.candidateId,
          candidateId: c.candidateId,
        })),
        generatedAt: new Date().toISOString(),
      },
      problem,
      solverResponse,
    });

    this.logger.log(
      `ortools evaluate-shadow trip=${input.tripId} neptune=${input.neptuneCandidates.length} ` +
        `shadow=${shadowCandidates.length} forbidViol=${report.forbiddenEdgeViolations} ` +
        `gatewayScores=${Object.keys(gatewayByCandidateId).length} authority=false`,
    );

    const attachment: OrtToolsEvaluateShadowAttachment = {
      schemaId: 'tripnara.ortools_evaluate_shadow@v1',
      report,
      gatewayByCandidateId,
      neptuneCandidateCount: input.neptuneCandidates.length,
      shadowCandidateCount: shadowCandidates.length,
      shadowAuthority: false,
      shadowRepairCandidates: shadowCandidates,
      solverOperation: effectiveOperation,
      evidenceVersionId:
        problem.evidenceVersionId ?? input.problem.worldStateSnapshotId,
      snapshotId: problem.snapshotId ?? input.problem.worldStateSnapshotId,
      solverUnavailableReason: solverResponse ? undefined : 'solver_http_unavailable',
    };
    this.metrics?.recordEvaluateShadow(attachment);
    return attachment;
  }
}
