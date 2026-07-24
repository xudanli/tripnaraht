/**
 * RFC-001 Decision Center read model — aggregates trip.metadata RFC-001 blocks for UI.
 */

import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  resolveTripRevision,
  revisionToString,
} from '../../trip-constraint-solver/utils/trip-revision.util';
import { Rfc001DecisionProblemStoreService } from '../persistence/rfc001-decision-problem.store';
import { Rfc001DecisionLedgerStoreService } from '../persistence/rfc001-decision-ledger.store';
import { DecisionWorkspaceService } from '../workspace/decision-workspace.service';
import { Rfc001PlanVersionStoreService } from '../plan-version/plan-version.store';
import { WorldStateStoreService } from '../evidence/world-state-store.service';
import {
  bridgeCandidatesToOptions,
  bridgeRfc001ProblemToDecisionProblemSummary,
  bridgeRfc001RecordToV15Mirror,
  buildCandidateViews,
  buildDecisionLineage,
  resolveLeadingPersona,
  type Rfc001DecisionCenterProblemView,
  type Rfc001DecisionCenterTripView,
} from '../adapters/decision-center-bridge.adapter';
import { Rfc001DecisionSemanticsProjectorService } from './rfc001-decision-semantics-projector.service';
import { Rfc001DecisionEngineRoutingService } from '../routing/decision-engine-routing.service';
import type { TripDecisionRoutingView } from '../routing/decision-engine-routing.types';
import { dedupeExcessiveDailyLoadProblemViews } from '../detection/excessive-daily-load-problem.util';
import { buildImpactScopeViewForProblem } from '../adapters/impact-scope-view.util';
import { resolveExecutionSlipOptionContext } from '../adapters/execution-slip-option-context.resolver';
import { buildTraversabilityAssessmentForRoad } from '../assessment/road-traversability-trip-context.util';
import { ROAD_TRAVERSABILITY_ASSESSOR_VERSION } from '../assessment/road-traversability.assessor';
import {
  loadRoadSegmentProfilesForCountry,
  resolveRoadSegmentProfile,
} from '../../../decision-runtime/packs/road/road-segment-profile.loader';
import type { RoadStatusAssertionPayload } from '../adapters/road-status-to-assertion.adapter';
import type { WorldStateAssertion } from '../contracts/world-state.types';
import type { RoadTraversabilityWorkspaceSnapshot } from '../contracts/decision-workspace.types';
import type { RoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { isActionablePendingRecord } from '../cutover/cutover-reconciliation.util';

@Injectable()
export class Rfc001DecisionCenterReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly ledgerStore: Rfc001DecisionLedgerStoreService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly planVersionStore: Rfc001PlanVersionStoreService,
    private readonly worldStateStore: WorldStateStoreService,
    @Optional() private readonly v15Projector?: Rfc001DecisionSemanticsProjectorService,
    @Optional() private readonly routingService?: Rfc001DecisionEngineRoutingService,
  ) {}

  async getTripView(tripId: string): Promise<Rfc001DecisionCenterTripView> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);

    const tripVersion = revisionToString(resolveTripRevision(trip));
    const problems = (await this.problemStore.list(tripId)).filter(
      (p) => p.status !== 'FAILED',
    );
    const decisionRef = await this.ledgerStore.getDecisionRef(tripId);
    const planBlock = await this.planVersionStore.readBlock(tripId);
    const runs = await this.ledgerStore.listRuns(tripId);
    const latestRun = runs.length ? runs[runs.length - 1] : undefined;

    const problemViews = dedupeExcessiveDailyLoadProblemViews(
      await Promise.all(
        problems.map((p) => this.buildProblemView(tripId, p.problemId, tripVersion)),
      ),
    );

    let v15RecordMirror;
    if (decisionRef) {
      const persisted = await this.v15Projector?.getProjectedRecord(
        tripId,
        decisionRef.decisionId,
      );
      if (persisted) {
        v15RecordMirror = persisted;
      } else {
        const record = await this.ledgerStore.getDecision(tripId, decisionRef.decisionId);
        if (record) v15RecordMirror = bridgeRfc001RecordToV15Mirror(record, tripId);
      }
    }

    const routing = await this.routingService?.getTripRouting(tripId);

    return {
      schemaId: 'tripnara.rfc001_decision_center@v1',
      tripId,
      generatedAt: new Date().toISOString(),
      effectivePlanVersionId: planBlock.effectivePlanVersionId,
      decisionRef,
      problems: problemViews,
      latestRun,
      v15RecordMirror,
      routing,
    };
  }

  async getProblemView(
    tripId: string,
    problemId: string,
  ): Promise<Rfc001DecisionCenterProblemView> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, updatedAt: true },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    const tripVersion = revisionToString(resolveTripRevision(trip));
    return this.buildProblemView(tripId, problemId, tripVersion);
  }

  private async buildProblemView(
    tripId: string,
    problemId: string,
    tripVersion: string,
  ): Promise<Rfc001DecisionCenterProblemView> {
    const problem = await this.problemStore.get(tripId, problemId);
    if (!problem) {
      throw new NotFoundException(`RFC-001 problem ${problemId} not found`);
    }

    const workspace = await this.workspaceService.getByProblemId(tripId, problemId);
    const records = await this.ledgerStore.listDecisions(tripId);
    const record = records
      .filter((r) => r.problemId === problemId)
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))[0];

    const planVersion = record
      ? await this.planVersionStore.findBySourceDecision(tripId, record.decisionId)
      : undefined;

    const worldStore = await this.worldStateStore.readStore(tripId);
    const event = worldStore.events.find((e) => e.eventId === problem.triggerEventId);
    const snapshot = worldStore.snapshots.find(
      (s) => s.snapshotId === problem.worldStateSnapshotId,
    );
    const assertion = worldStore.assertions.find(
      (a) =>
        snapshot?.assertionIds.includes(a.assertionId) &&
        a.predicate === 'road.status',
    );

    const utilityByCandidate: Record<string, number> = {};
    if (record?.utilityEvaluation) {
      for (const u of record.utilityEvaluation) {
        utilityByCandidate[u.candidateId] = u.utility;
      }
    }

    const runs = await this.ledgerStore.listRuns(tripId);
    const run = runs.find((r) => r.problemId === problemId);

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true, destination: true },
    });

    let traversabilitySnapshot: RoadTraversabilityWorkspaceSnapshot | undefined =
      workspace?.roadTraversability;
    const roadEvent = event as RoadStatusChangedEvent | undefined;
    if (
      !traversabilitySnapshot &&
      assertion &&
      roadEvent?.payload?.roadId
    ) {
      const assessment = buildTraversabilityAssessmentForRoad(
        tripId,
        roadEvent.payload.roadId,
        assertion as WorldStateAssertion<RoadStatusAssertionPayload>,
        (tripRow?.metadata ?? {}) as Record<string, unknown>,
        tripRow?.destination,
        { worldAssertions: worldStore.assertions },
      );
      if (assessment) {
        const bundle = loadRoadSegmentProfilesForCountry(tripRow?.destination ?? 'IS');
        const profile = bundle
          ? resolveRoadSegmentProfile(roadEvent.payload.roadId, bundle)
          : null;
        traversabilitySnapshot = {
          roadId: roadEvent.payload.roadId.toUpperCase(),
          segmentId: profile?.segmentId,
          assessment,
          assessorVersion: ROAD_TRAVERSABILITY_ASSESSOR_VERSION,
          evaluatedAt: new Date().toISOString(),
        };
      }
    }

    const partialView = {
      schemaId: 'tripnara.rfc001_problem_view@v1' as const,
      tripId,
      problemId,
      problemSummary: bridgeRfc001ProblemToDecisionProblemSummary(problem, tripVersion),
      rfc001Problem: problem,
      leadingPersona: resolveLeadingPersona(problem),
      requiresUserConfirmation:
        (record?.authorizationRequirement.requiresUserConfirmation ?? true) &&
        (record ? isActionablePendingRecord(record) : true),
      candidates: workspace
        ? buildCandidateViews(workspace, utilityByCandidate)
        : [],
      workspace,
      record,
      planVersion,
      options: workspace
        ? bridgeCandidatesToOptions(
            problemId,
            workspace.repairCandidates,
            workspace,
            record,
            {
              problem,
              executionSlipContext: await resolveExecutionSlipOptionContext(this.prisma, {
                tripId,
                problem,
                triggerEvent: event,
                repairCandidates: workspace.repairCandidates,
                tripMetadata: tripRow?.metadata,
              }),
            },
          )
        : [],
      lineage: buildDecisionLineage({
        triggerEventId: problem.triggerEventId,
        snapshotId: problem.worldStateSnapshotId,
        assertionId: assertion?.assertionId,
        traversability: traversabilitySnapshot,
        problem,
        workspace,
        record,
        planVersion,
        run,
      }),
    };

    const impactScopeView = await buildImpactScopeViewForProblem(this.prisma, partialView, {
      triggerEvent: event,
      traversability: traversabilitySnapshot,
    });

    return {
      ...partialView,
      impactScopeView,
    };
  }
}
