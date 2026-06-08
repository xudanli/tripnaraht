import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { MatchSquareRecruitmentPost, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RouteDirectionsService } from '../route-directions/route-directions.service';
import { PreferenceEvolutionService } from '../agent/services/preference-evolution.service';
import { TrekkingSpawnService } from './trekking-spawn.service';
import {
  attachTripInstantiationResultSnapshot,
  buildTripInstantiationPlan,
  readTripInstantiationResultFromSnapshot,
} from './engine/trip-instantiation.engine';
import { ROUTE_TEMPLATE_INTENT_CATALOG } from './config/route-template-intent-bindings.config';
import type {
  TripInstantiationPlan,
  TripInstantiationPreviewView,
  TripInstantiationResultView,
  TripInstantiationStrategy,
} from './types/trip-instantiation.types';
import { createInitialRouteContractLock } from './engine/route-contract-lock.engine';
import { assertValidPostId } from './util/post-id.util';
import {
  buildCollaborativeTaskPreviewForPost,
} from './util/recruitment-task-flywheel.util';
import { CollabFlywheelAuditService } from './observability/collaborative-flywheel-audit.service';
import { buildInstantiationGenerationProgress } from '../trips/utils/match-square-trip-content.util';

@Injectable()
export class TripInstantiationService {
  private readonly logger = new Logger(TripInstantiationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeDirections: RouteDirectionsService,
    private readonly trekkingSpawn: TrekkingSpawnService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
    @Optional() private readonly collabFlywheelAudit?: CollabFlywheelAuditService,
  ) {}

  async previewInstantiationFromPost(
    userId: string,
    postId: string,
  ): Promise<TripInstantiationPreviewView> {
    const { post, plan, existingResult } = await this.loadInstantiationContext(userId, postId);
    let canInstantiate = plan.canInstantiate;
    let blockReason = plan.blockReason;

    if (existingResult) {
      canInstantiate = false;
      blockReason = `已激活 Active Trip ${existingResult.tripId}`;
    }

    return {
      status: 'preview',
      plan: { ...plan, canInstantiate, blockReason },
      existingResult,
      collaborativeTaskPreview: buildCollaborativeTaskPreviewForPost({
        post,
        plan: { ...plan, canInstantiate, blockReason },
        approvedApplications: await this.prisma.matchSquareRecruitmentApplication.findMany({
          where: { postId, status: 'approved' },
          select: {
            id: true,
            applicantUserId: true,
            applicantDisplayName: true,
            applicantCardTitle: true,
            applicantPersonaSnapshot: true,
          },
        }),
      }),
    };
  }

  async instantiateTripFromRecruitmentPost(
    userId: string,
    postId: string,
    input?: { skipIfExists?: boolean },
  ): Promise<TripInstantiationResultView> {
    const { post, plan, existingResult } = await this.loadInstantiationContext(userId, postId);

    if (existingResult) {
      if (input?.skipIfExists) return existingResult;
      throw new BadRequestException(`已激活 Active Trip ${existingResult.tripId}`);
    }

    if (!plan.canInstantiate) {
      throw new BadRequestException(plan.blockReason ?? '当前无法实例化 Active Trip');
    }

    const tripId = await this.executeStrategy(userId, post, plan);
    await this.ensureCrewCollaborators(tripId, plan.crew);
    const taskPreview = buildCollaborativeTaskPreviewForPost({
      post,
      plan,
      approvedApplications: await this.prisma.matchSquareRecruitmentApplication.findMany({
        where: { postId, status: 'approved' },
        select: {
          id: true,
          applicantUserId: true,
          applicantDisplayName: true,
          applicantCardTitle: true,
          applicantPersonaSnapshot: true,
        },
      }),
    });
    await this.mergeInstantiationMetadata(tripId, post, plan, taskPreview.plan);
    await this.writeContentDeliveryProgress(tripId, plan.strategy);

    const dnaScheduled = this.scheduleGroupDnaSync(userId, tripId);

    const result: TripInstantiationResultView = {
      status: 'instantiated',
      postId,
      tripId,
      plan,
      instantiatedAt: new Date().toISOString(),
      blockReason: null,
      activeTripPath: `/trips/${tripId}/active`,
    };

    await this.persistInstantiationOnPost(postId, post.captainPersonaSnapshot, result);

    void this.collabFlywheelAudit?.linkTripToRecruitmentPost(postId, tripId);

    this.logger.log(
      `Instantiated Active Trip post=${postId} trip=${tripId} strategy=${plan.strategy} dna=${dnaScheduled}`,
    );

    return result;
  }

