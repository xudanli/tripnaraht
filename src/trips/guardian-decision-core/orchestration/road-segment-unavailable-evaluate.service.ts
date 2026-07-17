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
import { buildTraversabilityAssessmentForRoad } from '../assessment/road-traversability-trip-context.util';
import { ROAD_TRAVERSABILITY_ASSESSOR_VERSION } from '../assessment/road-traversability.assessor';
import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../../decision-runtime/packs/road/road-segment-profile.loader';
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
import { evaluateAbuRoadOpeningWindowConstraintForCandidate } from '../adapters/abu-road-opening-window-constraint.adapter';
import { buildRoadOpeningWindowEvaluationContext } from '../adapters/road-opening-window-context.util';
import {
  buildStillOpenRoadSubstituteCandidates,
  shouldGenerateStillOpenRoadSubstitutes,
} from '../adapters/still-open-road-substitute.adapter';
import { NeptuneRepairProvider } from '../../../decision-runtime/candidates/providers/neptune-repair.provider';
import { OrToolsRoadEvaluateShadowBridge } from '../../../decision-runtime/solver/bridge/ortools-road-evaluate-shadow.bridge';
import { OrToolsShadowMetricsCollector } from '../../../decision-runtime/solver/observability/ortools-shadow-metrics.collector';
import { OrToolsCanaryDashboardCollector } from '../../../decision-runtime/solver/observability/ortools-canary-dashboard.metrics';
import { wireOrtToolsEvaluateCanary } from '../../../decision-runtime/solver/observability/ortools-canary-evaluate.wire';
import {
  isOrtToolsShadowEvidenceStale,
  stampOrtToolsShadowFreshness,
} from '../../../decision-runtime/solver/lab/ortools-shadow-evidence-freshness.util';
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
    /** ADR-008 — OR-Tools shadow; canary merge only when Release Gate + scope allow */
    @Optional() private readonly ortoolsShadowBridge?: OrToolsRoadEvaluateShadowBridge,
    @Optional() private readonly ortoolsShadowMetrics?: OrToolsShadowMetricsCollector,
    @Optional() private readonly ortoolsCanaryDashboard?: OrToolsCanaryDashboardCollector,
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
      select: { metadata: true, destination: true, status: true },
    });
    const bindings = readBindingsFromTripMetadata(
      (tripRow?.metadata ?? {}) as Record<string, unknown>,
    );

    const destinationCountry =
      resolveTripDestinationCountry(tripRow?.destination) ?? 'GLOBAL';

    const tripMetadata = (tripRow?.metadata ?? {}) as Record<string, unknown>;
    const worldStore = await this.worldStateStore.readStore(tripId);
    const traversabilityAssessment = buildTraversabilityAssessmentForRoad(
      tripId,
      evidence.event.payload.roadId,
      roadAssertion,
      tripMetadata,
      tripRow?.destination,
      { worldAssertions: worldStore.assertions },
    );
    const profileBundle = loadRoadSegmentProfilesForCountry(destinationCountry);
    const roadProfile = profileBundle
      ? resolveRoadSegmentProfile(evidence.event.payload.roadId, profileBundle)
      : null;

    const world = buildMinimalEvaluateWorld({
      countryCode: destinationCountry,
      roadId: evidence.event.payload.roadId,
      roadStatus: roadAssertion.payload.status,
    });

    let repairCandidates = await this.resolveNeptuneRepairCandidates({
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
    const neptuneRepairCandidates = repairCandidates;

    let openingWindowContext = buildRoadOpeningWindowEvaluationContext({
      tripMetadata: tripMetadata,
      tripStatus: tripRow?.status,
      basePlan: plan,
      affectedPlanItemIds: impact.affectedPlanItemIds,
    });

    if (
      shouldGenerateStillOpenRoadSubstitutes(
        repairCandidates,
        openingWindowContext,
      )
    ) {
      const stillOpen = buildStillOpenRoadSubstituteCandidates({
        workspaceId: workspace.workspaceId,
        problem,
        impact,
        basePlan: plan,
        openingContext: openingWindowContext,
        existingCandidates: repairCandidates,
        countryCode: destinationCountry,
        tripMetadata,
        evidenceRefs: roadAssertion.source.evidenceRefs,
      });
      if (stillOpen.candidates.length > 0) {
        repairCandidates = [...repairCandidates, ...stillOpen.candidates];
        openingWindowContext = {
          ...openingWindowContext,
          windowsByPoiId: {
            ...openingWindowContext.windowsByPoiId,
            ...stillOpen.windowsByPoiId,
          },
        };
        this.logger.debug(
          `still-open substitutes trip=${tripId} added=${stillOpen.candidates.length}`,
        );
      }
    }

    const constraintAssertions: Rfc001ConstraintAssertion[] = [];
    const loadAssessments = [];

    const candidateIds = [
      ORIGINAL_CANDIDATE_ID,
      ...repairCandidates.map((c) => c.candidateId),
    ];

    for (const candidateId of candidateIds) {
      const repair = repairCandidates.find((c) => c.candidateId === candidateId);
      const candidatePlan =
        candidateId === ORIGINAL_CANDIDATE_ID
          ? plan
          : planForCandidate(plan, repair!);

      const roadConstraint = evaluateAbuRoadConstraintForCandidate({
        tripId,
        workspaceId: workspace.workspaceId,
        targetCandidateId: candidateId,
        roadAssertion,
        affectedPlanItemIds: impact.affectedPlanItemIds,
        candidatePlan,
        bindings,
        destinationCountry: tripRow?.destination ?? undefined,
        traversabilityAssessment,
      });
      constraintAssertions.push(roadConstraint);

      constraintAssertions.push(
        evaluateAbuRoadOpeningWindowConstraintForCandidate({
          workspaceId: workspace.workspaceId,
          targetCandidateId: candidateId,
          affectedPlanItemIds: impact.affectedPlanItemIds,
          evidenceRefs: roadAssertion.source.evidenceRefs,
          context: openingWindowContext,
          repairCandidate: repair,
        }),
      );

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

    const currentEvidenceId = problem.worldStateSnapshotId;
    const priorShadow = workspace.ortoolsShadow;
    const discardedStalePrior = Boolean(
      priorShadow &&
        isOrtToolsShadowEvidenceStale({
          attachmentEvidenceVersionId: priorShadow.evidenceVersionId,
          attachmentSnapshotId: priorShadow.snapshotId,
          currentEvidenceVersionId: currentEvidenceId,
          currentSnapshotId: currentEvidenceId,
        }),
    );
    if (discardedStalePrior) {
      this.ortoolsShadowMetrics?.recordStaleDiscard({
        tripId,
        priorEvidenceVersionId: priorShadow?.evidenceVersionId,
        currentEvidenceVersionId: currentEvidenceId,
      });
      this.logger.log(
        `ortools shadow discarded stale prior trip=${tripId} ` +
          `priorEv=${priorShadow?.evidenceVersionId} currentEv=${currentEvidenceId}`,
      );
    }

    let ortoolsShadow =
      (await this.ortoolsShadowBridge?.run({
        tripId,
        workspaceId: workspace.workspaceId,
        problem,
        impact,
        basePlan: plan,
        bindings,
        neptuneCandidates: repairCandidates,
        evidenceRefs: roadAssertion.source.evidenceRefs,
        // Gateway expects TripWorldState; bridge falls back to minimalWorld(tripId).
      })) ?? undefined;

    if (ortoolsShadow) {
      // M4: write-side shadowAuthority stays false; canary may merge Gateway-PASS candidates
      ortoolsShadow = stampOrtToolsShadowFreshness({
        attachment: {
          ...ortoolsShadow,
          shadowAuthority: false as const,
          evidenceVersionId:
            ortoolsShadow.evidenceVersionId ?? currentEvidenceId,
          snapshotId: ortoolsShadow.snapshotId ?? currentEvidenceId,
        },
        currentEvidenceVersionId: currentEvidenceId,
        currentSnapshotId: currentEvidenceId,
        discardedStalePrior,
      });

      const wired = wireOrtToolsEvaluateCanary({
        tripId,
        operation: ortoolsShadow.solverOperation ?? 'REROUTE',
        planVersionId: problem.planVersionId,
        evidenceVersionAtSolve: ortoolsShadow.evidenceVersionId,
        evidenceVersionAtExecute: currentEvidenceId,
        neptuneCandidates: neptuneRepairCandidates,
        ortoolsShadow,
        dashboard: this.ortoolsCanaryDashboard,
      });
      repairCandidates = wired.repairCandidates;
      ortoolsShadow = wired.ortoolsShadow;

      for (const candidate of repairCandidates) {
        if (neptuneRepairCandidates.some((c) => c.candidateId === candidate.candidateId)) {
          continue;
        }
        assertGuardianPayloadHasNoDecisionFields(
          candidate as unknown as Record<string, unknown>,
          'NEPTUNE',
        );
      }

      this.logger.log(
        `ortools shadow attached trip=${tripId} neptune=${ortoolsShadow.neptuneCandidateCount} ` +
          `shadow=${ortoolsShadow.shadowCandidateCount} freshness=${ortoolsShadow.evidenceFreshness} ` +
          `canaryProvider=${ortoolsShadow.canary?.authoritativeProviderId} ` +
          `merged=${ortoolsShadow.canary?.mergedIntoRepairCandidates} ` +
          `writeAttempted=${ortoolsShadow.report.writeAttempted}`,
      );
    } else if (discardedStalePrior) {
      // Evidence moved — do not leave a stale attachment on the workspace
      ortoolsShadow = undefined;
    }

    workspace = await this.workspaceService.save(tripId, {
      ...workspace,
      worldStateSnapshotId: currentEvidenceId,
      constraintAssertions,
      loadAssessments,
      repairCandidates,
      ortoolsShadow,
      roadTraversability: traversabilityAssessment
        ? {
            roadId: evidence.event.payload.roadId.toUpperCase(),
            segmentId: roadProfile?.segmentId,
            assessment: traversabilityAssessment,
            assessorVersion: ROAD_TRAVERSABILITY_ASSESSOR_VERSION,
            evaluatedAt: new Date().toISOString(),
          }
        : undefined,
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
