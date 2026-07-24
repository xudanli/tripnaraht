import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { MatchSquareRecruitmentPost, Prisma, MatchSquareRecruitmentApplication } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OdysseyIntakeService } from '../odyssey-intake/odyssey-intake.service';
import { ReputationOsService } from '../reputation-os/reputation-os.service';
import type { OdysseyIntakeProfile } from '../odyssey-intake/types/odyssey-intake.types';
import type { MatchableProfile } from '../odyssey-intake/engine/companion-matching.engine';
import {
  INTERACTION_MODE_DEFINITIONS,
  deriveInteractionMode,
} from './config/interaction-modes.config';
import { TRAVEL_MODE_OPTIONS, TRIP_MOOD_TAG_OPTIONS } from './config/trip-mood-tags.config';
import { listDestinationRegionOptions } from './config/destination-taxonomy.config';
import { listPremiumTrekkingSceneOption } from './config/premium-trekking.config';
import { TEAMWORK_STYLE_OPTIONS, resolveTeamworkStyleCapsule } from './config/planning-styles.config';
import { normalizePlanningStyleInput } from './util/planning-style.util';
import {
  PERSONA_QUADRANT_OPTIONS,
  PERSONA_TYPE_OPTIONS,
  mbtiMatchesQuadrantFilter,
  resolveMbtiQuadrant,
} from './util/mbti-quadrant.util';
import { buildMatchSquareAccess } from './util/access-gate.util';
import {
  toRecruitmentPostCardView,
  toRecruitmentPostDetailView,
} from './util/post-card-view.util';
import { toRecruitmentApplicationCardView } from './util/application-card-view.util';
import { detectPlanningConflict } from './util/planning-conflict.util';
import { detectTeamworkCommitmentPrompt } from './util/teamwork-commitment.util';
import { failsTeamworkStyleHardGate } from './engine/teamwork-style-matching.engine';
import { buildApplicationMatchInsights } from './engine/application-insights.engine';
import { buildApplicationDecisionBrief } from './util/recruitment-task-flywheel.util';
import { evaluatePhysicalFitnessHardGate } from './engine/physical-fitness-hard-gate.engine';
import { isPremiumTrekkingScriptId } from './config/premium-trekking.config';
import {
  gradeSurvivalQuizAnswers,
  pickSurvivalQuizForScript,
} from './config/trekking-survival-quiz.config';
import {
  resolveRecruitmentScriptIdFromSnapshot,
} from './util/trekking-fitness-baseline.util';
import type { TrekkingFitnessBaseline } from './types/physical-fitness-gate.types';
import { TrekkingFitnessBaselineService } from './trekking-fitness-baseline.service';
import { SovereignForceLockService } from './sovereign-force-lock.service';
import { CollabFlywheelAuditService } from './observability/collaborative-flywheel-audit.service';
import { pickBestMatchFlash } from './engine/match-flash.engine';
import { rankCaptainRadarPicks } from './engine/captain-radar.engine';
import { deriveCapabilityTags, normalizeUpsertTravelIntentInput } from './util/travel-intent.util';
import type {
  CaptainPersonaSnapshot,
  FilterOptionsView,
  MatchSquareAccess,
  MatchSquareFeedItem,
  RecruitmentPostStatus,
  ApplyPreviewView,
  TravelIntentView,
  CaptainRadarView,
  OliveBranchInvitationView,
  TeamworkStyle,
  UserPublicCredentialsView,
} from './types/match-square.types';
import type {
  CreateRecruitmentPostDto,
  CreateRecruitmentApplicationDto,
  DecideRecruitmentApplicationDto,
  ListMyApplicationsQueryDto,
  ListMyRecruitmentPostsQueryDto,
  ListPostApplicationsQueryDto,
  ListRecruitmentPostsQueryDto,
  UpdateRecruitmentPostDto,
  UpdateRecruitmentPostStatusDto,
  UpsertTravelIntentDto,
  UpdateTravelIntentStatusDto,
  SendOliveBranchDto,
  RespondOliveBranchDto,
  GetUserCredentialsQueryDto,
} from './dto/match-square.dto';
import type { OdysseyTrustVerification } from '../odyssey-intake/types/odyssey-intake-ext.types';
import { assertValidPostId } from './util/post-id.util';
import {
  buildCaptainCredentialsContext,
  loadCredentialsContextBatch,
  loadUserCredentialsContext,
} from './util/credentials-context.util';
import {
  enrichTeamPuzzleWithIdentities,
  resolveApplicantIdentityFields,
  type ResolvedApplicantIdentity,
} from './util/application-identity.util';
import { VibeLlmService } from './vibe-llm.service';
import { TrekkingSpawnService } from './trekking-spawn.service';
import { TripInstantiationService } from './trip-instantiation.service';
import {
  attachVibeParseSnapshot,
  readVibePayloadFromSnapshot,
} from './engine/vibe-llm-parse.engine';
import {
  attachTrekkingOrchestrationSnapshot,
  buildTrekkingVibeOrchestrationPlan,
} from './engine/trekking-vibe-orchestration.engine';
import {
  attachRouteTemplateLaunchSnapshot,
  buildForcedRouteTemplateMatchPlan,
  buildLaunchRecruitmentPostFields,
  buildLaunchVibeParseView,
  buildRouteTemplateLaunchSnapshot,
} from './engine/route-template-launch-recruitment.engine';
import type { RouteTemplateIntentCatalogEntry } from './types/route-template-intent.types';
import type {
  LaunchRecruitmentFromTemplateInput,
  LaunchRecruitmentFromTemplateResultView,
} from './types/route-template-launch-recruitment.types';
import { evaluateVibeHardGates } from './util/vibe-hard-gate.util';
import { buildTeamPuzzle } from './engine/slot-filling.engine';
import type { TeamPuzzleView } from './types/match-square.types';
import {
  appendFilledSlotToSnapshot,
  buildFilledSlotRecord,
  extractVibeSlotIdsFromPost,
  findFirstOpenMemberSlotIndex,
  listOccupiedSlotIndexes,
  readTeamPuzzleFilledSlots,
  resolveApplicationTargetSlot,
  resolveRoleLabelForSlot,
} from './engine/team-puzzle-assignment.engine';
import { buildPuzzleSlotId } from './types/team-puzzle-assignment.types';

type WritablePostFields = Pick<
  CreateRecruitmentPostDto,
  | 'destination'
  | 'departureLabel'
  | 'destinationLat'
  | 'destinationLng'
  | 'destinationPoiId'
  | 'startDate'
  | 'endDate'
  | 'itinerarySummary'
  | 'budgetMinCents'
  | 'budgetMaxCents'
  | 'slotsNeeded'
  | 'preferenceNotes'
  | 'tripMoodTag'
  | 'planningStyle'
  | 'travelMode'
  | 'vehicleInfo'
  | 'captainMessage'
>;

@Injectable()
export class MatchSquareService {
  private readonly logger = new Logger(MatchSquareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly odysseyIntake: OdysseyIntakeService,
    private readonly reputationOs: ReputationOsService,
    private readonly vibeLlmService: VibeLlmService,
    private readonly trekkingSpawnService: TrekkingSpawnService,
    private readonly tripInstantiationService: TripInstantiationService,
    private readonly trekkingFitnessBaseline: TrekkingFitnessBaselineService,
    private readonly sovereignForceLockService: SovereignForceLockService,
    @Optional() private readonly collabFlywheelAudit?: CollabFlywheelAuditService,
  ) {}

  /** PRD 4.3 — 发布页实时 Vibe 解析（键入时 debounce 调用） */
  async parseVibeFreeText(freeText: string) {
    return this.vibeLlmService.parseFreeText(freeText);
  }

  /** PRD 3.10 — 预览从 Premium Trekking 招募帖 spawn Trip */
  previewTrekkingSpawn(userId: string, postId: string) {
    return this.trekkingSpawnService.previewSpawnFromPost(userId, postId);
  }

  /** PRD 3.10 — 从招募帖生成 Trip + HikePlan + 离线/DNA 编排 */
  spawnTrekkingTrip(userId: string, postId: string, tripId?: string) {
    return this.trekkingSpawnService.spawnTripFromRecruitmentPost(userId, postId, { tripId });
  }

  /** PRD 3.12 — 预览成团 → Active Trip 实例化计划 */
  previewTripInstantiation(userId: string, postId: string) {
    return this.tripInstantiationService.previewInstantiationFromPost(userId, postId);
  }

  /** PRD 3.12 — 从 sealed 招募帖实例化 Active Trip */
  instantiateTripFromPost(userId: string, postId: string, skipIfExists?: boolean) {
    return this.tripInstantiationService.instantiateTripFromRecruitmentPost(userId, postId, {
      skipIfExists,
    });
  }