  /** 成团 sealed 后异步触发（失败只记日志，不影响 approve） */
  async tryAutoInstantiateOnSeal(captainUserId: string, postId: string): Promise<void> {
    try {
      await this.instantiateTripFromRecruitmentPost(captainUserId, postId, { skipIfExists: true });
    } catch (error) {
      this.logger.warn(
        `Auto instantiate skipped/failed post=${postId}: ${(error as Error).message}`,
      );
    }
  }

  private async executeStrategy(
    userId: string,
    post: MatchSquareRecruitmentPost,
    plan: TripInstantiationPlan,
  ): Promise<string> {
    switch (plan.strategy) {
      case 'reuse_trekking_spawn':
        if (!plan.existingTripId) {
          throw new BadRequestException('缺少已 spawn 的 tripId');
        }
        return plan.existingTripId;

      case 'trekking_spawn': {
        const spawn = await this.trekkingSpawn.spawnTripFromRecruitmentPost(userId, post.id);
        return spawn.tripId;
      }

      case 'route_template': {
        const fromTemplate = await this.tryCreateFromRouteTemplate(userId, post, plan);
        if (fromTemplate) return fromTemplate;
        return this.createMinimalTrip(userId, post, plan);
      }

      case 'minimal_trip':
      default:
        return this.createMinimalTrip(userId, post, plan);
    }
  }

