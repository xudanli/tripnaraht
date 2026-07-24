/**
 * Slice 3 — fill DecisionWorkspace for execution schedule infeasibility.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { ResolveExecutionDepartureSlipResult } from '../evidence/evidence-resolver.service';
import type { ExecutionSlipImpactResult } from '../detection/execution-slip-impact-analyzer';
import { evaluateAbuExecutionSlipConstraintForCandidate } from '../adapters/abu-execution-slip-constraint.adapter';
import { buildCandidatePlanForExecutionSlip } from '../adapters/abu-execution-slip-constraint.adapter';
import {
  buildExecutionSlipRepairCandidates,
  evaluateShortenCandidateFeasible,
} from '../adapters/execution-slip-repair-candidate.adapter';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';
import { EXECUTION_SLIP_CANDIDATE_IDS } from '../contracts/execution-slip.types';
import { evaluateDreRoadLoadForCandidate } from '../adapters/dre-road-load.adapter';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { assertGuardianPayloadHasNoDecisionFields } from '../policy/write-permission.guard';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import { buildMinimalEvaluateWorld } from './minimal-evaluate-world.util';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';

export interface ExecutionSlipEvaluateInput {
  tripId: string;
  problem: Rfc001DecisionProblem;
  evidence: ResolveExecutionDepartureSlipResult;
  impact: ExecutionSlipImpactResult;
  remainingStayMinutes?: number;
}

@Injectable()
export class ExecutionSlipEvaluateService {
  private readonly logger = new Logger(ExecutionSlipEvaluateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly worldStateStore: WorldStateStoreService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  async evaluateByProblemId(
    _tripId: string,
    _problemId: string,
  ): Promise<DecisionWorkspace> {
    throw new NotFoundException(
      'Use runFullFromObservation; execution slip evaluate requires pipeline impact context',
    );
  }

  async evaluate(input: ExecutionSlipEvaluateInput): Promise<DecisionWorkspace> {
    const { tripId, problem, evidence, impact } = input;
    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    let workspace =
      (await this.workspaceService.getByProblemId(tripId, problem.problemId)) ??
      (await this.workspaceService.createFromProblem(problem));

    const slipAssertion = evidence.assertion;
    const remainingStay = input.remainingStayMinutes ?? 128;

    const repairCandidates = buildExecutionSlipRepairCandidates({
      workspaceId: workspace.workspaceId,
      problem,
      impact,
      evidenceRefs: slipAssertion.source.evidenceRefs,
    }).filter((c) => {
      if (c.candidateId !== EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY) {
        return true;
      }
      if (!impact.nextWindow) return false;
      return evaluateShortenCandidateFeasible({
        observationAt: slipAssertion.payload.observedAt,
        remainingStayMinutes: remainingStay,
        shortenMinutes: impact.shortenDeltaMinutes,
        travelDurationMinutes: impact.travelDurationMinutes,
        nextWindow: impact.nextWindow,
      });
    });

    const candidateIds = [
      ORIGINAL_CANDIDATE_ID,
      ...repairCandidates.map((c) => c.candidateId),
    ];

    const constraintAssertions: Rfc001ConstraintAssertion[] = [];
    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });
    const destinationCountry =
      resolveTripDestinationCountry(tripRow?.destination) ?? 'GLOBAL';
    const world = buildMinimalEvaluateWorld({
      countryCode: destinationCountry,
      roadId: 'N/A',
      roadStatus: 'OPEN',
    });

    for (const candidateId of candidateIds) {
      const candidatePlan = buildCandidatePlanForExecutionSlip(
        plan,
        candidateId,
        impact,
      );
      constraintAssertions.push(
        evaluateAbuExecutionSlipConstraintForCandidate({
          tripId,
          workspaceId: workspace.workspaceId,
          targetCandidateId: candidateId,
          slipAssertion,
          impact,
          candidatePlan,
        }),
      );
    }

    const loadAssessments = candidateIds.map((candidateId) =>
      evaluateDreRoadLoadForCandidate({
        workspaceId: workspace.workspaceId,
        targetCandidateId: candidateId,
        inputSnapshotRef: problem.worldStateSnapshotId,
        baselinePlan: plan,
        candidatePlan: buildCandidatePlanForExecutionSlip(plan, candidateId, impact),
        world,
        affectedDayIndex: 0,
        destinationCountry: tripRow?.destination ?? undefined,
      }),
    );

    for (const candidate of repairCandidates) {
      assertGuardianPayloadHasNoDecisionFields(
        candidate as unknown as Record<string, unknown>,
        'NEPTUNE',
      );
    }

    workspace = await this.workspaceService.save(tripId, {
      ...workspace,
      constraintAssertions,
      loadAssessments,
      repairCandidates,
      revision: workspace.revision + 1,
      status: 'COLLECTING',
    });

    workspace = await this.workspaceService.markReady(tripId, workspace.workspaceId);

    this.logger.debug(
      `execution-slip evaluate trip=${tripId} candidates=${repairCandidates.length}`,
    );

    return workspace;
  }
}
