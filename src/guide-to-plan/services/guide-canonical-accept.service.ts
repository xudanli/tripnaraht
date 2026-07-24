/**
 * Guide accept → DecisionCore.finalize (persist) → authorize → execute.
 * Effective Plan writes only via Rfc001PlanVersionApplyExecutor.
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FullPlanSelectionService } from '../../decision-runtime/core/full-plan-selection.service';
import { buildFullPlanDecisionWorkspace } from '../../decision-runtime/core/build-full-plan-workspace.util';
import { isGuideCanonicalAcceptExecuteEnabled } from '../../decision-runtime/constraints/constraint-evaluation.config';
import { Rfc001DecisionFinalizeService } from '../../trips/guardian-decision-core/execution/rfc001-decision-finalize.service';
import { Rfc001AuthorizationService } from '../../trips/guardian-decision-core/authorization/authorization.service';
import { Rfc001PlanVersionApplyExecutor } from '../../trips/guardian-decision-core/execution/plan-version-apply.executor';
import { DecisionWorkspaceService } from '../../trips/guardian-decision-core/workspace/decision-workspace.service';
import { Rfc001DecisionProblemStoreService } from '../../trips/guardian-decision-core/persistence/rfc001-decision-problem.store';
import { isRfc001ShadowMode } from '../../trips/guardian-decision-core/config/rfc001-iceland.config';
import { WorldStateSnapshotService } from '../../decision-runtime/snapshot/world-state-snapshot.service';
import type { GuidePlanVariant } from '../constants/guide-to-plan-status.constants';
import type { GuideItineraryDraft } from './guide-plan-builder.service';
import type { GuideTravelContext, GuideUnderstandingSummary } from '../types/guide-to-plan.types';
import { GuideTripMaterializerService } from './guide-trip-materializer.service';
import { mapGuideVariantsToDecisionCandidates } from '../adapters/guide-draft-candidate.adapter';
import { buildGuideTripWorldState } from '../utils/guide-world-state.util';
import { buildGuidePlanSelectionProblem } from '../utils/build-guide-accept-problem.util';
import { readPlanCandidateMeta } from '../utils/guide-plan-candidate-meta.util';
import { tripPlanToMaterializeOperations } from '../../decision-runtime/core/trip-plan-to-materialize-operations.util';
import { enrichItineraryDraftAccommodation } from '../utils/guide-itinerary-accommodation.util';
import { loadGuideHotelCandidateRefs } from '../utils/guide-hotel-candidate-refs.util';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { DecisionTriggerGatewayService } from '../../decision-runtime/trigger/decision-trigger.gateway.service';
import { isDecisionTriggerGatewayEnabled } from '../../decision-runtime/trigger/decision-trigger.config';
import { AttractionExploreSeedService } from '../../trips/attraction-explore/services/attraction-explore-seed.service';

export interface GuideCanonicalAcceptInput {
  userId: string;
  sessionId: string;
  planCandidateId: string;
  variant: GuidePlanVariant;
  itineraryDraft: GuideItineraryDraft;
  travelContext: GuideTravelContext;
  countryCode: string;
  destination?: string | null;
}

export interface GuideCanonicalAcceptResult {
  tripId: string;
  itemCount: number;
  decisionId: string;
  effectivePlanVersionId?: string;
  canonicalExecuted: true;
}

@Injectable()
export class GuideCanonicalAcceptService {
  private readonly logger = new Logger(GuideCanonicalAcceptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: GuideTripMaterializerService,
    private readonly fullPlanSelection: FullPlanSelectionService,
    private readonly workspaceService: DecisionWorkspaceService,
    private readonly problemStore: Rfc001DecisionProblemStoreService,
    private readonly finalizeService: Rfc001DecisionFinalizeService,
    private readonly authorization: Rfc001AuthorizationService,
    private readonly executor: Rfc001PlanVersionApplyExecutor,
    private readonly worldStateSnapshot: WorldStateSnapshotService,
    @Optional() private readonly triggerGateway?: DecisionTriggerGatewayService,
    @Optional() private readonly attractionExploreSeed?: AttractionExploreSeedService,
  ) {}

  isEnabled(): boolean {
    return isGuideCanonicalAcceptExecuteEnabled();
  }

  async acceptAndExecute(input: GuideCanonicalAcceptInput): Promise<GuideCanonicalAcceptResult | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const sessionCandidates = await this.prisma.guidePlanCandidate.findMany({
      where: { sessionId: input.sessionId, status: 'draft' },
      orderBy: { createdAt: 'asc' },
    });
    if (sessionCandidates.length === 0) {
      return null;
    }

    const acceptedRow = sessionCandidates.find((c) => c.id === input.planCandidateId);
    if (!acceptedRow) {
      throw new NotFoundException(`Plan candidate ${input.planCandidateId} not found`);
    }

    const acceptedMeta = readPlanCandidateMeta(acceptedRow.personaOpinions);
    if (!acceptedMeta.finalized) {
      this.logger.debug(
        `Guide canonical accept skipped: candidate ${input.planCandidateId} not finalized`,
      );
      return null;
    }

    if (isRfc001ShadowMode()) {
      this.logger.warn('Guide canonical accept skipped: RFC001_SHADOW_MODE=1');
      return null;
    }

    const hotelCandidates = await loadGuideHotelCandidateRefs(this.prisma, input.sessionId);
    const destinationHint = input.destination ?? input.travelContext.destination;
    const enrichDraft = (draft: GuideItineraryDraft) =>
      enrichItineraryDraftAccommodation(draft, hotelCandidates, destinationHint);

    const enrichedAcceptedDraft = enrichDraft(input.itineraryDraft);

    const { tripId } = await this.materializer.materializeShell({
      userId: input.userId,
      sessionId: input.sessionId,
      itineraryDraft: enrichedAcceptedDraft,
      travelContext: input.travelContext,
      countryCode: input.countryCode,
      destination: input.destination,
      planCandidateId: input.planCandidateId,
    });

    if (this.attractionExploreSeed) {
      await this.attractionExploreSeed
        .seedFromGuideAccept({
          tripId,
          itineraryDraft: enrichedAcceptedDraft,
          sessionId: input.sessionId,
          planCandidateId: input.planCandidateId,
        })
        .catch((err) =>
          this.logger.warn(
            `Attraction explore seed from guide accept failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    const variants = sessionCandidates.map((row) => ({
      variant: row.variant as GuidePlanVariant,
      itineraryDraft: enrichDraft(row.itineraryDraft as unknown as GuideItineraryDraft),
    }));

    const referenceDraft =
      variants.find((v) => v.variant === 'balanced')?.itineraryDraft ?? enrichedAcceptedDraft;

    const worldState = buildGuideTripWorldState({
      countryCode: input.countryCode,
      travelContext: input.travelContext,
      draft: referenceDraft,
      sessionId: input.sessionId,
    });

    const travelModeDefault =
      input.travelContext.transportMode === 'self_drive' ? 'drive' : 'walk';

    const candidates = mapGuideVariantsToDecisionCandidates({
      variants,
      sessionId: input.sessionId,
      travelModeDefault,
    });

    const problemId = `guide_accept_${input.sessionId}_${Date.now()}`;
    const basePlanVersionId = `plan_${tripId}_draft`;

    const guidePlanningContext = {
      tripId,
      basePlanVersionId,
      worldStateSnapshotId: `guide_ws_${input.sessionId}`,
      preferenceSnapshotId: `guide_pref_${input.sessionId}`,
      materializeFromTripPlan: true as const,
    };

    const { snapshotId } = await this.worldStateSnapshot.capture({
      tripId,
      worldState,
      snapshotId: guidePlanningContext.worldStateSnapshotId,
      plan: candidates.find((c) => c.candidateId === input.variant)?.plan,
      persist: true,
    });
    guidePlanningContext.worldStateSnapshotId = snapshotId;

    const evaluated =
      isDecisionTriggerGatewayEnabled() && this.triggerGateway
        ? await this.evaluateViaTriggerGateway({
            tripId,
            sessionId: input.sessionId,
            problemId,
            worldState,
            guidePlanningContext,
            candidates,
            planCandidateId: input.planCandidateId,
            variant: input.variant,
          })
        : await this.fullPlanSelection.evaluatePrebuiltCandidates({
            worldState,
            context: guidePlanningContext,
            candidates,
            problemId,
          });

    const { workspace } = buildFullPlanDecisionWorkspace({
      problemId: evaluated.problemId,
      context: guidePlanningContext,
      candidates: evaluated.candidates,
      constraintReportsByCandidateId: evaluated.constraintReports,
    });

    await this.workspaceService.save(tripId, workspace);

    const problem = buildGuidePlanSelectionProblem({
      problemId: evaluated.problemId,
      tripId,
      planVersionId: basePlanVersionId,
      worldStateSnapshotId: workspace.worldStateSnapshotId,
      sessionId: input.sessionId,
    });
    await this.problemStore.upsert(tripId, problem);

    const finalized = await this.finalizeService.finalizeWorkspace(tripId, workspace, problem);

    const choice = input.variant;
    await this.authorization.authorize({
      tripId,
      decisionId: finalized.record.decisionId,
      choice,
    });

    const executed = await this.executor.execute({
      tripId,
      decisionId: finalized.record.decisionId,
    });

    const acceptedPlan = evaluated.candidates.find((c) => c.candidateId === choice)?.plan;
    const itemCount = acceptedPlan
      ? tripPlanToMaterializeOperations({ plan: acceptedPlan, tripId }).length
      : 0;

    await this.persistAcceptDecision({
      sessionId: input.sessionId,
      tripId,
      variant: choice,
      problemId: evaluated.problemId,
      decisionId: finalized.record.decisionId,
      effectivePlanVersionId: executed.planVersion.planVersionId,
      itemCount,
    });

    this.logger.log(
      `[GuideCanonicalAccept] session=${input.sessionId} trip=${tripId} decision=${finalized.record.decisionId} variant=${choice} items=${itemCount}`,
    );

    return {
      tripId,
      itemCount,
      decisionId: finalized.record.decisionId,
      effectivePlanVersionId: executed.planVersion.planVersionId,
      canonicalExecuted: true,
    };
  }

  private async evaluateViaTriggerGateway(input: {
    tripId: string;
    sessionId: string;
    problemId: string;
    worldState: ReturnType<typeof buildGuideTripWorldState>;
    guidePlanningContext: {
      tripId: string;
      basePlanVersionId: string;
      worldStateSnapshotId: string;
      preferenceSnapshotId: string;
      materializeFromTripPlan: true;
    };
    candidates: ReturnType<typeof mapGuideVariantsToDecisionCandidates>;
    planCandidateId: string;
    variant: GuidePlanVariant;
  }) {
    this.triggerGateway!.buildRunRequest({
      kind: 'GUIDE_IMPORT_REQUEST',
      tripId: input.tripId,
      source: 'GUIDE_TO_PLAN',
      requestId: input.problemId,
      metadata: {
        phase: 'accept_execute',
        sessionId: input.sessionId,
        planCandidateId: input.planCandidateId,
        variant: input.variant,
      },
    });

    const dispatch = await this.triggerGateway!.dispatch({
      kind: 'GUIDE_IMPORT_REQUEST',
      tripId: input.tripId,
      source: 'GUIDE_TO_PLAN',
      requestId: `${input.problemId}_evaluate`,
      fullPlanSelection: {
        worldState: input.worldState,
        context: input.guidePlanningContext,
        prebuiltCandidates: input.candidates,
        problemId: input.problemId,
        operation: 'evaluate_only',
      },
      metadata: {
        phase: 'accept_evaluate',
        sessionId: input.sessionId,
      },
    });

    if (dispatch.status !== 'COMPLETED' || !dispatch.result) {
      throw new Error(dispatch.error?.message ?? 'Guide accept evaluate dispatch failed');
    }

    return dispatch.result as Awaited<
      ReturnType<FullPlanSelectionService['evaluatePrebuiltCandidates']>
    >;
  }

  private async persistAcceptDecision(input: {
    sessionId: string;
    tripId: string;
    variant: GuidePlanVariant;
    problemId: string;
    decisionId: string;
    effectivePlanVersionId: string;
    itemCount: number;
  }): Promise<void> {
    const session = await this.prisma.guideToPlanSession.findUnique({
      where: { id: input.sessionId },
      select: { understandingSummary: true },
    });
    const existingSummary =
      (session?.understandingSummary as unknown as GuideUnderstandingSummary | null) ?? null;

    await this.prisma.guideToPlanSession.update({
      where: { id: input.sessionId },
      data: {
        understandingSummary: {
          ...(existingSummary ?? {
            guideCount: 0,
            placeCount: 0,
            restaurantCount: 0,
            hotelAreaCount: 0,
            tipCount: 0,
            riskCount: 0,
            unmatchedPlaceCount: 0,
            potentialIssues: [],
          }),
          canonicalDecision: {
            decisionId: input.decisionId,
            problemId: input.problemId,
            recommendedVariant: input.variant,
            humanDecisionRequired: false,
            finalizedAt: new Date().toISOString(),
            acceptedTripId: input.tripId,
            effectivePlanVersionId: input.effectivePlanVersionId,
            itemCount: input.itemCount,
          },
        } as object,
      },
    });

    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true },
    });
    const tripMeta = { ...((trip?.metadata ?? {}) as Record<string, unknown>) };
    await this.prisma.trip.update({
      where: { id: input.tripId },
      data: {
        metadata: toInputJsonValue({
          ...tripMeta,
          guideToPlanSessionId: input.sessionId,
          guideCanonicalDecisionId: input.decisionId,
          guideCanonicalEffectivePlanVersionId: input.effectivePlanVersionId,
          guideCanonicalAcceptedVariant: input.variant,
        }),
      },
    });
  }
}