  private async tryCreateFromRouteTemplate(
    userId: string,
    post: MatchSquareRecruitmentPost,
    plan: TripInstantiationPlan,
  ): Promise<string | null> {
    if (!plan.routeDirectionName) return null;

    const routeDirection = await this.prisma.routeDirection.findFirst({
      where: { name: plan.routeDirectionName },
      select: { id: true, countryCode: true },
    });
    if (!routeDirection) return null;

    const durationDays = plan.routeTemplateDurationDays ?? this.inferDurationDays(post);
    let template = await this.routeDirections.findRouteTemplateByDirectionAndDuration(
      routeDirection.id,
      durationDays,
    );
    if (!template) {
      const templates = await this.routeDirections.findRouteTemplates({
        routeDirectionId: routeDirection.id,
        isActive: true,
        limit: 1,
      });
      template = templates[0] ?? null;
    }
    if (!template) return null;

    try {
      const created = await this.routeDirections.createTripFromTemplate(
        template.id,
        {
          destination: (routeDirection.countryCode ?? this.inferCountryCode(post)).toUpperCase(),
          startDate: this.formatDate(post.startDate),
          endDate: this.formatDate(post.endDate),
          totalBudget: post.budgetMaxCents ? post.budgetMaxCents / 100 : undefined,
          name: `${post.destination} · ${plan.routeTemplateCatalogId ?? 'Match Square'}`,
        },
        userId,
      );
      return created?.trip?.id ?? created?.id ?? null;
    } catch (error) {
      this.logger.warn(
        `createTripFromTemplate failed post=${post.id}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async createMinimalTrip(
    userId: string,
    post: MatchSquareRecruitmentPost,
    plan: TripInstantiationPlan,
  ): Promise<string> {
    const tripId = randomUUID();
    const startDate = post.startDate;
    const endDate = post.endDate;
    const durationDays = Math.max(
      1,
      Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: `${post.destination} · 搭子车队`,
          destination: this.inferCountryCode(post),
          startDate,
          endDate,
          status: 'PLANNING',
          metadata: {
            matchSquareRecruitmentPostId: post.id,
            instantiationStrategy: plan.strategy,
          },
          updatedAt: new Date(),
        },
      });

      for (let i = 0; i < durationDays; i++) {
        await tx.tripDay.create({
          data: {
            id: randomUUID(),
            tripId,
            date: new Date(startDate.getTime() + i * 86400000),
          },
        });
      }

      await tx.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId,
          userId,
          role: 'OWNER',
          updatedAt: new Date(),
        },
      });
    });

    return tripId;
  }

  private async ensureCrewCollaborators(
    tripId: string,
    crew: TripInstantiationPlan['crew'],
  ): Promise<void> {
    for (const member of crew) {
      if (member.role === 'captain') continue;
      await this.prisma.tripCollaborator.upsert({
        where: { tripId_userId: { tripId, userId: member.userId } },
        create: {
          id: randomUUID(),
          tripId,
          userId: member.userId,
          role: 'MEMBER',
          updatedAt: new Date(),
        },
        update: { updatedAt: new Date() },
      });
    }
  }

  private async mergeInstantiationMetadata(
    tripId: string,
    post: MatchSquareRecruitmentPost,
    plan: TripInstantiationPlan,
    collaborativeTaskPlan?: import('./types/recruitment-task-flywheel.types').CollaborativeTaskDispatchPlan,
  ): Promise<void> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    if (!trip) return;

    const prev =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};

    const catalogEntry = plan.routeTemplateCatalogId
      ? ROUTE_TEMPLATE_INTENT_CATALOG.find((e) => e.catalogId === plan.routeTemplateCatalogId)
      : null;

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...prev,
          matchSquareInstantiation: {
            version: plan.version,
            recruitmentPostId: post.id,
            strategy: plan.strategy,
            catalogId: plan.routeTemplateCatalogId,
            routeDirectionName: plan.routeDirectionName,
            recruitmentScriptId: plan.recruitmentScriptId,
            vibeChipIds: plan.vibeChipIds,
            contextualCardIds: plan.contextualCardIds,
            vaultMilestoneIds: plan.vaultMilestoneIds,
            toolchainIds: plan.toolchainIds,
            crewUserIds: plan.crew.map((c) => c.userId),
            sealedAt: post.closedAt?.toISOString() ?? new Date().toISOString(),
          },
          routeContractLock: catalogEntry?.vaultMilestoneIds?.length
            ? createInitialRouteContractLock([...catalogEntry.vaultMilestoneIds])
            : prev.routeContractLock,
          collaborativeTaskFlywheel: collaborativeTaskPlan ?? undefined,
        } as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  /** 搭子实例化不走路径 NL generateDraftAsync；显式标记内容交付态，避免前端无限等待 POI */
  private async writeContentDeliveryProgress(
    tripId: string,
    strategy: TripInstantiationStrategy,
  ): Promise<void> {
    try {
      const itemCount = await this.prisma.itineraryItem.count({
        where: { TripDay: { tripId } },
      });
      const generationProgress = buildInstantiationGenerationProgress(strategy, itemCount);

      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return;

      const prev =
        trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
          ? (trip.metadata as Record<string, unknown>)
          : {};

      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...prev,
            generationProgress,
          } as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `writeContentDeliveryProgress failed trip=${tripId}: ${(error as Error).message}`,
      );
    }
  }

  private scheduleGroupDnaSync(captainUserId: string, tripId: string): boolean {
    if (!this.preferenceEvolution) return false;
    this.preferenceEvolution.scheduleDecisionDnaSync({
      userId: captainUserId,
      tripId,
      reason: 'TREK_VIBE_CONFIRMED',
    });
    return true;
  }

  private async persistInstantiationOnPost(
    postId: string,
    snapshotRaw: unknown,
    result: TripInstantiationResultView,
  ): Promise<void> {
    const snapshot =
      snapshotRaw && typeof snapshotRaw === 'object'
        ? (snapshotRaw as Record<string, unknown>)
        : {};
    const nextSnapshot = attachTripInstantiationResultSnapshot(snapshot, result);

    await this.prisma.matchSquareRecruitmentPost.update({
      where: { id: postId },
      data: { captainPersonaSnapshot: nextSnapshot as object },
    });
  }

  private async loadInstantiationContext(userId: string, postId: string) {
    const post = await this.loadCaptainPost(userId, postId);
    const approvedApplications = await this.prisma.matchSquareRecruitmentApplication.findMany({
      where: { postId, status: 'approved' },
      select: { id: true, applicantUserId: true },
    });

    const plan = buildTripInstantiationPlan({ post, approvedApplications });
    const existingResult = readTripInstantiationResultFromSnapshot(post.captainPersonaSnapshot);

    return { post, plan, existingResult, approvedApplications };
  }

  private async loadCaptainPost(
    userId: string,
    postId: string,
  ): Promise<MatchSquareRecruitmentPost> {
    assertValidPostId(postId);
    const post = await this.prisma.matchSquareRecruitmentPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('招募帖不存在');
    if (post.captainUserId !== userId) {
      throw new ForbiddenException('仅队长可实例化 Active Trip');
    }
    return post;
  }

  private inferCountryCode(post: MatchSquareRecruitmentPost): string {
    const dest = post.destination.trim();
    if (/冰岛|Iceland|IS/i.test(dest)) return 'IS';
    if (/^IS$/i.test(dest)) return 'IS';
    return 'CN';
  }

  private inferDurationDays(post: MatchSquareRecruitmentPost): number {
    return Math.max(
      1,
      Math.round((post.endDate.getTime() - post.startDate.getTime()) / 86400000) + 1,
    );
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
