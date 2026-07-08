import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GUIDE_PARSE_STATUS,
  GUIDE_PARSE_PIPELINE_STEP,
  GUIDE_PLAN_CANDIDATE_STATUS,
  GUIDE_PLAN_VARIANT,
  GUIDE_TO_PLAN_SESSION_STATUS,
  POI_MATCH_STATUS,
} from '../constants/guide-to-plan-status.constants';
import type {
  ConfirmGuideTravelContextDto,
  GenerateGuidePlanDto,
  BindGuidePlaceDto,
  RematchGuidePlacesDto,
} from '../dto/guide-to-plan.dto';
import { GuideToPlanSessionService } from '../guide-to-plan-session.service';
import { GuideParseService } from './guide-parse.service';
import { GuidePoiMatchService } from './guide-poi-match.service';
import { GuidePlanBuilderService } from './guide-plan-builder.service';
import { GuideTripMaterializerService } from './guide-trip-materializer.service';
import { GuideCrossGuideMergeService } from './guide-cross-guide-merge.service';
import { GuideDecisionBridgeService } from './guide-decision-bridge.service';
import { GuideCanonicalSelectionService } from './guide-canonical-selection.service';
import { GuideCanonicalAcceptService } from './guide-canonical-accept.service';
import { GuidePoiGeoService } from './guide-poi-geo.service';
import { GuideRouteConstraintGateway } from './route-constraint/guide-route-constraint.gateway.service';
import type {
  GuideParseProgressView,
  GuidePlanCandidateDetailView,
  GuidePlanCandidatePersonaOpinions,
  GuidePlanReviewItem,
  GuideTravelContext,
  GuideUnderstandingSummary,
  GuideUnderstandingView,
  GuideInspirationCandidateView,
} from '../types/guide-to-plan.types';
import { extractRecognizedTags } from '../utils/guide-parse-tags.util';
import { computeGuideFeasibilityScore } from '../utils/guide-feasibility.util';
import { buildPendingConfirmations } from '../utils/guide-pending-confirmations.util';
import {
  flattenItineraryForReview,
  filterItineraryDraftByReviewKeys,
} from '../utils/guide-plan-review.util';
import { mergeTravelContext } from '../utils/guide-session.util';
import { countUnmatchedPoiCandidates, POI_MATCHABLE_CANDIDATE_TYPES } from '../utils/guide-unmatched-places.util';
import {
  buildPersonaOpinions,
  readPlanCandidateMeta,
} from '../utils/guide-plan-candidate-meta.util';
import {
  enrichItineraryDraftAccommodation,
  type GuideHotelCandidateRef,
} from '../utils/guide-itinerary-accommodation.util';
import { loadGuideHotelCandidateRefs } from '../utils/guide-hotel-candidate-refs.util';
import type { GuideItineraryDraft } from './guide-plan-builder.service';

/**
 * Guide-to-Plan 主编排器：导入 → 解析 → 理解摘要 → 草案生成 → 接受落地。
 */
@Injectable()
export class GuideToPlanOrchestrator {
  private readonly logger = new Logger(GuideToPlanOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: GuideToPlanSessionService,
    private readonly parseService: GuideParseService,
    private readonly poiMatch: GuidePoiMatchService,
    private readonly planBuilder: GuidePlanBuilderService,
    private readonly materializer: GuideTripMaterializerService,
    private readonly crossGuideMerge: GuideCrossGuideMergeService,
    @Optional() private readonly decisionBridge?: GuideDecisionBridgeService,
    @Optional() private readonly canonicalSelection?: GuideCanonicalSelectionService,
    @Optional() private readonly canonicalAccept?: GuideCanonicalAcceptService,
    @Optional() private readonly poiGeo?: GuidePoiGeoService,
    @Optional() private readonly routeConstraintGateway?: GuideRouteConstraintGateway,
  ) {}

  async buildUnderstanding(userId: string, sessionId: string): Promise<GuideUnderstandingView> {
    await this.runParsePipelineWithProgress(userId, sessionId);
    return this.getUnderstandingView(userId, sessionId);
  }