  /** PRD 3.15 — 预览队长强制成团 */
  previewSovereignForceLock(userId: string, postId: string) {
    return this.sovereignForceLockService.previewForceLock(userId, postId);
  }

  /** PRD 3.15 — 执行队长强制成团 */
  executeSovereignForceLock(
    userId: string,
    postId: string,
    input?: { note?: string; skipInstantiate?: boolean },
  ) {
    return this.sovereignForceLockService.executeForceLock(userId, postId, input);
  }

  async getAccess(userId?: string): Promise<MatchSquareAccess> {
    const quizComplete = userId ? await this.isQuizComplete(userId) : false;
    return buildMatchSquareAccess(quizComplete);
  }

  getFilterOptions(): FilterOptionsView {
    return {
      personaQuadrants: PERSONA_QUADRANT_OPTIONS,
      personaTypes: PERSONA_TYPE_OPTIONS,
      interactionModes: INTERACTION_MODE_DEFINITIONS,
      tripMoodTags: TRIP_MOOD_TAG_OPTIONS,
      planningStyles: TEAMWORK_STYLE_OPTIONS.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
      teamworkStyles: TEAMWORK_STYLE_OPTIONS,
      travelModes: TRAVEL_MODE_OPTIONS,
      destinationRegions: listDestinationRegionOptions(),
      premiumTrekkingScene: listPremiumTrekkingSceneOption(),
    };
  }

