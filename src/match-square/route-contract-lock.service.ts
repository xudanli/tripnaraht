import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PreferenceEvolutionService } from '../agent/services/preference-evolution.service';
import {
  applyMilestoneOrderRollback,
  applyVaultMilestoneAuthorization,
  buildRouteContractLockView,
  normalizeRouteContractLockMetadata,
} from './engine/route-contract-lock.engine';
import type {
  RouteContractLockMetadata,
  RouteContractLockMutationResultView,
  RouteContractLockView,
} from './types/route-contract-lock.types';

@Injectable()
export class RouteContractLockService {
  private readonly logger = new Logger(RouteContractLockService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
  ) {}

  async getRouteContractLock(userId: string, tripId: string): Promise<RouteContractLockView> {
    const ctx = await this.loadContext(userId, tripId);
    return this.buildView(ctx);
  }

  async authorizeVaultMilestones(
    userId: string,
    tripId: string,
    input?: { milestoneId?: string },
  ): Promise<RouteContractLockMutationResultView> {
    const ctx = await this.loadContext(userId, tripId);
    const lock = normalizeRouteContractLockMetadata(
      (ctx.trip.metadata as Record<string, unknown>)?.routeContractLock,
    );
    if (!lock) {
      throw new NotFoundException('该行程无 Route Contract Lock');
    }

    let result;
    try {
      result = applyVaultMilestoneAuthorization({
        lock,
        actorUserId: userId,
        requiredAuthorizations: ctx.requiredAuthorizations,
        milestoneId: input?.milestoneId ?? null,
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    await this.persistLock(tripId, ctx.trip.metadata, result.lock);

    const dnaScheduled = this.scheduleDna(tripId, result.dnaUserIds, result.lock.locked);

    this.logger.log(
      `Vault authorize trip=${tripId} user=${userId} locked=${result.lock.locked} dna=${dnaScheduled}`,
    );

    return {
      tripId,
      lock: buildRouteContractLockView({
        lock: result.lock,
        viewerUserId: ctx.userId,
        viewerRole: ctx.role,
        planningStyle: ctx.planningStyle,
        requiredAuthorizations: ctx.requiredAuthorizations,
      }),
      event: result.event,
      dnaScheduled,
    };
  }

  async reorderVaultMilestones(
    userId: string,
    tripId: string,
    input: { milestoneIds: string[]; note?: string },
  ): Promise<RouteContractLockMutationResultView> {
    const ctx = await this.loadContext(userId, tripId);
    if (ctx.role !== 'captain') {
      throw new ForbiddenException('仅队长可调整里程碑顺序');
    }

    const lock = normalizeRouteContractLockMetadata(
      (ctx.trip.metadata as Record<string, unknown>)?.routeContractLock,
    );
    if (!lock) {
      throw new NotFoundException('该行程无 Route Contract Lock');
    }

    let result;
    try {
      result = applyMilestoneOrderRollback({
        lock,
        actorUserId: userId,
        actorRole: ctx.role,
        planningStyle: ctx.planningStyle,
        milestoneIds: input.milestoneIds,
        note: input.note ?? null,
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    await this.persistLock(tripId, ctx.trip.metadata, result.lock);

    return {
      tripId,
      lock: buildRouteContractLockView({
        lock: result.lock,
        viewerUserId: ctx.userId,
        viewerRole: ctx.role,
        planningStyle: ctx.planningStyle,
        requiredAuthorizations: ctx.requiredAuthorizations,
      }),
      event: result.event,
      dnaScheduled: false,
    };
  }

  private buildView(ctx: Awaited<ReturnType<typeof this.loadContext>>): RouteContractLockView {
    const lock = normalizeRouteContractLockMetadata(
      (ctx.trip.metadata as Record<string, unknown>)?.routeContractLock,
    );
    if (!lock) {
      throw new NotFoundException('该行程无 Route Contract Lock');
    }
    return buildRouteContractLockView({
      lock,
      viewerUserId: ctx.userId,
      viewerRole: ctx.role,
      planningStyle: ctx.planningStyle,
      requiredAuthorizations: ctx.requiredAuthorizations,
    });
  }

  private async loadContext(userId: string, tripId: string) {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('您不是该行程协作者');
    }

    const [trip, memberCount] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { id: true, metadata: true },
      }),
      this.prisma.tripCollaborator.count({ where: { tripId } }),
    ]);

    if (!trip) {
      throw new NotFoundException('行程不存在');
    }

    const role = collaborator.role === 'OWNER' ? ('captain' as const) : ('member' as const);
    const planningStyle = await this.resolvePlanningStyle(trip.metadata);

    return {
      userId,
      trip,
      role,
      planningStyle,
      requiredAuthorizations: Math.max(1, memberCount),
    };
  }

  private async resolvePlanningStyle(metadata: unknown): Promise<string | null> {
    if (!metadata || typeof metadata !== 'object') return null;
    const inst = (metadata as Record<string, unknown>).matchSquareInstantiation;
    if (!inst || typeof inst !== 'object') return null;
    const postId = (inst as Record<string, unknown>).recruitmentPostId;
    if (typeof postId !== 'string') return null;

    const post = await this.prisma.matchSquareRecruitmentPost.findUnique({
      where: { id: postId },
      select: { planningStyle: true },
    });
    return post?.planningStyle ?? null;
  }

  private async persistLock(
    tripId: string,
    metadata: unknown,
    lock: RouteContractLockMetadata,
  ): Promise<void> {
    const prev =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>)
        : {};

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: { ...prev, routeContractLock: lock } as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  private scheduleDna(tripId: string, userIds: string[], sealed: boolean): boolean {
    if (!this.preferenceEvolution || !sealed) return false;
    for (const uid of new Set(userIds)) {
      this.preferenceEvolution.scheduleDecisionDnaSync({
        userId: uid,
        tripId,
        reason: 'NEGOTIATION_CONFIRMED',
      });
    }
    return true;
  }
}