  /**
   * 异步/同步解析管线，按 UI 五步推送进度。
   */
  async runParsePipelineWithProgress(
    userId: string,
    sessionId: string,
    onProgress?: (update: Partial<GuideParseProgressView>) => Promise<void>,
  ): Promise<void> {
    const emit = onProgress ?? (async () => {});

    const session = await this.sessionService.requireSession(userId, sessionId, {
      importedGuides: true,
    });
    this.sessionService.requireCanParse(session, '解析攻略');
    const importedGuides = session.importedGuides ?? [];
    if (importedGuides.length === 0) {
      throw new BadRequestException('请先导入至少一篇攻略');
    }
    const countryCode =
      session.countryCode ??
      (session.travelContext as { countryCode?: string } | null)?.countryCode;

    await emit({
      currentStep: GUIDE_PARSE_PIPELINE_STEP.CONTENT_ANALYSIS,
      estimatedSecondsRemaining: Math.max(15, importedGuides.length * 12),
    });

    const pendingGuides = await this.prisma.importedGuide.findMany({
      where: {
        sessionId,
        parseStatus: { in: [GUIDE_PARSE_STATUS.PENDING, GUIDE_PARSE_STATUS.FAILED] },
      },
    });

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.PARSING },
    });

    await emit({ currentStep: GUIDE_PARSE_PIPELINE_STEP.PLACE_EXTRACTION });

    for (const guide of pendingGuides) {
      await this.prisma.guideClaim.deleteMany({ where: { guideId: guide.id } });
      await this.prisma.guideInspirationCandidate.deleteMany({
        where: { sessionId, sourceGuideIds: { has: guide.id } },
      });
      await this.parseService.parseGuide(guide.id, countryCode ?? session.countryCode);
      await emit({ counts: await this.countProgress(sessionId) });
    }

    await emit({ currentStep: GUIDE_PARSE_PIPELINE_STEP.ROUTE_IDENTIFICATION });

    if (countryCode ?? session.countryCode) {
      await this.poiMatch.rematchSession(sessionId, (countryCode ?? session.countryCode)!);
    }

    await this.crossGuideMerge.mergeSession(sessionId);

    const [candidates, claims] = await Promise.all([
      this.prisma.guideInspirationCandidate.findMany({ where: { sessionId } }),
      this.prisma.guideClaim.findMany({ where: { sessionId }, take: 50 }),
    ]);

    const combinedText = [
      session.themeNarrative ?? '',
      ...claims.map((c) => c.statement),
    ].join('\n');
    const recognizedTags = extractRecognizedTags(combinedText);

    await emit({
      currentStep: GUIDE_PARSE_PIPELINE_STEP.FACT_VERIFICATION,
      counts: this.buildCountsFromRows(candidates, claims),
      recognizedTags,
      estimatedSecondsRemaining: 8,
    });

    const summary = this.buildSummary(candidates, claims, importedGuides.length);
    summary.suggestedTripDays =
      this.inferSuggestedTripDays(importedGuides) ?? summary.suggestedTripDays;
    const themeNarrative =
      session.themeNarrative ??
      (summary.placeCount > 0
        ? `已从 ${importedGuides.length} 篇攻略中整理出 ${summary.placeCount} 个地点线索`
        : null);

    await emit({ currentStep: GUIDE_PARSE_PIPELINE_STEP.DRAFT_GENERATION, estimatedSecondsRemaining: 2 });

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: {
        status: GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT,
        understandingSummary: summary as object,
        themeNarrative,
      },
    });
  }

  private async countProgress(sessionId: string) {
    const [candidates, claims] = await Promise.all([
      this.prisma.guideInspirationCandidate.findMany({ where: { sessionId } }),
      this.prisma.guideClaim.findMany({ where: { sessionId }, take: 50 }),
    ]);
    return this.buildCountsFromRows(candidates, claims);
  }

  private buildCountsFromRows(
    candidates: Array<{ candidateType: string }>,
    claims: Array<{ claimType: string; statement: string }>,
  ) {
    return {
      places: candidates.filter((c) => c.candidateType === 'poi').length,
      restaurants: candidates.filter((c) => c.candidateType === 'restaurant').length,
      hotels: candidates.filter((c) => c.candidateType === 'hotel').length,
      tips: claims.filter((c) => c.claimType === 'experience_tip').length,
      risks: claims.filter((c) => /不建议|风险|关闭|预约/i.test(c.statement)).length,
    };
  }

  private async runParsePipeline(userId: string, sessionId: string) {
    await this.runParsePipelineWithProgress(userId, sessionId);
  }

  async confirmTravelContext(
    userId: string,
    sessionId: string,
    dto: ConfirmGuideTravelContextDto,
  ) {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireMutable(session, '更新出行条件');

    const existing = session.travelContext as GuideTravelContext | null;
    const travelContext = mergeTravelContext(existing, dto);

    if (travelContext.startDate && travelContext.endDate) {
      if (travelContext.endDate < travelContext.startDate) {
        throw new BadRequestException('结束日期不能早于开始日期');
      }
    }

    const prevCountryCode = session.countryCode?.toUpperCase() ?? null;
    const nextCountryCode = (
      dto.countryCode ?? session.countryCode ?? undefined
    )?.toUpperCase();

    const updated = await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: {
        travelContext: travelContext as object,
        countryCode: nextCountryCode,
        destination: dto.destination ?? session.destination ?? undefined,
        status: GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT,
      },
    });

    if (nextCountryCode && nextCountryCode !== prevCountryCode) {
      await this.poiMatch.rematchSession(sessionId, nextCountryCode);
      await this.afterPoiMatchUpdates(sessionId);
    }

    return updated;
  }

  async rematchSessionPlaces(
    userId: string,
    sessionId: string,
    dto: RematchGuidePlacesDto = {},
  ) {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireMutable(session, '重新匹配 POI');

    const travelContext = session.travelContext as GuideTravelContext | null;
    const countryCode = (
      dto.countryCode ??
      session.countryCode ??
      travelContext?.countryCode ??
      undefined
    )?.toUpperCase();

    if (!countryCode) {
      throw new BadRequestException('请先设置国家代码（countryCode）后再重新匹配 POI');
    }

    const rematch = await this.poiMatch.rematchSession(sessionId, countryCode);
    const summary = await this.afterPoiMatchUpdates(sessionId);

    return {
      sessionId,
      ...rematch,
      countryCode,
      summary: {
        unmatchedPlaceCount: summary.unmatchedPlaceCount,
        potentialIssues: summary.potentialIssues,
      },
    };
  }

  async bindSessionPlace(
    userId: string,
    sessionId: string,
    candidateId: string,
    dto: BindGuidePlaceDto,
  ) {
    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireMutable(session, '手动绑定 POI');

    if (dto.matchStatus === 'rejected') {
      if (dto.placeId != null) {
        throw new BadRequestException('拒绝匹配时不可同时传入 placeId');
      }
      const result = await this.poiMatch.rejectCandidate(sessionId, candidateId);
      const summary = await this.refreshUnderstandingSummary(sessionId);
      return {
        sessionId,
        place: await this.loadPlaceCandidateView(candidateId),
        bind: result,
        summary: {
          unmatchedPlaceCount: summary.unmatchedPlaceCount,
          potentialIssues: summary.potentialIssues,
        },
      };
    }

    if (dto.placeId == null) {
      throw new BadRequestException('请传入 placeId 或 matchStatus=rejected');
    }

    const travelContext = session.travelContext as GuideTravelContext | null;
    const countryCode = session.countryCode ?? travelContext?.countryCode ?? undefined;
    const result = await this.poiMatch.bindCandidateToPlace(
      sessionId,
      candidateId,
      dto.placeId,
      countryCode,
    );
    const summary = await this.refreshUnderstandingSummary(sessionId);

    return {
      sessionId,
      place: await this.loadPlaceCandidateView(candidateId),
      bind: result,
      summary: {
        unmatchedPlaceCount: summary.unmatchedPlaceCount,
        potentialIssues: summary.potentialIssues,
      },
    };
  }

  private async afterPoiMatchUpdates(sessionId: string): Promise<GuideUnderstandingSummary> {
    await this.crossGuideMerge.mergeSession(sessionId);
    return this.refreshUnderstandingSummary(sessionId);
  }

  private async refreshUnderstandingSummary(sessionId: string): Promise<GuideUnderstandingSummary> {
    const [session, candidates, claims] = await Promise.all([
      this.prisma.guideToPlanSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { importedGuides: true },
      }),
      this.prisma.guideInspirationCandidate.findMany({ where: { sessionId } }),
      this.prisma.guideClaim.findMany({ where: { sessionId }, take: 50 }),
    ]);

    const summary = this.buildSummary(
      candidates,
      claims,
      session.importedGuides.length,
    );
    summary.suggestedTripDays =
      this.inferSuggestedTripDays(session.importedGuides) ?? summary.suggestedTripDays;

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { understandingSummary: summary as object },
    });

    return summary;
  }

  private async loadPlaceCandidateView(candidateId: string): Promise<GuideInspirationCandidateView> {
    const c = await this.prisma.guideInspirationCandidate.findUniqueOrThrow({
      where: { id: candidateId },
    });
    return {
      id: c.id,
      candidateType: c.candidateType as GuideInspirationCandidateView['candidateType'],
      rawName: c.rawName,
      rawNameEn: c.rawNameEn,
      placeId: c.placeId,
      matchStatus: c.matchStatus as GuideInspirationCandidateView['matchStatus'],
      credibilityLevel: c.credibilityLevel as GuideInspirationCandidateView['credibilityLevel'],
      suggestedDay: c.suggestedDay,
      routeOrder: c.routeOrder,
      sourceGuideIds: c.sourceGuideIds,
      geo: this.poiGeo?.parseCandidateGeo(c.metadata) ?? null,
      geoResolutionStatus:
        (c.metadata as { geoResolutionStatus?: string } | null)?.geoResolutionStatus ?? undefined,
    };
  }

  async generatePlanCandidates(
    userId: string,
    sessionId: string,
    dto: GenerateGuidePlanDto,
  ) {
    const session = await this.sessionService.requireSession(userId, sessionId, {
      importedGuides: true,
    });
    this.sessionService.requireCanGenerate(session, '生成草案');
    const importedGuides = session.importedGuides ?? [];

    const parsedGuideCount = importedGuides.filter(
      (g) => g.parseStatus === GUIDE_PARSE_STATUS.PARSED,
    ).length;
    if (parsedGuideCount === 0) {
      throw new BadRequestException('请先完成攻略解析后再生成草案');
    }

    const inspirationCount = await this.prisma.guideInspirationCandidate.count({
      where: { sessionId },
    });
    if (inspirationCount === 0) {
      throw new BadRequestException('解析结果为空，请补充攻略内容或重新解析');
    }

    const travelContext = session.travelContext as GuideTravelContext | null;

    const pending = this.buildPendingConfirmationsForSession(travelContext, session);
    const missingRequired = pending.filter((p) => p.required);
    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `生成草案前请先完善出行条件：${missingRequired.map((p) => p.label).join('、')}`,
      );
    }

    const variants = dto.variants?.length
      ? dto.variants
      : [dto.variant ?? GUIDE_PLAN_VARIANT.BALANCED];

    const rollbackStatus =
      session.status === GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY
        ? GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY
        : GUIDE_TO_PLAN_SESSION_STATUS.AWAITING_CONTEXT;

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.GENERATING },
    });

    try {
      await this.prisma.guidePlanCandidate.deleteMany({
        where: { sessionId, status: GUIDE_PLAN_CANDIDATE_STATUS.DRAFT },
      });

      const guideIds = importedGuides.map((g) => g.id);
      const suggestedTripDays = this.inferSuggestedTripDays(importedGuides);
      const [unmatchedPlaceCount, placeCount, hotelCandidates] = await Promise.all([
        this.prisma.guideInspirationCandidate.count({
          where: {
            sessionId,
            candidateType: { in: [...POI_MATCHABLE_CANDIDATE_TYPES] },
            matchStatus: POI_MATCH_STATUS.UNMATCHED,
          },
        }),
        this.prisma.guideInspirationCandidate.count({
          where: { sessionId, candidateType: 'poi' },
        }),
        this.loadHotelCandidateRefs(sessionId),
      ]);
      const results: GuidePlanCandidateDetailView[] = [];
      const countryCode =
        travelContext?.countryCode ?? session.countryCode ?? session.destination?.slice(0, 2);
      const builtVariants: Array<{
        variant: (typeof variants)[number];
        built: Awaited<ReturnType<GuidePlanBuilderService['build']>>;
      }> = [];

      for (const variant of variants) {
        const built = await this.planBuilder.build({
          sessionId,
          variant,
          travelContext,
          themeNarrative: session.themeNarrative,
          suggestedTripDays,
        });
        builtVariants.push({ variant, built });
      }

      const useCanonicalFinalize =
        Boolean(countryCode && this.canonicalSelection?.isEnabled());
      const canonicalResult = useCanonicalFinalize
        ? await this.canonicalSelection!.finalizeGuideVariants({
            sessionId,
            countryCode: countryCode!.toUpperCase().slice(0, 2),
            travelContext,
            variants: builtVariants.map(({ variant, built }) => ({
              variant,
              itineraryDraft: built.itineraryDraft,
            })),
          })
        : null;

      for (const { variant, built } of builtVariants) {
        let decisionEngineStatus: GuidePlanCandidateDetailView['decisionEngineStatus'] =
          'unavailable';
        let personaOpinions: GuidePlanCandidatePersonaOpinions | null = null;
        const draftWithWarnings = { ...built.itineraryDraft };

        if (canonicalResult) {
          decisionEngineStatus = 'finalized';
          const variantWarnings = canonicalResult.warningsByVariant[variant] ?? [];
          draftWithWarnings.warnings = [
            ...draftWithWarnings.warnings,
            ...variantWarnings,
          ];
          const report = canonicalResult.selection.constraintReports[variant];
          personaOpinions = buildPersonaOpinions({
            decisionEngineStatus: 'finalized',
            canonical: {
              finalized: true,
              recommended: canonicalResult.recommendedVariant === variant,
              decisionId: canonicalResult.selection.record.decisionId,
              overallStatus: report?.overallStatus,
            },
          });
        } else if (countryCode && this.decisionBridge) {
          const enhanced = await this.decisionBridge.enhanceDraft({
            countryCode: countryCode.toUpperCase().slice(0, 2),
            travelContext,
            itineraryDraft: built.itineraryDraft,
          });
          decisionEngineStatus = enhanced.engineApplied
            ? 'applied'
            : enhanced.engineAvailable
              ? 'skipped'
              : 'unavailable';
          if (enhanced.additionalWarnings.length > 0) {
            draftWithWarnings.warnings = [
              ...draftWithWarnings.warnings,
              ...enhanced.additionalWarnings,
            ];
          }
          personaOpinions = buildPersonaOpinions({ decisionEngineStatus });
        }

        const candidate = await this.prisma.guidePlanCandidate.create({
          data: {
            sessionId,
            variant,
            status: GUIDE_PLAN_CANDIDATE_STATUS.DRAFT,
            sourceGuideIds: guideIds,
            retainedItems: built.retainedItems as object[],
            modifiedItems: built.modifiedItems as object[],
            rejectedItems: built.rejectedItems as object[],
            decisionReasons: built.decisionReasons as object[],
            comparisonDiff: built.comparisonDiff as object[],
            itineraryDraft: draftWithWarnings as object,
            personaOpinions: personaOpinions ? (personaOpinions as object) : undefined,
          },
        });

        results.push(
          this.enrichPlanCandidateDetail(
            candidate,
            travelContext,
            session,
            unmatchedPlaceCount,
            placeCount,
            hotelCandidates,
          ),
        );
      }

      if (canonicalResult) {
        const existingSummary =
          (session.understandingSummary as unknown as GuideUnderstandingSummary | null) ?? null;
        await this.prisma.guideToPlanSession.update({
          where: { id: sessionId },
          data: {
            understandingSummary: {
              ...(existingSummary ?? {
                guideCount: parsedGuideCount,
                placeCount,
                restaurantCount: 0,
                hotelAreaCount: 0,
                tipCount: 0,
                riskCount: 0,
                unmatchedPlaceCount,
                potentialIssues: [],
              }),
              canonicalDecision: {
                decisionId: canonicalResult.selection.record.decisionId,
                problemId: canonicalResult.selection.problemId,
                recommendedVariant: canonicalResult.recommendedVariant,
                humanDecisionRequired: canonicalResult.selection.humanDecisionRequired,
                finalizedAt: new Date().toISOString(),
              },
            } as object,
          },
        });
      }

      await this.prisma.guideToPlanSession.update({
        where: { id: sessionId },
        data: { status: GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY },
      });

      this.logger.log(`Generated ${results.length} plan candidate(s) for session ${sessionId}`);
      return results;
    } catch (err) {
      await this.prisma.guideToPlanSession.update({
        where: { id: sessionId },
        data: { status: rollbackStatus },
      });
      throw err;
    }
  }

  async listPlanCandidates(userId: string, sessionId: string) {
    const session = await this.sessionService.requireSession(userId, sessionId);
    const rows = await this.prisma.guidePlanCandidate.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    const [unmatchedPlaceCount, placeCount, hotelCandidates] = await Promise.all([
      this.prisma.guideInspirationCandidate.count({
        where: {
          sessionId,
          candidateType: { in: [...POI_MATCHABLE_CANDIDATE_TYPES] },
          matchStatus: POI_MATCH_STATUS.UNMATCHED,
        },
      }),
      this.prisma.guideInspirationCandidate.count({
        where: { sessionId, candidateType: 'poi' },
      }),
      this.loadHotelCandidateRefs(sessionId),
    ]);
    const travelContext = session.travelContext as GuideTravelContext | null;
    return rows.map((c) =>
      this.enrichPlanCandidateDetail(
        c,
        travelContext,
        session,
        unmatchedPlaceCount,
        placeCount,
        hotelCandidates,
      ),
    );
  }

  async acceptPlanCandidate(
    userId: string,
    sessionId: string,
    planCandidateId: string,
    acceptanceMode?: string,
  ) {
    const session = await this.sessionService.requireSession(userId, sessionId, {
      importedGuides: true,
    });
    this.sessionService.requireDraftReady(session, '接受草案');

    const candidate = await this.prisma.guidePlanCandidate.findFirst({
      where: { id: planCandidateId, sessionId },
    });
    if (!candidate) {
      throw new NotFoundException(`Plan candidate ${planCandidateId} not found`);
    }

    const mode = acceptanceMode ?? 'accept_all';

    if (mode === 'review_items') {
      const itineraryDraft = candidate.itineraryDraft as unknown as GuideItineraryDraft;
      if (!itineraryDraft?.days?.length) {
        throw new BadRequestException('草案为空，请重新生成');
      }
      const items = flattenItineraryForReview(itineraryDraft);
      return {
        sessionId,
        planCandidateId,
        acceptanceMode: mode,
        status: GUIDE_TO_PLAN_SESSION_STATUS.DRAFT_READY,
        reviewRequired: true,
        items,
        message: '请勾选要保留的活动后调用 POST plan-candidates/:id/confirm',
      };
    }

    let itineraryDraft = await this.resolveItineraryForAccept(
      session,
      candidate,
      mode,
    );

    const travelContext = session.travelContext as GuideTravelContext | null;
    const countryCode =
      travelContext?.countryCode ?? session.countryCode ?? session.destination?.slice(0, 2);
    if (!countryCode || countryCode.length < 2) {
      throw new BadRequestException('缺少 countryCode，请先 PATCH travel-context');
    }

    if (!itineraryDraft?.days?.length) {
      throw new BadRequestException('草案为空，请重新生成');
    }

    const materialized = await this.materializeAcceptedPlan({
      userId,
      sessionId,
      planCandidateId,
      candidate,
      itineraryDraft,
      travelContext: travelContext ?? {},
      countryCode: countryCode.toUpperCase().slice(0, 2),
      destination: session.destination,
      acceptanceMode: mode,
    });

    return {
      sessionId,
      planCandidateId,
      acceptanceMode: mode,
      status: GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED,
      tripId: materialized.tripId,
      itemCount: materialized.itemCount,
      ...(materialized.canonicalExecuted
        ? {
            canonicalExecuted: true,
            decisionId: materialized.decisionId,
            effectivePlanVersionId: materialized.effectivePlanVersionId,
          }
        : {}),
      message: materialized.message,
    };
  }

  private async materializeAcceptedPlan(input: {
    userId: string;
    sessionId: string;
    planCandidateId: string;
    candidate: { id: string; variant: string };
    itineraryDraft: GuideItineraryDraft;
    travelContext: GuideTravelContext;
    countryCode: string;
    destination?: string | null;
    acceptanceMode: string;
    retainedItems?: object[];
  }): Promise<{
    tripId: string;
    itemCount: number;
    message: string;
    canonicalExecuted?: boolean;
    decisionId?: string;
    effectivePlanVersionId?: string;
  }> {
    const hotelCandidates = await loadGuideHotelCandidateRefs(this.prisma, input.sessionId);
    const enrichedDraft = enrichItineraryDraftAccommodation(
      input.itineraryDraft,
      hotelCandidates,
      input.destination ?? input.travelContext.destination,
    );

    const canonicalResult = this.canonicalAccept
      ? await this.canonicalAccept.acceptAndExecute({
          userId: input.userId,
          sessionId: input.sessionId,
          planCandidateId: input.planCandidateId,
          variant: input.candidate.variant as GuidePlanCandidateDetailView['variant'],
          itineraryDraft: enrichedDraft,
          travelContext: input.travelContext,
          countryCode: input.countryCode,
          destination: input.destination,
        })
      : null;

    let tripId: string;
    let itemCount: number;
    let decisionId: string | undefined;
    let effectivePlanVersionId: string | undefined;
    let canonicalExecuted = false;

    if (canonicalResult) {
      tripId = canonicalResult.tripId;
      itemCount = canonicalResult.itemCount;
      decisionId = canonicalResult.decisionId;
      effectivePlanVersionId = canonicalResult.effectivePlanVersionId;
      canonicalExecuted = true;
    } else {
      const legacy = await this.materializer.materialize({
        userId: input.userId,
        sessionId: input.sessionId,
        itineraryDraft: enrichedDraft,
        travelContext: input.travelContext,
        countryCode: input.countryCode,
        destination: input.destination,
        planCandidateId: input.planCandidateId,
      });
      tripId = legacy.tripId;
      itemCount = legacy.itemCount;
    }

    await this.prisma.guidePlanCandidate.update({
      where: { id: input.planCandidateId },
      data: {
        status: GUIDE_PLAN_CANDIDATE_STATUS.ACCEPTED,
        ...(input.retainedItems ? { retainedItems: input.retainedItems as object[] } : {}),
      },
    });

    await this.prisma.guideToPlanSession.update({
      where: { id: input.sessionId },
      data: {
        status: GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED,
        tripId,
      },
    });

    const execNote = canonicalExecuted ? '（Canonical L2 execute）' : '';
    return {
      tripId,
      itemCount,
      canonicalExecuted,
      decisionId,
      effectivePlanVersionId,
      message: `已创建正式行程 ${tripId}（${itemCount} 个活动项，状态 PLANNING）${execNote}`,
    };
  }

  async getPlanReviewItems(
    userId: string,
    sessionId: string,
    planCandidateId: string,
  ): Promise<{ planCandidateId: string; items: GuidePlanReviewItem[] }> {
    await this.sessionService.requireSession(userId, sessionId);
    const candidate = await this.prisma.guidePlanCandidate.findFirst({
      where: { id: planCandidateId, sessionId },
    });
    if (!candidate) {
      throw new NotFoundException(`Plan candidate ${planCandidateId} not found`);
    }

    const draft = candidate.itineraryDraft as unknown as GuideItineraryDraft;
    if (!draft?.days?.length) {
      throw new BadRequestException('草案为空');
    }

    return {
      planCandidateId,
      items: flattenItineraryForReview(draft),
    };
  }

  async confirmPlanItems(
    userId: string,
    sessionId: string,
    planCandidateId: string,
    acceptedItemKeys: string[],
  ) {
    if (!acceptedItemKeys.length) {
      throw new BadRequestException('请至少选择一项活动');
    }

    const session = await this.sessionService.requireSession(userId, sessionId);
    this.sessionService.requireDraftReady(session, '确认草案');
    const candidate = await this.prisma.guidePlanCandidate.findFirst({
      where: { id: planCandidateId, sessionId },
    });
    if (!candidate) {
      throw new NotFoundException(`Plan candidate ${planCandidateId} not found`);
    }

    const travelContext = session.travelContext as GuideTravelContext | null;
    const countryCode =
      travelContext?.countryCode ?? session.countryCode ?? session.destination?.slice(0, 2);
    if (!countryCode || countryCode.length < 2) {
      throw new BadRequestException('缺少 countryCode，请先 PATCH travel-context');
    }

    const sourceDraft = candidate.itineraryDraft as unknown as GuideItineraryDraft;
    const filtered = filterItineraryDraftByReviewKeys(
      sourceDraft,
      new Set(acceptedItemKeys),
    );
    if (!filtered.days.length) {
      throw new BadRequestException('所选活动无效或为空');
    }

    const materialized = await this.materializeAcceptedPlan({
      userId,
      sessionId,
      planCandidateId,
      candidate,
      itineraryDraft: filtered,
      travelContext: travelContext ?? {},
      countryCode: countryCode.toUpperCase().slice(0, 2),
      destination: session.destination,
      acceptanceMode: 'review_items',
      retainedItems: acceptedItemKeys.map((key) => ({ reviewKey: key })),
    });

    return {
      sessionId,
      planCandidateId,
      acceptanceMode: 'review_items',
      status: GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED,
      tripId: materialized.tripId,
      itemCount: materialized.itemCount,
      acceptedItemCount: acceptedItemKeys.length,
      ...(materialized.canonicalExecuted
        ? {
            canonicalExecuted: true,
            decisionId: materialized.decisionId,
            effectivePlanVersionId: materialized.effectivePlanVersionId,
          }
        : {}),
      message: materialized.message,
    };
  }

  async abandonSession(userId: string, sessionId: string) {
    const session = await this.sessionService.requireSession(userId, sessionId);
    if (session.status === GUIDE_TO_PLAN_SESSION_STATUS.ACCEPTED) {
      throw new BadRequestException('已接受的会话无法放弃');
    }

    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.ABANDONED },
    });

    return {
      sessionId,
      status: GUIDE_TO_PLAN_SESSION_STATUS.ABANDONED,
    };
  }

  private async resolveItineraryForAccept(
    session: {
      id: string;
      themeNarrative: string | null;
      travelContext: unknown;
      importedGuides?: Array<{ id: string; sourceMetadata: unknown }>;
    },
    candidate: { variant: string; itineraryDraft: unknown },
    acceptanceMode: string,
  ): Promise<GuideItineraryDraft> {
    if (acceptanceMode !== 'keep_faithful') {
      return candidate.itineraryDraft as unknown as GuideItineraryDraft;
    }

    if (candidate.variant === GUIDE_PLAN_VARIANT.FAITHFUL) {
      return candidate.itineraryDraft as unknown as GuideItineraryDraft;
    }

    const travelContext = session.travelContext as GuideTravelContext | null;
    const suggestedTripDays = this.inferSuggestedTripDays(session.importedGuides ?? []);
    const built = await this.planBuilder.build({
      sessionId: session.id,
      variant: GUIDE_PLAN_VARIANT.FAITHFUL,
      travelContext,
      themeNarrative: session.themeNarrative,
      suggestedTripDays,
    });

    this.logger.log(
      `keep_faithful: regenerated FAITHFUL draft for session ${session.id}`,
    );
    return built.itineraryDraft;
  }

  async getUnderstandingView(userId: string, sessionId: string): Promise<GuideUnderstandingView> {
    const session = await this.sessionService.requireSession(userId, sessionId, {
      importedGuides: true,
    });
    const importedGuides = session.importedGuides ?? [];

    const [candidates, claims] = await Promise.all([
      this.prisma.guideInspirationCandidate.findMany({
        where: { sessionId },
        orderBy: [{ suggestedDay: 'asc' }, { routeOrder: 'asc' }],
      }),
      this.prisma.guideClaim.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
    ]);

    const travelContext = session.travelContext as GuideTravelContext | null;
    const suggestedTripDays = this.inferSuggestedTripDays(importedGuides);
    const summary = this.buildSummary(candidates, claims, importedGuides.length);
    if (!summary.suggestedTripDays && suggestedTripDays) {
      summary.suggestedTripDays = suggestedTripDays;
    }

    const pendingConfirmations = this.buildPendingConfirmationsForSession(
      travelContext,
      session,
    );
    const parsedGuideCount = importedGuides.filter(
      (g) => g.parseStatus === GUIDE_PARSE_STATUS.PARSED,
    ).length;
    const parseRequired =
      importedGuides.length > 0 &&
      parsedGuideCount === 0 &&
      session.status === GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING;

    return {
      sessionId,
      status: session.status as GuideUnderstandingView['status'],
      summary,
      themeNarrative: session.themeNarrative,
      parseRequired,
      parsedGuideCount,
      places: candidates.map((c) => ({
        id: c.id,
        candidateType: c.candidateType as GuideUnderstandingView['places'][0]['candidateType'],
        rawName: c.rawName,
        rawNameEn: c.rawNameEn,
        placeId: c.placeId,
        matchStatus: c.matchStatus as GuideUnderstandingView['places'][0]['matchStatus'],
        credibilityLevel:
          c.credibilityLevel as GuideUnderstandingView['places'][0]['credibilityLevel'],
        suggestedDay: c.suggestedDay,
        routeOrder: c.routeOrder,
        sourceGuideIds: c.sourceGuideIds,
        geo: this.poiGeo?.parseCandidateGeo(c.metadata) ?? null,
        geoResolutionStatus:
          (c.metadata as { geoResolutionStatus?: string } | null)?.geoResolutionStatus ??
          undefined,
      })),
      claims: claims.map((c) => ({
        id: c.id,
        claimType: c.claimType,
        subjectName: c.subjectName,
        statement: c.statement,
        confidenceLevel: c.confidenceLevel as GuideUnderstandingView['claims'][0]['confidenceLevel'],
        verificationStatus: c.verificationStatus,
      })),
      importedGuides: importedGuides.map((g) => this.sessionService.serializeGuide(g)),
      requiresTravelContext: pendingConfirmations.some((item) => item.required),
      pendingConfirmations,
    };
  }

  private inferSuggestedTripDays(
    guides: Array<{ sourceMetadata: unknown }>,
  ): number | undefined {
    const values: number[] = [];
    for (const guide of guides) {
      const meta = guide.sourceMetadata as { suggestedTripDays?: number } | null;
      if (
        typeof meta?.suggestedTripDays === 'number' &&
        meta.suggestedTripDays >= 1 &&
        meta.suggestedTripDays <= 30
      ) {
        values.push(meta.suggestedTripDays);
      }
    }
    if (values.length === 0) return undefined;
    return Math.max(...values);
  }

  private buildPendingConfirmationsForSession(
    travelContext: GuideTravelContext | null | undefined,
    session: { countryCode?: string | null; destination?: string | null },
  ) {
    const packHints =
      this.routeConstraintGateway?.getPackHints({
        countryCode: travelContext?.countryCode ?? session.countryCode ?? undefined,
        travelContext: travelContext ?? undefined,
      }) ?? [];
    return buildPendingConfirmations(travelContext, session, packHints);
  }

  private enrichPlanCandidateDetail(
    row: {
      id: string;
      variant: string;
      status: string;
      comparisonDiff: unknown;
      itineraryDraft: unknown;
      decisionReasons: unknown;
      retainedItems: unknown;
      modifiedItems: unknown;
      rejectedItems: unknown;
      personaOpinions?: unknown;
      createdAt: Date;
    },
    travelContext: GuideTravelContext | null,
    session: { countryCode?: string | null; destination?: string | null },
    unmatchedPlaceCount: number,
    placeCount: number,
    hotelCandidates: GuideHotelCandidateRef[] = [],
  ): GuidePlanCandidateDetailView {
    const rawDraft = row.itineraryDraft as GuideItineraryDraft | null;
    const draft =
      rawDraft?.days?.length != null
        ? enrichItineraryDraftAccommodation(
            rawDraft,
            hotelCandidates,
            travelContext?.destination ?? session.destination,
          )
        : rawDraft;
    const warnings = draft?.warnings ?? [];
    const comparisonDiff = Array.isArray(row.comparisonDiff) ? row.comparisonDiff : [];
    const drivingIssueCount = warnings.filter((w) => /驾驶|车程/i.test(w)).length;
    const constraintBlockCount =
      draft?.days?.filter(
        (d) => d.routeAvailability && !d.routeAvailability.operationallyAvailable,
      ).length ?? 0;
    const candidateMeta = readPlanCandidateMeta(row.personaOpinions);

    return {
      id: row.id,
      variant: row.variant as GuidePlanCandidateDetailView['variant'],
      status: row.status as GuidePlanCandidateDetailView['status'],
      comparisonDiff: row.comparisonDiff as GuidePlanCandidateDetailView['comparisonDiff'],
      itineraryDraft: draft,
      decisionReasons: row.decisionReasons,
      retainedItems: row.retainedItems,
      modifiedItems: row.modifiedItems,
      rejectedItems: row.rejectedItems,
      warnings,
      feasibilityScore: computeGuideFeasibilityScore({
        warnings,
        unmatchedPlaceCount,
        placeCount,
        comparisonDiffCount: comparisonDiff.length,
        drivingIssueCount,
        constraintBlockCount,
        travelContext,
        sourceConfidence: draft?.sourceConfidence,
      }),
      pendingConfirmations: this.buildPendingConfirmationsForSession(travelContext, session),
      ...candidateMeta,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getPlanCandidateById(
    userId: string,
    sessionId: string,
    planCandidateId: string,
  ): Promise<GuidePlanCandidateDetailView> {
    const session = await this.sessionService.requireSession(userId, sessionId);
    const candidate = await this.prisma.guidePlanCandidate.findFirst({
      where: { id: planCandidateId, sessionId },
    });
    if (!candidate) {
      throw new NotFoundException(`Plan candidate ${planCandidateId} not found`);
    }

    const [unmatchedPlaceCount, placeCount, hotelCandidates] = await Promise.all([
      this.prisma.guideInspirationCandidate.count({
        where: {
          sessionId,
          candidateType: { in: [...POI_MATCHABLE_CANDIDATE_TYPES] },
          matchStatus: POI_MATCH_STATUS.UNMATCHED,
        },
      }),
      this.prisma.guideInspirationCandidate.count({
        where: { sessionId, candidateType: 'poi' },
      }),
      this.loadHotelCandidateRefs(sessionId),
    ]);

    return this.enrichPlanCandidateDetail(
      candidate,
      session.travelContext as GuideTravelContext | null,
      session,
      unmatchedPlaceCount,
      placeCount,
      hotelCandidates,
    );
  }

  private async loadHotelCandidateRefs(sessionId: string): Promise<GuideHotelCandidateRef[]> {
    return loadGuideHotelCandidateRefs(this.prisma, sessionId);
  }

  private buildSummary(
    candidates: Array<{ candidateType: string; matchStatus: string }>,
    claims: Array<{ claimType: string; statement: string }>,
    guideCount: number,
  ): GuideUnderstandingSummary {
    const placeCount = candidates.filter((c) => c.candidateType === 'poi').length;
    const restaurantCount = candidates.filter((c) => c.candidateType === 'restaurant').length;
    const hotelAreaCount = candidates.filter((c) => c.candidateType === 'hotel').length;
    const unmatchedPlaceCount = countUnmatchedPoiCandidates(candidates);

    return {
      guideCount,
      placeCount,
      restaurantCount,
      hotelAreaCount,
      tipCount: claims.filter((c) => c.claimType === 'experience_tip').length,
      riskCount: claims.filter((c) => /不建议|风险|关闭|预约/i.test(c.statement)).length,
      unmatchedPlaceCount,
      potentialIssues: [
        ...(unmatchedPlaceCount > 0
          ? [`${unmatchedPlaceCount} 个地点尚未匹配到 POI 数据库`]
          : []),
        '攻略信息尚未经官方数据源验证',
      ],
    };
  }
}
