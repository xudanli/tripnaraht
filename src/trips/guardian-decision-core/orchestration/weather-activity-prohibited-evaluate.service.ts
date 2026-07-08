/**
 * Slice 2 — fill DecisionWorkspace for weather/activity prohibition.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { synthesizeRoutePlanDraftFromTrip } from '../../trip-constraint-solver/utils/trip-route-plan-draft.util';
import type { Rfc001DecisionProblem } from '../contracts/decision-problem.types';
import type { DecisionWorkspace } from '../contracts/decision-workspace.types';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { WeatherHazardAssertionPayload } from '../adapters/weather-hazard-to-assertion.adapter';
import type { ResolveWeatherHazardChangedResult } from '../evidence/evidence-resolver.service';
import type { WeatherActivityImpactResult } from '../detection/weather-activity-impact-analyzer';
import { analyzeWeatherActivityImpact } from '../detection/weather-activity-impact-analyzer';
import { evaluateDreRoadLoadForCandidate } from '../adapters/dre-road-load.adapter';
import { evaluateAbuWeatherActivityConstraintForCandidate } from '../adapters/abu-weather-activity-constraint.adapter';
import {
  buildWeatherActivityStubCandidates,
  planForWeatherCandidate,
  WEATHER_INDOOR_CANDIDATE_ID,
} from '../adapters/weather-repair-candidate.adapter';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import { assertGuardianPayloadHasNoDecisionFields } from '../policy/write-permission.guard';
import type { Rfc001ConstraintAssertion } from '../contracts/guardian-outputs.types';
import { buildMinimalEvaluateWorld } from './minimal-evaluate-world.util';
import { resolveTripDestinationCountry } from '../../../decision-runtime/packs/loader/country-pack-registry.util';

export interface WeatherActivityProhibitedEvaluateInput {
  tripId: string;
  problem: Rfc001DecisionProblem;
  evidence: ResolveWeatherHazardChangedResult;
  impact: WeatherActivityImpactResult;
}

@Injectable()
export class WeatherActivityProhibitedEvaluateService {
  private readonly logger = new Logger(WeatherActivityProhibitedEvaluateService.name);

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
        a.predicate === 'weather.hazard',
    ) as WorldStateAssertion<WeatherHazardAssertionPayload> | undefined;
    if (!assertion) {
      throw new NotFoundException('Weather hazard assertion not found for snapshot');
    }

    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    const impact = analyzeWeatherActivityImpact(plan, {
      tripId,
      dayIndex: assertion.payload.dayIndex,
      regionId: assertion.payload.regionId,
    });

    const evidence: ResolveWeatherHazardChangedResult = {
      event: event as ResolveWeatherHazardChangedResult['event'],
      assertion,
      snapshot,
      resolverVersion: 'evidence-resolver-0.1.0',
      weatherProhibition: assertion.payload.windSpeedKmh >= 90,
      supersededAssertionIds: [],
    };

    return this.evaluate({ tripId, problem, evidence, impact });
  }

  async evaluate(
    input: WeatherActivityProhibitedEvaluateInput,
  ): Promise<DecisionWorkspace> {
    const { tripId, problem, evidence, impact } = input;
    const plan = await synthesizeRoutePlanDraftFromTrip(this.prisma, tripId);
    if (!plan) {
      throw new Error(`Cannot synthesize plan for trip ${tripId}`);
    }

    let workspace =
      (await this.workspaceService.getByProblemId(tripId, problem.problemId)) ??
      (await this.workspaceService.createFromProblem(problem));

    const weatherAssertion = evidence.assertion;
    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { destination: true },
    });

    const repairCandidates = buildWeatherActivityStubCandidates({
      workspaceId: workspace.workspaceId,
      problem,
      impact,
      evidenceRefs: weatherAssertion.source.evidenceRefs,
    });

    const constraintAssertions: Rfc001ConstraintAssertion[] = [];
    const candidateIds = [
      ORIGINAL_CANDIDATE_ID,
      WEATHER_INDOOR_CANDIDATE_ID,
    ];

    const destinationCountry =
      resolveTripDestinationCountry(tripRow?.destination) ?? 'GLOBAL';

    const world = buildMinimalEvaluateWorld({
      countryCode: destinationCountry,
      roadId: 'N/A',
      roadStatus: 'OPEN',
    });

    for (const candidateId of candidateIds) {
      const candidatePlan = planForWeatherCandidate(
        plan,
        candidateId,
        impact.affectedPlanItemIds,
      );

      constraintAssertions.push(
        evaluateAbuWeatherActivityConstraintForCandidate({
          tripId,
          workspaceId: workspace.workspaceId,
          targetCandidateId: candidateId,
          weatherAssertion,
          affectedPlanItemIds: impact.affectedPlanItemIds,
          candidatePlan,
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
        candidatePlan: planForWeatherCandidate(
          plan,
          candidateId,
          impact.affectedPlanItemIds,
        ),
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
      `weather evaluate trip=${tripId} workspace=${workspace.workspaceId} assertions=${constraintAssertions.length}`,
    );

    return workspace;
  }
}
