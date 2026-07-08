/**
 * PR-C — fill DecisionWorkspace with Guardian materials (no finalize, no plan mutation).
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import { AbuStrategy } from '../../decision/strategies/abu-strategy.service';
import { DrDreStrategy } from '../../decision/strategies/dr-dre-strategy.service';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import {
  assertionImpliesHardClosure,
  type RoadStatusAssertionPayload,
} from '../adapters/road-status-to-assertion.adapter';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import type { ResolveRoadStatusChangedResult } from '../evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../config/rfc001-iceland.config';
import type { RoadCloseImpactResult } from '../detection/road-close-impact.types';
import type { RoadSegmentBindings } from '../detection/road-close-impact.types';
import { RoadCloseImpactAnalyzerService } from '../detection/road-close-impact-analyzer.service';
import { readBindingsFromTripMetadata } from '../detection/road-close-impact-analyzer';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import {
  mapAbuResultToAssertion,
} from '../adapters/constraint-assertion.adapter';
import {
  evaluateAbuRoadConstraintForCandidate,
} from '../adapters/abu-road-constraint.adapter';
import {
  evaluateDreRoadLoadForCandidate,
  mergeDreStrategyIntoRoadLoadAssessment,
  stripDreUpdatedPlan,
} from '../adapters/dre-road-load.adapter';
import {
  ORIGINAL_CANDIDATE_ID,
  planForCandidate,
} from '../adapters/repair-candidate.adapter';
import {
  buildNeptuneRoadRepairCandidates,
  readBudgetCapFromTripMetadata,
} from '../adapters/neptune-road-repair.adapter';
import { NeptuneRepairProvider } from '../../../decision-runtime/candidates/providers/neptune-repair.provider';
import { buildMinimalEvaluateWorld } from './minimal-evaluate-world.util';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';
import {
  assertGuardianPayloadHasNoDecisionFields,
  assertNeptuneDoesNotDirectlyMutatePlan,
} from '../policy/write-permission.guard';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';

export interface RoadSegmentUnavailableEvaluateInput {
  tripId: string;
  problem: Rfc001DecisionProblem;
  evidence: ResolveRoadStatusChangedResult;
  impact: RoadCloseImpactResult;
}

@Injectable()
export class RoadSegmentUnavailableEvaluateService {
  private readonly logger = new Logger(RoadSegmentUnavailableEvaluateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly worldStateStore: WorldStateStoreService,
    private readonly impactAnalyzer: RoadCloseImpactAnalyzerService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    @Optional() private readonly abu?: AbuStrategy,
    @Optional() private readonly dre?: DrDreStrategy,
    @Optional() private readonly neptuneRepairProvider?: NeptuneRepairProvider,
  ) {}

  async evaluateByProblemId(
    tripId: string,
    problemId: string,
    opts?: { bindings?: RoadSegmentBindings },
  ): Promise<DecisionWorkspace> {
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`Decision problem ${problemId} not found`);
    }

    const store = await this.worldStateStore.readStore(tripId);
    const event = store.events.find(
      (e) => e.eventId === problem.triggerEventId,
    ) as RoadStatusChangedEvent | undefined;
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
        a.predicate === 'road.status',
    ) as WorldStateAssertion<RoadStatusAssertionPayload> | undefined;
    if (!assertion) {
      throw new NotFoundException('Road status assertion not found for snapshot');
    }

    const evidence: ResolveRoadStatusChangedResult = {
      event,
      assertion,
      snapshot,
      resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      hardClosure: assertionImpliesHardClosure(assertion),
      supersededAssertionIds: [],
    };

    const impact = await this.impactAnalyzer.analyzeForTrip(tripId, {
      roadId: event.payload.roadId,
      primarySegmentId:
        event.payload.segmentId ?? assertion.subjectRef.id,
      bindings: opts?.bindings,
    });

    return this.evaluate({ tripId, problem, evidence, impact });
  }

  async evaluate(input: RoadSegmentUnavailableEvaluateInput): Promise<DecisionWorkspace> {
    assertNeptuneDoesNotDirectlyMutatePlan({
      source: 'road-segment-unavailable-evaluate',
    });

    const { tripId, problem, evidence, impact } = input;
    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    let workspace =
      (await this.workspaceService.getByProblemId(tripId, problem.problemId)) ??
      (await this.workspaceService.createFromProblem(problem));

    const roadAssertion = evidence.assertion as WorldStateAssertion<RoadStatusAssertionPayload>;
    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, destination: true },
    });
    const bindings = readBindingsFromTripMetadata(
      (tripRow?.metadata ?? {}) as Record<string, unknown>,
    );

    const destinationCountry =
      resolveTripDestinationCountry(tripRow?.destination) ?? 'GLOBAL';

    const world = buildMinimalEvaluateWorld({
      countryCode: destinationCountry,
      roadId: evidence.event.payload.roadId,
      roadStatus: roadAssertion.payload.status,
    });

    const repairCandidates = await this.resolveNeptuneRepairCandidates({
      tripId,
      workspaceId: workspace.workspaceId,
      problem,
      impact,
      basePlan: plan,
      countryCode: destinationCountry,
      budgetCapIsk: readBudgetCapFromTripMetadata(
        (tripRow?.metadata ?? {}) as Record<string, unknown>,
      ),
      evidenceRefs: roadAssertion.source.evidenceRefs,
    });

    const constraintAssertions: Rfc001ConstraintAssertion[] = [];
    const loadAssessments = [];

    const candidateIds = [
      ORIGINAL_CANDIDATE_ID,
      ...repairCandidates.map((c) => c.candidateId),
    ];

    for (const candidateId of candidateIds) {
      const candidatePlan =
        candidateId === ORIGINAL_CANDIDATE_ID
          ? plan
          : planForCandidate(
              plan,
              repairCandidates.find((c) => c.candidateId === candidateId)!,
            );

      const roadConstraint = evaluateAbuRoadConstraintForCandidate({
        tripId,
        workspaceId: workspace.workspaceId,
        targetCandidateId: candidateId,
        roadAssertion,
        affectedPlanItemIds: impact.affectedPlanItemIds,
        candidatePlan,
        bindings,
        destinationCountry: tripRow?.destination ?? undefined,
      });
      constraintAssertions.push(roadConstraint);

      if (candidateId !== ORIGINAL_CANDIDATE_ID && this.abu) {
        const abuResult = await this.abu.evaluate(world, candidatePlan);
        const mapped = mapAbuResultToAssertion({
          workspaceId: workspace.workspaceId,
          targetCandidateId: candidateId,
          affectedPlanItemIds: impact.affectedPlanItemIds,
          result: abuResult,
        });
        assertGuardianPayloadHasNoDecisionFields(
          mapped as unknown as Record<string, unknown>,
          'ABU',
        );
        constraintAssertions.push(mapped);
      }

      if (this.dre) {
        const dreResult = stripDreUpdatedPlan(
          await this.dre.evaluate(world, candidatePlan),
        );
        const repair = repairCandidates.find((c) => c.candidateId === candidateId);
        const roadLoad = evaluateDreRoadLoadForCandidate({
          workspaceId: workspace.workspaceId,
          targetCandidateId: candidateId,
          inputSnapshotRef: problem.worldStateSnapshotId,
          baselinePlan: plan,
          candidatePlan,
          repairCandidate: repair,
          world,
          destinationCountry: tripRow?.destination ?? undefined,
          affectedDayIndex: impact.affectedPlanItemIds.length
            ? candidatePlan.segments?.find(
                (s) =>
                  (s.metadata as { itineraryItemId?: string })?.itineraryItemId ===
                  impact.affectedPlanItemIds[0],
              )?.dayIndex
            : undefined,
        });
        loadAssessments.push(
          mergeDreStrategyIntoRoadLoadAssessment(roadLoad, dreResult, {
            workspaceId: workspace.workspaceId,
            targetCandidateId: candidateId,
            inputSnapshotRef: problem.worldStateSnapshotId,
          }),
        );
      } else {
        const repair = repairCandidates.find((c) => c.candidateId === candidateId);
        loadAssessments.push(
          evaluateDreRoadLoadForCandidate({
            workspaceId: workspace.workspaceId,
            targetCandidateId: candidateId,
            inputSnapshotRef: problem.worldStateSnapshotId,
            baselinePlan: plan,
            candidatePlan,
            repairCandidate: repair,
            world,
            destinationCountry: tripRow?.destination ?? undefined,
            affectedDayIndex: impact.affectedPlanItemIds.length
              ? candidatePlan.segments?.find(
                  (s) =>
                    (s.metadata as { itineraryItemId?: string })
                      ?.itineraryItemId === impact.affectedPlanItemIds[0],
                )?.dayIndex
              : undefined,
          }),
        );
      }
    }

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
      `evaluate trip=${tripId} workspace=${workspace.workspaceId} candidates=${repairCandidates.length} assertions=${constraintAssertions.length}`,
    );

    return workspace;
  }

  private async resolveNeptuneRepairCandidates(
    input: Parameters<typeof buildNeptuneRoadRepairCandidates>[0] & { tripId: string },
  ) {
    if (this.neptuneRepairProvider) {
      const result = await this.neptuneRepairProvider.proposeRepairs({
        tripId: input.tripId,
        worldState: {
          context: {
            tripId: input.tripId,
            destination: input.countryCode ?? 'GLOBAL',
            startDate: '1970-01-01',
            durationDays: 1,
            preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
          },
          candidatesByDate: {},
          signals: { lastUpdatedAt: new Date().toISOString() },
        },
        providerContext: { neptune: input },
      });
      if (result.rfc001RepairCandidates?.length) {
        return result.rfc001RepairCandidates;
      }
    }

    return buildNeptuneRoadRepairCandidates(input);
  }
}
