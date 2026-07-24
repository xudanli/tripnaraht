/**
 * Slice 3 — fill DecisionWorkspace for excessive daily load (Dr.Dre-led).
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { DailyLoadAssertionPayload } from '../adapters/daily-load-to-assertion.adapter';
import type { ResolveDailyLoadChangedResult } from '../evidence/evidence-resolver.service';
import type { ExcessiveDailyLoadImpactResult } from '../detection/excessive-daily-load-impact-analyzer';
import { evaluateDreRoadLoadForCandidate } from '../adapters/dre-road-load.adapter';
import { evaluateDreDailyLoadConstraintForCandidate } from '../adapters/dre-daily-load-constraint.adapter';
import {
  buildDailyLoadStubCandidates,
  planForDailyLoadCandidate,
  DAILY_LOAD_SPLIT_CANDIDATE_ID,
} from '../adapters/dre-daily-load-repair-candidate.adapter';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { assertGuardianPayloadHasNoDecisionFields } from '../policy/write-permission.guard';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import { buildMinimalEvaluateWorld } from './minimal-evaluate-world.util';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../config/rfc001-iceland.config';

export interface ExcessiveDailyLoadEvaluateInput {
  tripId: string;
  problem: Rfc001DecisionProblem;
  evidence: ResolveDailyLoadChangedResult;
  impact: ExcessiveDailyLoadImpactResult;
}

@Injectable()
export class ExcessiveDailyLoadEvaluateService {
  private readonly logger = new Logger(ExcessiveDailyLoadEvaluateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly worldStateStore: WorldStateStoreService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
  ) {}

  async evaluateByProblemId(
    tripId: string,
    problemId: string,
  ): Promise<DecisionWorkspace> {
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }

    const store = await this.worldStateStore.readStore(tripId);
    const event = store.events.find((e) => e.eventId === problem.triggerEventId);
    if (!event) {
      throw new NotFoundException(
        `Trigger event ${problem.triggerEventId} not found in world state`,
      );
    }

    const snapshot = store.snapshots.find(
      (s) => s.snapshotId === problem.worldStateSnapshotId,
    );
    if (!snapshot) {
      throw new NotFoundException(
        `World state snapshot ${problem.worldStateSnapshotId} not found`,
      );
    }

    const assertion = store.assertions.find(
      (a) =>
        snapshot.assertionIds.includes(a.assertionId) &&
        a.predicate === 'daily.load',
    ) as WorldStateAssertion<DailyLoadAssertionPayload> | undefined;
    if (!assertion) {
      throw new NotFoundException('Daily load assertion not found for snapshot');
    }

    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    const impact: ExcessiveDailyLoadImpactResult = {
      dayIndex: assertion.payload.dayIndex,
      drivingHours: assertion.payload.drivingHours,
      thresholdHours: assertion.payload.thresholdHours,
      affectedPlanItemIds: problem.affectedPlanItemIds,
      affectedEntityRefs: problem.affectedEntityRefs,
    };

    const evidence: ResolveDailyLoadChangedResult = {
      event: event as ResolveDailyLoadChangedResult['event'],
      assertion,
      snapshot,
      resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      excessiveLoad: assertion.payload.drivingHours > assertion.payload.thresholdHours,
      supersededAssertionIds: [],
    };

    return this.evaluate({ tripId, problem, evidence, impact });
  }

  async evaluate(
    input: ExcessiveDailyLoadEvaluateInput,
  ): Promise<DecisionWorkspace> {
    const { tripId, problem, evidence, impact } = input;
    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    let workspace =
      (await this.workspaceService.getByProblemId(tripId, problem.problemId)) ??
      (await this.workspaceService.createFromProblem(problem));

    const loadAssertion = evidence.assertion;
    const repairCandidates = buildDailyLoadStubCandidates({
      workspaceId: workspace.workspaceId,
      problem,
      impact,
      evidenceRefs: loadAssertion.source.evidenceRefs,
    });

    const candidateIds = [ORIGINAL_CANDIDATE_ID, DAILY_LOAD_SPLIT_CANDIDATE_ID];
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
      const candidatePlan = planForDailyLoadCandidate(plan, candidateId, impact);
      constraintAssertions.push(
        evaluateDreDailyLoadConstraintForCandidate({
          tripId,
          workspaceId: workspace.workspaceId,
          targetCandidateId: candidateId,
          loadAssertion,
          baselinePlan: plan,
          candidatePlan,
          inputSnapshotRef: problem.worldStateSnapshotId,
          affectedPlanItemIds: impact.affectedPlanItemIds,
          destinationCountry: tripRow?.destination ?? undefined,
        }),
      );
    }

    const loadAssessments = candidateIds.map((candidateId) =>
      evaluateDreRoadLoadForCandidate({
        workspaceId: workspace.workspaceId,
        targetCandidateId: candidateId,
        inputSnapshotRef: problem.worldStateSnapshotId,
        baselinePlan: plan,
        candidatePlan: planForDailyLoadCandidate(plan, candidateId, impact),
        world,
        affectedDayIndex: impact.dayIndex,
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
      `daily load evaluate trip=${tripId} workspace=${workspace.workspaceId} assertions=${constraintAssertions.length}`,
    );

    return workspace;
  }
}