  async listPosts(
    query: ListRecruitmentPostsQueryDto,
    viewerUserId?: string,
  ) {
    const started = Date.now();
    const viewer = await this.loadViewerProfile(viewerUserId);
    const access = buildMatchSquareAccess(viewer != null);

    const where = this.buildListWhere(query, 'active');
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.matchSquareRecruitmentPost.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.matchSquareRecruitmentPost.count({ where }),
    ]);

    const filtered = this.applyClientSideFilters(rows, query);

    const captainIds = filtered.map((p) => p.captainUserId);
    const credentialsBatch = await loadCredentialsContextBatch(
      this.prisma,
      this.reputationOs,
      captainIds,
    );
    const viewerCtx = viewerUserId
      ? await loadUserCredentialsContext(this.prisma, this.reputationOs, viewerUserId)
      : null;

    const visible = filtered.filter((post) => {
      if (post.captainUserId === viewerUserId) return true;
      const ctx = credentialsBatch.get(post.captainUserId);
      return !ctx?.fulfillmentBlocked;
    });

    const posts = visible.map((post) => {
      const captainCtx = buildCaptainCredentialsContext(post, credentialsBatch);
      return toRecruitmentPostCardView(post, viewer, {
        captainSocial: captainCtx?.socialProfile,
        viewerSocial: viewerCtx?.socialProfile,
        verifiedCredentials: captainCtx?.verifiedCredentials ?? null,
      });
    });

    let feedItems: MatchSquareFeedItem[] = posts.map((post) => ({ kind: 'post', post }));
    let matchFlash = null;

    if (viewer && viewerUserId && offset === 0) {
      const profile = await this.odysseyIntake.getProfile(viewerUserId);
      if (profile) {
        const viewerSnapshot = await this.buildCaptainSnapshot(viewerUserId, profile);
        matchFlash = pickBestMatchFlash(visible, viewer, viewerSnapshot);
        if (matchFlash && posts.length >= 1) {
          const insertAt = Math.min(matchFlash.insertAfterIndex, posts.length);
          feedItems = [
            ...posts.slice(0, insertAt).map((post) => ({ kind: 'post' as const, post })),
            { kind: 'match_flash' as const, flash: matchFlash },
            ...posts.slice(insertAt).map((post) => ({ kind: 'post' as const, post })),
          ];
        }
      }
    }

    const elapsedMs = Date.now() - started;

    if (elapsedMs > 300) {
      this.logger.warn(`[MatchSquare] list slow=${elapsedMs}ms total=${total}`);
    }

    return {
      access,
      posts,
      feedItems,
      matchFlash,
      pagination: { total, limit, offset },
      meta: { elapsedMs },
    };
  }

  async listMyPosts(userId: string, query: ListMyRecruitmentPostsQueryDto) {
    await this.assertQuizComplete(userId);

    const statusFilter = query.status ?? 'all';
    const where: Prisma.MatchSquareRecruitmentPostWhereInput = {
      captainUserId: userId,
      ...(statusFilter === 'all' ? {} : { status: statusFilter }),
    };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.matchSquareRecruitmentPost.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.matchSquareRecruitmentPost.count({ where }),
    ]);

    const viewer = await this.loadViewerProfile(userId);

    const postsWithRadar = await Promise.all(
      rows.map(async (post) => {
        const detail = toRecruitmentPostDetailView(post, viewer, userId);
        let radarHint: { eligibleCount: number; topPickDisplayName: string | null } | null = null;

        if (post.status === 'active' && post.slotsFilled < post.slotsNeeded) {
          const radar = await this.buildCaptainRadar(post);
          if (radar.eligibleCount > 0) {
            radarHint = {
              eligibleCount: radar.eligibleCount,
              topPickDisplayName: radar.picks[0]?.displayName ?? null,
            };
          }
        }

        return { ...detail, radarHint };
      }),
    );

    return {
      posts: postsWithRadar,
      pagination: { total, limit, offset },
    };
  }

  async getPost(postId: string, viewerUserId?: string) {
    const post = await this.findPostOrThrow(postId);
    const viewer = await this.loadViewerProfile(viewerUserId);

    if (post.status !== 'active' && post.captainUserId !== viewerUserId) {
      throw new NotFoundException('招募帖不存在或已下架');
    }

    const captainCtx = await loadUserCredentialsContext(this.prisma, this.reputationOs, post.captainUserId, {
      teamworkStyleCapsule: resolveTeamworkStyleCapsule(post.planningStyle),
    });
    const viewerCtx = viewerUserId
      ? await loadUserCredentialsContext(this.prisma, this.reputationOs, viewerUserId)
      : null;

    return {
      access: buildMatchSquareAccess(viewer != null),
      post: {
        ...toRecruitmentPostDetailView(post, viewer, viewerUserId, {
          captainSocial: captainCtx.socialProfile,
          viewerSocial: viewerCtx?.socialProfile,
          verifiedCredentials: captainCtx.verifiedCredentials,
          captainDisplayName: captainCtx.verifiedCredentials.headline.displayName,
        }),
        teamPuzzle: await this.buildEnrichedTeamPuzzle(post, viewer, {
          captainDisplayName: captainCtx.verifiedCredentials.headline.displayName,
        }),
      },
    };
  }

  async getUserCredentials(
    viewerUserId: string,
    targetUserId: string,
    options?: { postId?: string },
  ): Promise<UserPublicCredentialsView> {
    await this.assertQuizComplete(viewerUserId);

    let teamworkStyleCapsule: string | null = null;
    if (options?.postId) {
      assertValidPostId(options.postId);
      const post = await this.prisma.matchSquareRecruitmentPost.findUnique({
        where: { id: options.postId },
        select: { captainUserId: true, planningStyle: true },
      });
      if (post?.captainUserId === targetUserId) {
        teamworkStyleCapsule = resolveTeamworkStyleCapsule(post.planningStyle);
      }
    }

    const [profile, ctx] = await Promise.all([
      this.odysseyIntake.getProfile(targetUserId),
      loadUserCredentialsContext(this.prisma, this.reputationOs, targetUserId, {
        teamworkStyleCapsule,
      }),
    ]);

    return {
      userId: targetUserId,
      cardTitle: profile?.card?.title ?? null,
      mbtiType: profile?.mbtiType ?? null,
      verifiedCredentials: ctx.verifiedCredentials,
    };
  }

  async createPost(userId: string, dto: CreateRecruitmentPostDto) {
    await this.assertQuizComplete(userId);

    const profile = await this.odysseyIntake.getProfile(userId);
    if (!profile) {
      throw new BadRequestException('尚未完成旅行人格测评');
    }

    const snapshot = await this.buildCaptainSnapshot(userId, profile);
    const now = new Date();
    let planningStyle = normalizePlanningStyleInput(dto);
    let personaSnapshot = snapshot;
    let itinerarySummary = dto.itinerarySummary?.trim() ?? '';
    let captainMessage = dto.captainMessage?.trim() ?? null;

    let destination = dto.destination?.trim() ?? '';
    let departureLabel = dto.departureLabel?.trim() ?? null;
    let budgetMinCents = dto.budgetMinCents ?? null;
    let budgetMaxCents = dto.budgetMaxCents ?? null;
    let travelMode = dto.travelMode ?? null;
    let tripMoodTag = dto.tripMoodTag ?? null;
    let preferenceNotes = dto.preferenceNotes?.trim() ?? null;

    if (dto.vibeFreeText?.trim() || dto.vibeParse || dto.vibe_parse) {
      const vibeView = await this.vibeLlmService.resolveCreateVibeParse({
        vibeFreeText: dto.vibeFreeText,
        vibeParse: dto.vibeParse,
        vibe_parse: dto.vibe_parse,
      });
      if (vibeView) {
        const { suggestedFields } = vibeView;
        planningStyle = vibeView.suggestedPlanningStyle;
        personaSnapshot = attachVibeParseSnapshot(snapshot, vibeView.payload, vibeView);
        const trekPlan = vibeView.trekkingOrchestration ?? buildTrekkingVibeOrchestrationPlan(vibeView.payload);
        personaSnapshot = attachTrekkingOrchestrationSnapshot(personaSnapshot, trekPlan);
        const sourceText = dto.vibeFreeText?.trim() || vibeView.payload.source_text?.trim() || '';
        if (!itinerarySummary) {
          itinerarySummary = vibeView.suggestedItinerarySummary || sourceText.slice(0, 500);
        }
        if (!captainMessage) {
          captainMessage = vibeView.suggestedCaptainMessage || null;
        }
        if (!destination && suggestedFields.destination) {
          destination = suggestedFields.destination;
        }
        if (!departureLabel && suggestedFields.departureLabel) {
          departureLabel = suggestedFields.departureLabel;
        }
        if (budgetMinCents == null && suggestedFields.budgetMinCents != null) {
          budgetMinCents = suggestedFields.budgetMinCents;
        }
        if (budgetMaxCents == null && suggestedFields.budgetMaxCents != null) {
          budgetMaxCents = suggestedFields.budgetMaxCents;
        }
        if (!travelMode && suggestedFields.travelMode) {
          travelMode = suggestedFields.travelMode;
        }
        if (!tripMoodTag && suggestedFields.tripMoodTag) {
          tripMoodTag = suggestedFields.tripMoodTag;
        }
        if (!preferenceNotes && suggestedFields.preferenceNotes) {
          preferenceNotes = suggestedFields.preferenceNotes;
        }
      }
    }

    if (!destination) {
      throw new BadRequestException('请填写 destination，或在招募愿景中明确目的地');
    }

    if (!itinerarySummary) {
      throw new BadRequestException('请填写 itinerarySummary，或在招募愿景中描述行程');
    }

    this.validateWritableFields({
      ...dto,
      destination,
      itinerarySummary,
      captainMessage: captainMessage ?? undefined,
      budgetMinCents: budgetMinCents ?? undefined,
      budgetMaxCents: budgetMaxCents ?? undefined,
      travelMode: travelMode ?? undefined,
      tripMoodTag: tripMoodTag ?? undefined,
      preferenceNotes: preferenceNotes ?? undefined,
    });

    const post = await this.prisma.matchSquareRecruitmentPost.create({
      data: {
        captainUserId: userId,
        status: 'active',
        destination: destination.trim(),
        departureLabel,
        destinationLat: dto.destinationLat ?? null,
        destinationLng: dto.destinationLng ?? null,
        destinationPoiId: dto.destinationPoiId ?? null,
        startDate: this.parseDate(dto.startDate, 'startDate'),
        endDate: this.parseDate(dto.endDate, 'endDate'),
        itinerarySummary,
        budgetMinCents,
        budgetMaxCents,
        slotsNeeded: dto.slotsNeeded,
        preferenceNotes,
        tripMoodTag,
        planningStyle: planningStyle!,
        travelMode,
        vehicleInfo: dto.vehicleInfo?.trim() ?? null,
        captainMessage,
        captainMbtiType: profile.mbtiType,
        captainCardTitle: profile.card.title,
        captainInteractionMode: snapshot.interactionMode,
        captainReputationStars: snapshot.reputationStars ?? null,
        captainPersonaSnapshot: personaSnapshot as unknown as Prisma.InputJsonValue,
        publishedAt: now,
      },
    });

    const viewer = await this.loadViewerProfile(userId);
    const postView = toRecruitmentPostDetailView(post, viewer, userId);
    return {
      id: post.id,
      post: postView,
    };
  }

  async createPostFromRouteTemplateLaunch(
    userId: string,
    input: {
      template: {
        id: number;
        uuid: string;
        name: string | null;
        durationDays: number;
        routeDirectionName: string;
        routeDirectionNameCn: string;
      };
      catalog: RouteTemplateIntentCatalogEntry;
      dto: LaunchRecruitmentFromTemplateInput;
    },
  ): Promise<LaunchRecruitmentFromTemplateResultView> {
    await this.assertQuizComplete(userId);

    const profile = await this.odysseyIntake.getProfile(userId);
    if (!profile) {
      throw new BadRequestException('尚未完成旅行人格测评');
    }

    const routeTemplateMatch = buildForcedRouteTemplateMatchPlan(input.catalog);
    const fields = buildLaunchRecruitmentPostFields({
      catalog: input.catalog,
      templateName: input.template.name,
      routeDirectionNameCn: input.template.routeDirectionNameCn,
      dto: input.dto,
    });

    const planningStyle = normalizePlanningStyleInput(input.dto, { required: true });
    const writable: WritablePostFields = {
      destination: fields.destination,
      departureLabel: input.dto.departureLabel,
      startDate: input.dto.startDate,
      endDate: input.dto.endDate,
      itinerarySummary: fields.itinerarySummary,
      budgetMinCents: input.dto.budgetMinCents,
      budgetMaxCents: input.dto.budgetMaxCents,
      slotsNeeded: input.dto.slotsNeeded,
      preferenceNotes: fields.preferenceNotes ?? undefined,
      tripMoodTag: input.dto.tripMoodTag,
      planningStyle: planningStyle!,
      travelMode: input.dto.travelMode,
      captainMessage: fields.captainMessage ?? undefined,
    };
    this.validateWritableFields(writable);

    const snapshot = await this.buildCaptainSnapshot(userId, profile);
    const vibeView = buildLaunchVibeParseView({
      catalog: input.catalog,
      fields,
      routeTemplateMatch,
      planningStyle: planningStyle!,
    });

    let personaSnapshot = attachVibeParseSnapshot(snapshot, vibeView.payload, vibeView);
    personaSnapshot = attachTrekkingOrchestrationSnapshot(
      personaSnapshot,
      vibeView.trekkingOrchestration ?? buildTrekkingVibeOrchestrationPlan(vibeView.payload),
    );
    personaSnapshot = attachRouteTemplateLaunchSnapshot(
      personaSnapshot,
      buildRouteTemplateLaunchSnapshot({
        routeTemplateId: input.template.id,
        routeTemplateUuid: input.template.uuid,
        catalog: input.catalog,
      }),
    );

    const now = new Date();
    const post = await this.prisma.matchSquareRecruitmentPost.create({
      data: {
        captainUserId: userId,
        status: 'active',
        destination: fields.destination.trim(),
        departureLabel: input.dto.departureLabel?.trim() ?? null,
        startDate: this.parseDate(input.dto.startDate, 'startDate'),
        endDate: this.parseDate(input.dto.endDate, 'endDate'),
        itinerarySummary: fields.itinerarySummary,
        budgetMinCents: input.dto.budgetMinCents ?? null,
        budgetMaxCents: input.dto.budgetMaxCents ?? null,
        slotsNeeded: input.dto.slotsNeeded,
        preferenceNotes: fields.preferenceNotes,
        tripMoodTag: input.dto.tripMoodTag ?? null,
        planningStyle: planningStyle!,
        travelMode: input.dto.travelMode ?? null,
        vehicleInfo: null,
        captainMessage: fields.captainMessage,
        captainMbtiType: profile.mbtiType,
        captainCardTitle: profile.card.title,
        captainInteractionMode: snapshot.interactionMode,
        captainReputationStars: snapshot.reputationStars ?? null,
        captainPersonaSnapshot: personaSnapshot as unknown as Prisma.InputJsonValue,
        publishedAt: now,
      },
    });

    const viewer = await this.loadViewerProfile(userId);
    const postView = toRecruitmentPostDetailView(post, viewer, userId);

    return {
      recruitmentPostId: post.id,
      matchSquarePath: `/match-square/posts/${post.id}`,
      routeTemplate: {
        id: input.template.id,
        uuid: input.template.uuid,
        catalogId: input.catalog.catalogId,
        titleZh: input.catalog.titleZh,
      },
      routeTemplateMatch,
      post: postView,
    };
  }

  async updatePost(userId: string, postId: string, dto: UpdateRecruitmentPostDto) {
    await this.assertQuizComplete(userId);
    const existing = await this.findCaptainPostOrThrow(userId, postId);

    const merged: WritablePostFields = {
      destination: dto.destination ?? existing.destination,
      departureLabel: dto.departureLabel ?? existing.departureLabel ?? undefined,
      destinationLat: dto.destinationLat ?? existing.destinationLat ?? undefined,
      destinationLng: dto.destinationLng ?? existing.destinationLng ?? undefined,
      destinationPoiId: dto.destinationPoiId ?? existing.destinationPoiId ?? undefined,
      startDate: dto.startDate ?? this.formatDate(existing.startDate),
      endDate: dto.endDate ?? this.formatDate(existing.endDate),
      itinerarySummary: dto.itinerarySummary ?? existing.itinerarySummary,
      budgetMinCents: dto.budgetMinCents ?? existing.budgetMinCents ?? undefined,
      budgetMaxCents: dto.budgetMaxCents ?? existing.budgetMaxCents ?? undefined,
      slotsNeeded: dto.slotsNeeded ?? existing.slotsNeeded,
      preferenceNotes: dto.preferenceNotes ?? existing.preferenceNotes ?? undefined,
      tripMoodTag: (dto.tripMoodTag ?? existing.tripMoodTag ?? undefined) as WritablePostFields['tripMoodTag'],
      planningStyle: (dto.planningStyle ??
        dto.planning_style ??
        existing.planningStyle ??
        undefined) as WritablePostFields['planningStyle'],
      travelMode: (dto.travelMode ?? existing.travelMode ?? undefined) as WritablePostFields['travelMode'],
      vehicleInfo: dto.vehicleInfo ?? existing.vehicleInfo ?? undefined,
      captainMessage: dto.captainMessage ?? existing.captainMessage ?? undefined,
    };

    this.validateWritableFields(merged);

    const post = await this.prisma.matchSquareRecruitmentPost.update({
      where: { id: postId },
      data: {
        destination: merged.destination?.trim() ?? '',
        departureLabel: merged.departureLabel?.trim() ?? null,
        destinationLat: merged.destinationLat ?? null,
        destinationLng: merged.destinationLng ?? null,
        destinationPoiId: merged.destinationPoiId ?? null,
        startDate: this.parseDate(merged.startDate, 'startDate'),
        endDate: this.parseDate(merged.endDate, 'endDate'),
        itinerarySummary: merged.itinerarySummary?.trim() ?? '',
        budgetMinCents: merged.budgetMinCents ?? null,
        budgetMaxCents: merged.budgetMaxCents ?? null,
        slotsNeeded: merged.slotsNeeded,
        preferenceNotes: merged.preferenceNotes?.trim() ?? null,
        tripMoodTag: merged.tripMoodTag ?? null,
        planningStyle: normalizePlanningStyleInput(merged, { required: false }),
        travelMode: merged.travelMode ?? null,
        vehicleInfo: merged.vehicleInfo?.trim() ?? null,
        captainMessage: merged.captainMessage?.trim() ?? null,
      },
    });

    const viewer = await this.loadViewerProfile(userId);
    return {
      post: toRecruitmentPostDetailView(post, viewer, userId),
    };
  }

  async updatePostStatus(
    userId: string,
    postId: string,
    dto: UpdateRecruitmentPostStatusDto,
  ) {
    await this.assertQuizComplete(userId);
    await this.findCaptainPostOrThrow(userId, postId);

    const post = await this.prisma.matchSquareRecruitmentPost.update({
      where: { id: postId },
      data: {
        status: dto.status,
        publishedAt: dto.status === 'active' ? new Date() : undefined,
        closedAt: dto.status === 'closed' ? new Date() : null,
      },
    });

    const viewer = await this.loadViewerProfile(userId);
    return {
      post: toRecruitmentPostDetailView(post, viewer, userId),
    };
  }

  async getApplyPreview(userId: string, postId: string): Promise<ApplyPreviewView> {
    await this.assertQuizComplete(userId);

    const post = await this.findPostOrThrow(postId);
    const blockReason = await this.resolveApplyBlockReason(userId, post);
    if (blockReason) {
      return { canApply: false, blockReason };
    }

    const captainSnapshot = this.parsePersonaSnapshot(post.captainPersonaSnapshot);
    const applicantProfile = await this.odysseyIntake.getProfile(userId);
    if (!captainSnapshot || !applicantProfile) {
      return { canApply: false, blockReason: '无法计算匹配信息' };
    }

    const applicantSnapshot = await this.buildCaptainSnapshot(userId, applicantProfile);
    const teamworkStyle = post.planningStyle as TeamworkStyle | null;

    const [captainCtx, applicantCtx] = await Promise.all([
      loadUserCredentialsContext(this.prisma, this.reputationOs, post.captainUserId, {
        teamworkStyleCapsule: resolveTeamworkStyleCapsule(teamworkStyle),
      }),
      loadUserCredentialsContext(this.prisma, this.reputationOs, userId),
    ]);

    if (captainCtx.fulfillmentBlocked) {
      return {
        canApply: false,
        blockReason: '该招募发起者履约背书未达平台安全阈值，暂不可申请。',
      };
    }

    const scriptId = resolveRecruitmentScriptIdFromSnapshot(post.captainPersonaSnapshot);
    const fitnessBaseline = await this.loadTrekkingFitnessBaseline(userId);
    const physicalFitnessGate = evaluatePhysicalFitnessHardGate({
      scriptId,
      applicant: fitnessBaseline,
    });
    if (physicalFitnessGate.blocked) {
      return {
        canApply: false,
        blockReason: physicalFitnessGate.blockReason ?? '体能与路线物理强度不匹配',
        physicalFitnessGate,
      };
    }

    const vibePayload = readVibePayloadFromSnapshot(captainSnapshot);
    const vibeGate = evaluateVibeHardGates(vibePayload, applicantCtx.credentials);
    if (vibeGate.blocked) {
      return { canApply: false, blockReason: vibeGate.reason ?? '未满足招募 AI 门槛' };
    }

    if (failsTeamworkStyleHardGate(teamworkStyle, applicantSnapshot)) {
      return {
        canApply: false,
        blockReason:
          '该招募为「一起随便玩」即兴模式，与你的强计划型人格存在责任边界冲突，系统不予推荐申请。',
        teamworkMatchBlocked: true,
      };
    }

    const applicantTripMeta = await this.odysseyIntake.getTripMeta(userId);

    const insights = buildApplicationMatchInsights(
      captainSnapshot,
      applicantSnapshot,
      teamworkStyle,
      {
        captain: captainCtx.socialProfile,
        viewer: applicantCtx.socialProfile,
      },
      {
        captainTrip:
          post.startDate && post.endDate
            ? {
                destination: post.destination,
                startDate: this.formatDate(post.startDate as Date | string),
                endDate: this.formatDate(post.endDate as Date | string),
              }
            : null,
        viewerTrip: applicantTripMeta
          ? {
              destination: applicantTripMeta.destination,
              startDate: applicantTripMeta.startDate,
              endDate: applicantTripMeta.endDate,
            }
          : null,
        captainCredentials: captainCtx.credentials,
        viewerCredentials: applicantCtx.credentials,
      },
    );
    const conflictPrompt = detectPlanningConflict(captainSnapshot, applicantSnapshot);
    const teamworkCommitmentPrompt = detectTeamworkCommitmentPrompt(teamworkStyle);

    const physicalSurvivalQuiz =
      scriptId && isPremiumTrekkingScriptId(scriptId) && physicalFitnessGate.routeTier != null && physicalFitnessGate.routeTier >= 4
        ? pickSurvivalQuizForScript(scriptId).map((q) => ({
            id: q.id,
            prompt: q.prompt,
            options: q.options.map((o) => ({ id: o.id, label: o.label })),
          }))
        : undefined;

    return {
      canApply: true,
      conflictPrompt,
      teamworkCommitmentPrompt,
      vibeBehavioralContracts: vibePayload?.behavioral_contracts.map((c) => ({
        title: c.title,
        clauses: c.clauses,
      })),
      physicalFitnessGate,
      physicalSurvivalQuiz,
      teamworkMatchBlocked: false,
      compatibilityPercent: insights.compatibilityPercent,
      matchInsightDrawer: insights.matchInsightDrawer ?? null,
      structuralMatch: insights.structuralMatch ?? null,
      highlights: insights.highlights,
      warnings: insights.warnings,
    };
  }

  async createApplication(
    userId: string,
    postId: string,
    dto: CreateRecruitmentApplicationDto,
  ) {
    await this.assertQuizComplete(userId);

    const post = await this.findPostOrThrow(postId);
    const blockReason = await this.resolveApplyBlockReason(userId, post);
    if (blockReason) {
      throw new BadRequestException(blockReason);
    }

    const captainSnapshot = this.parsePersonaSnapshot(post.captainPersonaSnapshot);
    const applicantProfile = await this.odysseyIntake.getProfile(userId);
    if (!captainSnapshot || !applicantProfile) {
      throw new BadRequestException('无法提交申请');
    }

    const applicantSnapshot = await this.buildCaptainSnapshot(userId, applicantProfile);
    const teamworkStyle = post.planningStyle as TeamworkStyle | null;

    const [captainCtx, applicantCtx] = await Promise.all([
      loadUserCredentialsContext(this.prisma, this.reputationOs, post.captainUserId, {
        teamworkStyleCapsule: resolveTeamworkStyleCapsule(teamworkStyle),
      }),
      loadUserCredentialsContext(this.prisma, this.reputationOs, userId),
    ]);

    if (captainCtx.fulfillmentBlocked) {
      throw new BadRequestException('该招募发起者履约背书未达平台安全阈值，无法提交申请');
    }

    const scriptId = resolveRecruitmentScriptIdFromSnapshot(post.captainPersonaSnapshot);
    const fitnessBaseline = await this.loadTrekkingFitnessBaseline(userId);
    const physicalGate = evaluatePhysicalFitnessHardGate({ scriptId, applicant: fitnessBaseline });
    if (physicalGate.blocked) {
      throw new BadRequestException(
        physicalGate.blockReason ?? '体能与路线物理强度不匹配，无法提交申请',
      );
    }

    if (scriptId && isPremiumTrekkingScriptId(scriptId) && physicalGate.routeTier != null && physicalGate.routeTier >= 4) {
      const quizItems = pickSurvivalQuizForScript(scriptId);
      const quizAnswers =
        dto.physicalSurvivalQuizAnswers ?? dto.physical_survival_quiz_answers ?? {};
      const graded = gradeSurvivalQuizAnswers(quizItems, quizAnswers);
      if (!graded.passed) {
        throw new BadRequestException(
          '户外生存常识校验未通过，请复习 LNT / 涉水 / 失温 Plan B 后再申请',
        );
      }
    }

    if (failsTeamworkStyleHardGate(teamworkStyle, applicantSnapshot)) {
      throw new BadRequestException(
        '该招募为「一起随便玩」即兴模式，与你的强计划型人格存在责任边界冲突，无法提交申请',
      );
    }

    const conflictPrompt = detectPlanningConflict(captainSnapshot, applicantSnapshot);
    const teamworkCommitmentPrompt = detectTeamworkCommitmentPrompt(teamworkStyle);
    const planningAccepted = dto.planningCommitmentAccepted === true;
    const teamworkAccepted = dto.teamworkCommitmentAccepted === true;

    if (conflictPrompt && !planningAccepted) {
      throw new BadRequestException(conflictPrompt.message);
    }
    if (teamworkCommitmentPrompt && !teamworkAccepted) {
      throw new BadRequestException(teamworkCommitmentPrompt.message);
    }

    const applicantTripMeta = await this.odysseyIntake.getTripMeta(userId);

    const insights = buildApplicationMatchInsights(
      captainSnapshot,
      applicantSnapshot,
      teamworkStyle,
      {
        captain: captainCtx.socialProfile,
        viewer: applicantCtx.socialProfile,
      },
      {
        captainTrip:
          post.startDate && post.endDate
            ? {
                destination: post.destination,
                startDate: this.formatDate(post.startDate as Date | string),
                endDate: this.formatDate(post.endDate as Date | string),
              }
            : null,
        viewerTrip: applicantTripMeta
          ? {
              destination: applicantTripMeta.destination,
              startDate: applicantTripMeta.startDate,
              endDate: applicantTripMeta.endDate,
            }
          : null,
        captainCredentials: captainCtx.credentials,
        viewerCredentials: applicantCtx.credentials,
      },
    );

    const slotIndexInput = dto.targetSlotIndex ?? dto.target_slot_index;
    const slotIdInput = dto.targetSlotId ?? dto.target_slot_id;
    const slotLabelInput = (dto.targetSlotLabel ?? dto.target_slot_label)?.trim() || null;
    const memberSlotCount = post.slotsNeeded;
    let targetSlotIndex: number | null = null;
    let targetSlotId: string | null = null;
    let targetSlotLabel: string | null = null;

    if (slotIndexInput != null || slotIdInput?.trim()) {
      const resolved = resolveApplicationTargetSlot({
        targetSlotIndex: slotIndexInput,
        targetSlotId: slotIdInput,
        memberSlotCount,
        vibeSlotIds: extractVibeSlotIdsFromPost(post),
      });
      if (!resolved) {
        throw new BadRequestException('目标拼图槽位无效，请传 teamPuzzle.slots[].slotIndex 或 slotId');
      }

      const filled = readTeamPuzzleFilledSlots(post.captainPersonaSnapshot);
      const pendingApps = await this.prisma.matchSquareRecruitmentApplication.findMany({
        where: { postId, status: 'pending' },
        select: { targetSlotIndex: true },
      });
      const occupied = listOccupiedSlotIndexes(filled, pendingApps);
      if (occupied.has(resolved.slotIndex)) {
        throw new BadRequestException(`拼图位 ${resolved.slotIndex} 已被占用或已有待审申请`);
      }

      targetSlotIndex = resolved.slotIndex;
      targetSlotId = resolved.slotId;
      const puzzlePreview = buildTeamPuzzle(post, null);
      targetSlotLabel =
        slotLabelInput ?? resolveRoleLabelForSlot(puzzlePreview.slots, resolved.slotIndex);
    }

    const applicantIdentity = resolveApplicantIdentityFields({
      row: {
        applicantDisplayName: null,
        applicantCardTitle: applicantProfile.card.title,
        applicantInteractionMode: applicantSnapshot.interactionMode,
        applicantPersonaSnapshot: applicantSnapshot,
        targetSlotLabel,
      },
      profileCardTitle: applicantProfile.card.title,
      credentialsCtx: applicantCtx,
    });

    const application = await this.prisma.matchSquareRecruitmentApplication.create({
      data: {
        postId,
        applicantUserId: userId,
        status: 'pending',
        message: dto.message.trim(),
        planningCommitmentAccepted: planningAccepted,
        teamworkCommitmentAccepted: teamworkAccepted,
        targetSlotIndex,
        targetSlotId,
        targetSlotLabel,
        applicantDisplayName: applicantIdentity.applicantDisplayName,
        applicantMbtiType: applicantProfile.mbtiType,
        applicantCardTitle: applicantIdentity.applicantCardTitle,
        applicantInteractionMode: applicantSnapshot.interactionMode,
        applicantReputationStars: applicantSnapshot.reputationStars ?? null,
        applicantPersonaSnapshot: applicantSnapshot as unknown as Prisma.InputJsonValue,
        compatibilityPercent: insights.compatibilityPercent ?? 1,
        matchHighlights: insights.highlights,
        matchWarnings: insights.warnings,
      },
    });

    const decisionBrief = buildApplicationDecisionBrief({
      post,
      applicantSnapshot,
      hardMetricsPass: (insights.compatibilityPercent ?? 0) >= 50,
      physicalFitnessReport: physicalGate.report,
    });
    void this.collabFlywheelAudit?.recordPrediction({
      recruitmentPostId: postId,
      applicationId: application.id,
      brief: decisionBrief,
    });

    return {
      application: toRecruitmentApplicationCardView(application, applicantIdentity),
    };
  }

  async listPostApplications(
    captainUserId: string,
    postId: string,
    query: ListPostApplicationsQueryDto,
  ) {
    const post = await this.findCaptainPostOrThrow(captainUserId, postId);

    const status = query.status ?? 'pending';
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const where: Prisma.MatchSquareRecruitmentApplicationWhereInput = {
      postId,
      status,
    };

    const [rows, total] = await Promise.all([
      this.prisma.matchSquareRecruitmentApplication.findMany({
        where,
        orderBy: [{ compatibilityPercent: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.matchSquareRecruitmentApplication.count({ where }),
    ]);

    const identityByAppId = await this.resolveApplicantIdentitiesForRows(rows);

    const applications = await Promise.all(
      rows.map(async (row) => {
        const card = toRecruitmentApplicationCardView(row, identityByAppId.get(row.id));
        const [stars, safetyWarning] = await Promise.all([
          this.reputationOs.getAverageStars(row.applicantUserId),
          this.reputationOs.getSafetyWarning(row.applicantUserId),
        ]);
        const applicantSnapshot = row.applicantPersonaSnapshot as unknown as CaptainPersonaSnapshot | null;
        const fitnessBaseline = await this.loadTrekkingFitnessBaseline(row.applicantUserId);
        const scriptId = resolveRecruitmentScriptIdFromSnapshot(post.captainPersonaSnapshot);
        const physicalGate = evaluatePhysicalFitnessHardGate({
          scriptId,
          applicant: fitnessBaseline,
        });
        const decisionBrief = buildApplicationDecisionBrief({
          post,
          applicantSnapshot,
          hardMetricsPass:
            typeof row.compatibilityPercent === 'number' && row.compatibilityPercent >= 50,
          physicalFitnessReport: physicalGate.report,
        });
        return {
          ...card,
          applicantReputationStars: stars,
          safetyWarning,
          decisionBrief,
          physicalFitnessReport: physicalGate.report,
        };
      }),
    );

    return {
      applications,
      pagination: { total, limit, offset },
    };
  }

  async decideApplication(
    captainUserId: string,
    postId: string,
    applicationId: string,
    dto: DecideRecruitmentApplicationDto,
  ) {
    await this.findCaptainPostOrThrow(captainUserId, postId);

    const application = await this.prisma.matchSquareRecruitmentApplication.findFirst({
      where: { id: applicationId, postId },
    });
    if (!application) {
      throw new NotFoundException('申请不存在');
    }
    if (application.status !== 'pending') {
      throw new BadRequestException('该申请已处理');
    }

    const now = new Date();

    if (dto.action === 'reject') {
      const updated = await this.prisma.matchSquareRecruitmentApplication.update({
        where: { id: applicationId },
        data: { status: 'rejected', decidedAt: now },
      });
      const identityByAppId = await this.resolveApplicantIdentitiesForRows([updated]);
      return {
        application: toRecruitmentApplicationCardView(updated, identityByAppId.get(updated.id)),
      };
    }

    const post = await this.findPostOrThrow(postId);
    if (post.slotsFilled >= post.slotsNeeded) {
      throw new BadRequestException('队伍已满员');
    }

    const memberSlotCount = post.slotsNeeded;
    const filled = readTeamPuzzleFilledSlots(post.captainPersonaSnapshot);
    const occupied = listOccupiedSlotIndexes(filled, []);
    const puzzlePreview = buildTeamPuzzle(post, null);

    let slotIndex = application.targetSlotIndex;
    let slotId = application.targetSlotId;

    if (slotIndex != null) {
      if (slotIndex < 1 || slotIndex > memberSlotCount) {
        throw new BadRequestException('申请绑定的拼图槽位无效');
      }
      if (occupied.has(slotIndex)) {
        throw new BadRequestException(`拼图位 ${slotIndex} 已被占用`);
      }
      slotId = slotId ?? buildPuzzleSlotId(slotIndex);
    } else {
      const fallbackIndex = findFirstOpenMemberSlotIndex(memberSlotCount, occupied);
      if (fallbackIndex == null) {
        throw new BadRequestException('无可用拼图位');
      }
      slotIndex = fallbackIndex;
      slotId = buildPuzzleSlotId(fallbackIndex);
    }

    const roleLabel =
      application.targetSlotLabel ??
      resolveRoleLabelForSlot(puzzlePreview.slots, slotIndex);

    const identityByAppId = await this.resolveApplicantIdentitiesForRows([application]);
    const identity = identityByAppId.get(application.id);
    if (!identity) {
      throw new BadRequestException('无法解析申请人身份信息');
    }
    const hydratedApplication: MatchSquareRecruitmentApplication = {
      ...application,
      applicantDisplayName: identity.applicantDisplayName,
      applicantCardTitle: identity.applicantCardTitle,
    };

    const filledRecord = buildFilledSlotRecord({
      slotIndex,
      slotId,
      application: hydratedApplication,
      at: now.toISOString(),
    });

    const prevSnapshot =
      post.captainPersonaSnapshot && typeof post.captainPersonaSnapshot === 'object'
        ? (post.captainPersonaSnapshot as Record<string, unknown>)
        : {};
    const nextSnapshot = appendFilledSlotToSnapshot(prevSnapshot, filledRecord);

    const [updatedApplication, updatedPost] = await this.prisma.$transaction([
      this.prisma.matchSquareRecruitmentApplication.update({
        where: { id: applicationId },
        data: {
          status: 'approved',
          decidedAt: now,
          targetSlotIndex: slotIndex,
          targetSlotId: slotId,
          targetSlotLabel: roleLabel,
        },
      }),
      this.prisma.matchSquareRecruitmentPost.update({
        where: { id: postId },
        data: {
          slotsFilled: { increment: 1 },
          captainPersonaSnapshot: nextSnapshot as Prisma.InputJsonValue,
          ...(post.slotsFilled + 1 >= post.slotsNeeded
            ? { status: 'closed', closedAt: now }
            : {}),
        },
      }),
    ]);

    const sealed = updatedPost.slotsFilled >= updatedPost.slotsNeeded;
    if (sealed) {
      void this.tripInstantiationService.tryAutoInstantiateOnSeal(post.captainUserId, postId);
    }

    const captainCtx = await loadUserCredentialsContext(
      this.prisma,
      this.reputationOs,
      updatedPost.captainUserId,
      { teamworkStyleCapsule: resolveTeamworkStyleCapsule(updatedPost.planningStyle) },
    );

    return {
      application: toRecruitmentApplicationCardView(updatedApplication, identity),
      teamPuzzle: await this.buildEnrichedTeamPuzzle(updatedPost, null, {
        captainDisplayName: captainCtx.verifiedCredentials.headline.displayName,
      }),
    };
  }

  async getMyTravelIntent(userId: string): Promise<{ intent: TravelIntentView | null }> {
    await this.assertQuizComplete(userId);
    const row = await this.prisma.matchSquareTravelIntent.findUnique({ where: { userId } });
    return { intent: row ? this.toTravelIntentView(row) : null };
  }

  async upsertTravelIntent(userId: string, dto: UpsertTravelIntentDto) {
    await this.assertQuizComplete(userId);

    const profile = await this.odysseyIntake.getProfile(userId);
    if (!profile) {
      throw new ForbiddenException('请先完成旅行人格测评');
    }

    const input = normalizeUpsertTravelIntentInput(dto);
    const startDate = this.parseDate(input.startDate, 'startDate');
    const endDate = this.parseDate(input.endDate, 'endDate');
    if (endDate < startDate) {
      throw new BadRequestException('结束时间必须大于或等于出发时间');
    }

    const snapshot = await this.buildCaptainSnapshot(userId, profile);
    const capabilityTags = deriveCapabilityTags(profile);

    const data = {
      status: 'active',
      destinationScope: input.destinationScope,
      startDate,
      endDate,
      budgetFlex: input.budgetFlex,
      openToCarpool: input.openToCarpool,
      note: input.note,
      capabilityTags: capabilityTags as unknown as Prisma.InputJsonValue,
      personaSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    };

    const row = await this.prisma.matchSquareTravelIntent.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    return { intent: this.toTravelIntentView(row) };
  }

  async updateTravelIntentStatus(userId: string, dto: UpdateTravelIntentStatusDto) {
    await this.assertQuizComplete(userId);
    const row = await this.prisma.matchSquareTravelIntent.findUnique({ where: { userId } });
    if (!row) {
      throw new NotFoundException('尚未挂起旅行意向');
    }

    const updated = await this.prisma.matchSquareTravelIntent.update({
      where: { userId },
      data: { status: dto.status },
    });

    return { intent: this.toTravelIntentView(updated) };
  }

  async getCaptainRadar(captainUserId: string, postId: string): Promise<CaptainRadarView> {
    const post = await this.findCaptainPostOrThrow(captainUserId, postId);
    return this.buildCaptainRadar(post);
  }

  async sendOliveBranch(captainUserId: string, postId: string, dto: SendOliveBranchDto) {
    const post = await this.findCaptainPostOrThrow(captainUserId, postId);

    if (post.status !== 'active') {
      throw new BadRequestException('仅进行中的招募可投递橄榄枝');
    }
    if (post.slotsFilled >= post.slotsNeeded) {
      throw new BadRequestException('队伍已满员');
    }
    if (dto.inviteeUserId === captainUserId) {
      throw new BadRequestException('不能邀请自己');
    }

    const intent = await this.prisma.matchSquareTravelIntent.findUnique({
      where: { userId: dto.inviteeUserId },
    });
    if (!intent || intent.status !== 'active') {
      throw new BadRequestException('该用户未挂起有效旅行意向');
    }

    const radar = await this.buildCaptainRadar(post);
    const pick = radar.picks.find((p) => p.userId === dto.inviteeUserId);
    if (!pick) {
      throw new BadRequestException('该用户与当前招募匹配度未达到橄榄枝阈值');
    }

    const existing = await this.prisma.matchSquareOliveBranchInvitation.findUnique({
      where: { postId_inviteeUserId: { postId, inviteeUserId: dto.inviteeUserId } },
    });
    if (existing && existing.status === 'pending') {
      throw new BadRequestException('已向该用户发送过待处理橄榄枝');
    }

    const invitation = await this.prisma.matchSquareOliveBranchInvitation.upsert({
      where: { postId_inviteeUserId: { postId, inviteeUserId: dto.inviteeUserId } },
      create: {
        postId,
        captainUserId,
        inviteeUserId: dto.inviteeUserId,
        compatibilityPercent: pick.compatibilityPercent,
        inviteMessage: dto.inviteMessage?.trim() ?? null,
        radarHighlights: pick.highlights as unknown as Prisma.InputJsonValue,
        status: 'pending',
      },
      update: {
        captainUserId,
        compatibilityPercent: pick.compatibilityPercent,
        inviteMessage: dto.inviteMessage?.trim() ?? null,
        radarHighlights: pick.highlights as unknown as Prisma.InputJsonValue,
        status: 'pending',
        respondedAt: null,
      },
      include: { post: true },
    });

    return {
      invitation: this.toOliveBranchView(invitation, invitation.post),
    };
  }

  async listMyOliveBranchInvitations(userId: string) {
    await this.assertQuizComplete(userId);

    const rows = await this.prisma.matchSquareOliveBranchInvitation.findMany({
      where: { inviteeUserId: userId, status: 'pending' },
      include: { post: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      invitations: rows.map((row) => this.toOliveBranchView(row, row.post)),
    };
  }

  async respondOliveBranch(userId: string, invitationId: string, dto: RespondOliveBranchDto) {
    await this.assertQuizComplete(userId);

    const invitation = await this.prisma.matchSquareOliveBranchInvitation.findUnique({
      where: { id: invitationId },
      include: { post: true },
    });
    if (!invitation || invitation.inviteeUserId !== userId) {
      throw new NotFoundException('邀请不存在');
    }
    if (invitation.status !== 'pending') {
      throw new BadRequestException('该邀请已处理');
    }

    const now = new Date();
    const status = dto.action === 'accept' ? 'accepted' : 'declined';

    const updated = await this.prisma.matchSquareOliveBranchInvitation.update({
      where: { id: invitationId },
      data: { status, respondedAt: now },
      include: { post: true },
    });

    return {
      invitation: this.toOliveBranchView(updated, updated.post),
      nextAction: dto.action === 'accept' ? 'view_post_and_apply' : null,
      postId: updated.postId,
    };
  }

  private async buildCaptainRadar(post: MatchSquareRecruitmentPost): Promise<CaptainRadarView> {
    const thresholdPercent = 85;
    const intents = await this.prisma.matchSquareTravelIntent.findMany({
      where: { status: 'active' },
      take: 500,
    });

    const picks = rankCaptainRadarPicks(post, intents);
    const topName = picks[0]?.displayName;
    const systemHint =
      picks.length > 0
        ? `系统雷达发现 ${picks.length} 位极度契合你路线的自由旅伴${
            topName ? `，其中「${topName}」匹配度最高` : ''
          }，要主动邀请加入吗？`
        : null;

    return {
      postId: post.id,
      thresholdPercent,
      eligibleCount: picks.length,
      picks,
      systemHint,
    };
  }

  private toTravelIntentView(row: {
    id: string;
    status: string;
    destinationScope: string;
    startDate: Date;
    endDate: Date;
    budgetFlex: string;
    openToCarpool: boolean;
    note: string | null;
    capabilityTags: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): TravelIntentView {
    return {
      id: row.id,
      status: row.status as TravelIntentView['status'],
      destinationScope: row.destinationScope,
      startDate: this.formatDate(row.startDate),
      endDate: this.formatDate(row.endDate),
      budgetFlex: row.budgetFlex as TravelIntentView['budgetFlex'],
      openToCarpool: row.openToCarpool,
      note: row.note,
      capabilityTags: Array.isArray(row.capabilityTags) ? (row.capabilityTags as string[]) : [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toOliveBranchView(
    row: {
      id: string;
      postId: string;
      status: string;
      captainUserId: string;
      inviteeUserId: string;
      compatibilityPercent: number;
      inviteMessage: string | null;
      radarHighlights: unknown;
      createdAt: Date;
      respondedAt: Date | null;
    },
    post: MatchSquareRecruitmentPost,
  ): OliveBranchInvitationView {
    const highlights = Array.isArray(row.radarHighlights) ? (row.radarHighlights as string[]) : [];
    const captainTitle = post.captainCardTitle;

    return {
      id: row.id,
      postId: row.postId,
      status: row.status as OliveBranchInvitationView['status'],
      captainUserId: row.captainUserId,
      captainCardTitle: captainTitle,
      inviteeUserId: row.inviteeUserId,
      compatibilityPercent: row.compatibilityPercent,
      inviteMessage: row.inviteMessage,
      radarHighlights: highlights,
      postDestination: post.destination,
      postStartDate: this.formatDate(post.startDate),
      postEndDate: this.formatDate(post.endDate),
      notificationTitle: `「${post.destination}」的队长 ${captainTitle} 被你的旅行人格吸引`,
      notificationBody: `邀请你查看 Day 1 - Day ${Math.max(1, Math.ceil((post.endDate.getTime() - post.startDate.getTime()) / 86400000))} 详细行程并考虑加入。`,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
    };
  }

  async listMyApplications(userId: string, query: ListMyApplicationsQueryDto) {
    await this.assertQuizComplete(userId);

    const statusFilter = query.status ?? 'all';
    const where: Prisma.MatchSquareRecruitmentApplicationWhereInput = {
      applicantUserId: userId,
      ...(statusFilter === 'all' ? {} : { status: statusFilter }),
    };

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.matchSquareRecruitmentApplication.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.matchSquareRecruitmentApplication.count({ where }),
    ]);

    return {
      applications: await this.enrichApplicationCardViews(rows),
      pagination: { total, limit, offset },
    };
  }

  private async enrichApplicationCardViews(rows: MatchSquareRecruitmentApplication[]) {
    const identityByAppId = await this.resolveApplicantIdentitiesForRows(rows);
    return rows.map((row) =>
      toRecruitmentApplicationCardView(row, identityByAppId.get(row.id)),
    );
  }

  private async resolveApplicantIdentitiesForRows(
    rows: MatchSquareRecruitmentApplication[],
  ): Promise<Map<string, ResolvedApplicantIdentity>> {
    if (rows.length === 0) return new Map();

    const userIds = [...new Set(rows.map((r) => r.applicantUserId))];
    const [credBatch, profilePairs] = await Promise.all([
      loadCredentialsContextBatch(this.prisma, this.reputationOs, userIds),
      Promise.all(
        userIds.map(async (id) => ({
          id,
          profile: await this.odysseyIntake.getProfile(id),
        })),
      ),
    ]);
    const profileByUserId = new Map(profilePairs.map((p) => [p.id, p.profile]));

    const result = new Map<string, ResolvedApplicantIdentity>();
    for (const row of rows) {
      const ctx = credBatch.get(row.applicantUserId);
      if (!ctx) continue;
      result.set(
        row.id,
        resolveApplicantIdentityFields({
          row,
          profileCardTitle: profileByUserId.get(row.applicantUserId)?.card?.title ?? null,
          credentialsCtx: ctx,
        }),
      );
    }
    return result;
  }

  private async buildEnrichedTeamPuzzle(
    post: MatchSquareRecruitmentPost,
    viewer: MatchableProfile | null,
    options?: { captainDisplayName?: string | null },
  ): Promise<TeamPuzzleView> {
    const puzzle = buildTeamPuzzle(post, viewer, {
      captainDisplayName: options?.captainDisplayName ?? null,
    });
    const filled = readTeamPuzzleFilledSlots(post.captainPersonaSnapshot);
    const memberIds = filled?.slots.map((s) => s.userId) ?? [];
    if (memberIds.length === 0) {
      return enrichTeamPuzzleWithIdentities({
        post,
        puzzle,
        captainDisplayName: options?.captainDisplayName ?? null,
        memberIdentities: new Map(),
      });
    }

    const [credBatch, approvedApps, profilePairs] = await Promise.all([
      loadCredentialsContextBatch(this.prisma, this.reputationOs, memberIds),
      this.prisma.matchSquareRecruitmentApplication.findMany({
        where: { postId: post.id, applicantUserId: { in: memberIds }, status: 'approved' },
      }),
      Promise.all(
        memberIds.map(async (id) => ({
          id,
          profile: await this.odysseyIntake.getProfile(id),
        })),
      ),
    ]);
    const profileByUserId = new Map(profilePairs.map((p) => [p.id, p.profile]));
    const appByUserId = new Map(approvedApps.map((a) => [a.applicantUserId, a]));

    const memberIdentities = new Map<
      string,
      Pick<ResolvedApplicantIdentity, 'applicantDisplayName' | 'applicantCardTitle'>
    >();
    for (const uid of memberIds) {
      const app = appByUserId.get(uid);
      const ctx = credBatch.get(uid);
      if (!app || !ctx) continue;
      const resolved = resolveApplicantIdentityFields({
        row: app,
        profileCardTitle: profileByUserId.get(uid)?.card?.title ?? null,
        credentialsCtx: ctx,
      });
      memberIdentities.set(uid, {
        applicantDisplayName: resolved.applicantDisplayName,
        applicantCardTitle: resolved.applicantCardTitle,
      });
    }

    return enrichTeamPuzzleWithIdentities({
      post,
      puzzle,
      captainDisplayName: options?.captainDisplayName ?? null,
      memberIdentities,
    });
  }

  private buildListWhere(
    query: ListRecruitmentPostsQueryDto,
    status: RecruitmentPostStatus,
  ): Prisma.MatchSquareRecruitmentPostWhereInput {
    const where: Prisma.MatchSquareRecruitmentPostWhereInput = { status };

    if (query.destination?.trim()) {
      where.destination = { contains: query.destination.trim(), mode: 'insensitive' };
    }

    if (query.dateFrom || query.dateTo) {
      const dateFrom = query.dateFrom ? this.parseDate(query.dateFrom, 'dateFrom') : undefined;
      const dateTo = query.dateTo ? this.parseDate(query.dateTo, 'dateTo') : undefined;
      if (dateFrom) {
        where.endDate = { gte: dateFrom };
      }
      if (dateTo) {
        where.startDate = { lte: dateTo };
      }
    }

    const personaTypes = this.splitCsv(query.personaTypes);
    if (personaTypes.length > 0) {
      where.captainMbtiType = { in: personaTypes.map((t) => t.toUpperCase()) };
    }

    const interactionModes = this.splitCsv(query.interactionModes);
    if (interactionModes.length > 0) {
      where.captainInteractionMode = { in: interactionModes };
    }

    const planningStyles = this.splitCsv(query.planningStyles);
    if (planningStyles.length > 0) {
      where.planningStyle = { in: planningStyles };
    }

    return where;
  }

  /** personaQuadrants 需基于 MBTI 映射，Prisma 无法直接过滤 */
  private applyClientSideFilters(
    rows: MatchSquareRecruitmentPost[],
    query: ListRecruitmentPostsQueryDto,
  ): MatchSquareRecruitmentPost[] {
    const quadrants = this.splitCsv(query.personaQuadrants) as Array<
      'NT' | 'NF' | 'SP' | 'SJ'
    >;
    if (quadrants.length === 0) return rows;

    return rows.filter((post) => mbtiMatchesQuadrantFilter(post.captainMbtiType, quadrants));
  }

  private async buildCaptainSnapshot(
    userId: string,
    profile: OdysseyIntakeProfile,
  ): Promise<CaptainPersonaSnapshot> {
    const interaction = deriveInteractionMode(profile.rawScores, profile.dimensionPercents);
    const reputation = await this.readReputationStars(userId);

    return {
      mbtiType: profile.mbtiType,
      cardTitle: profile.card.title,
      interactionMode: interaction.id,
      interactionModeLabel: interaction.label,
      quadrant: resolveMbtiQuadrant(profile.mbtiType),
      rawScores: profile.rawScores,
      dimensionPercents: profile.dimensionPercents,
      reputationStars: reputation,
    };
  }

  private async readReputationStars(userId: string): Promise<number | null> {
    return this.reputationOs.getAverageStars(userId);
  }

  private parsePersonaSnapshot(raw: unknown): CaptainPersonaSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    return raw as CaptainPersonaSnapshot;
  }

  private async readApplicantDisplayName(userId: string): Promise<string | null> {
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const ext = row?.extendedProfile as Record<string, unknown> | null;
    const trust = ext?.odyssey_trust as OdysseyTrustVerification | undefined;
    return trust?.displayName ?? null;
  }

  private async resolveApplyBlockReason(
    userId: string,
    post: MatchSquareRecruitmentPost,
  ): Promise<string | null> {
    if (post.captainUserId === userId) {
      return '不能申请自己发起的招募帖';
    }
    if (post.status !== 'active') {
      return '该招募帖当前不可申请';
    }
    if (post.slotsFilled >= post.slotsNeeded) {
      return '该队伍已满员';
    }

    const pending = await this.prisma.matchSquareRecruitmentApplication.findFirst({
      where: { postId: post.id, applicantUserId: userId, status: 'pending' },
    });
    if (pending) {
      return '你已提交过申请，请等待队长审批';
    }

    return null;
  }

  private async loadViewerProfile(userId?: string): Promise<MatchableProfile | null> {
    if (!userId) return null;

    const profile = await this.odysseyIntake.getProfile(userId);
    if (!profile) return null;

    const tripMeta = await this.odysseyIntake.getTripMeta(userId);

    return {
      userId,
      mbtiType: profile.mbtiType,
      cardTitle: profile.card.title,
      rawScores: profile.rawScores,
      dimensionPercents: profile.dimensionPercents,
      destination: tripMeta?.destination,
      startDate: tripMeta?.startDate,
      endDate: tripMeta?.endDate,
    };
  }

  private async isQuizComplete(userId: string): Promise<boolean> {
    const profile = await this.odysseyIntake.getProfile(userId);
    if (!profile?.completedAt) return false;
    if (profile.version === 2) {
      return Boolean(profile.premiumStressAnswers && profile.mbtiSource === 'self_selected');
    }
    return true;
  }

  private async assertQuizComplete(userId: string): Promise<void> {
    if (!(await this.isQuizComplete(userId))) {
      throw new ForbiddenException('请先完成旅行人格测评后再使用搭子广场');
    }
  }

  private async loadTrekkingFitnessBaseline(userId: string): Promise<TrekkingFitnessBaseline> {
    return this.trekkingFitnessBaseline.resolveForUser(userId);
  }

  private validateWritableFields(fields: WritablePostFields): void {
    const start = this.parseDate(fields.startDate, 'startDate');
    const end = this.parseDate(fields.endDate, 'endDate');

    if (end < start) {
      throw new BadRequestException('结束时间必须大于或等于出发时间');
    }

    const today = this.startOfTodayUtc();
    if (start < today) {
      throw new BadRequestException('出发时间不能早于当前日期');
    }

    if (
      fields.budgetMinCents != null &&
      fields.budgetMaxCents != null &&
      fields.budgetMaxCents < fields.budgetMinCents
    ) {
      throw new BadRequestException('预算上限不能小于下限');
    }

    if (fields.travelMode === 'self_drive' && !fields.vehicleInfo?.trim()) {
      throw new BadRequestException('自驾出行时必须填写车辆信息（车型与剩余座位）');
    }
  }

  private async findPostOrThrow(postId: string): Promise<MatchSquareRecruitmentPost> {
    assertValidPostId(postId);
    const post = await this.prisma.matchSquareRecruitmentPost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('招募帖不存在');
    }
    return post;
  }

  private async findCaptainPostOrThrow(
    userId: string,
    postId: string,
  ): Promise<MatchSquareRecruitmentPost> {
    const post = await this.findPostOrThrow(postId);
    if (post.captainUserId !== userId) {
      throw new ForbiddenException('仅队长可管理此招募帖');
    }
    return post;
  }

  private parseDate(value: string, field: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} 格式必须为 YYYY-MM-DD`);
    }
    const d = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} 无效`);
    }
    return d;
  }

  private formatDate(d: Date | string): string {
    if (typeof d === 'string') return d.slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  private startOfTodayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private splitCsv(value?: string): string[] {
    if (!value?.trim()) return [];
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
}
