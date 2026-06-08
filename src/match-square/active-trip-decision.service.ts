import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PreferenceEvolutionService } from '../agent/services/preference-evolution.service';
import {
  applyRouteRollbackDecisionEvent,
  emptyActiveTripDecisionLoop,
  readActiveTripDecisionLoopFromMetadata,
} from './engine/route-rollback-decision.engine';
import type {
  ActiveTripDecisionEventResultView,
  ActiveTripDecisionStateView,
  RouteRollbackAction,
  TripDecisionEventType,
} from './types/active-trip-decision.types';

@Injectable()
export class ActiveTripDecisionService {
  private readonly logger = new Logger(ActiveTripDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
  ) {}

  async getDecisionState(userId: string, tripId: string): Promise<ActiveTripDecisionStateView> {
    const trip = await this.loadTripForCollaborator(userId, tripId);
    const loop = readActiveTripDecisionLoopFromMetadata(trip.metadata) ?? emptyActiveTripDecisionLoop();

    return {
      tripId,
      loop,
      pendingRollback: loop.pendingRollback,
      eventLog: loop.eventLog,
    };
  }

  async recordDecisionEvent(
    userId: string,
    tripId: string,
    input: {
      type: TripDecisionEventType;
      action: RouteRollbackAction;
      planBRef?: string;
      milestoneId?: string;
      evidenceRefs?: string[];
      note?: string;
    },
  ): Promise<ActiveTripDecisionEventResultView> {
    if (input.type !== 'route_rollback') {
      throw new BadRequestException(`暂不支持的决策事件类型: ${input.type}`);
    }

    const trip = await this.loadTripForCollaborator(userId, tripId);
    const actorRole = await this.resolveActorRole(tripId, userId);
    const memberCount = await this.countMemberCollaborators(tripId);

    const loop =
      readActiveTripDecisionLoopFromMetadata(trip.metadata) ?? emptyActiveTripDecisionLoop();

    let result;
    try {
      result = applyRouteRollbackDecisionEvent({
        loop,
        action: input.action,
        actorUserId: userId,
        actorRole,
        memberCollaboratorCount: memberCount,
        planBRef: input.planBRef,
        milestoneId: input.milestoneId ?? null,
        evidenceRefs: input.evidenceRefs,
        note: input.note ?? null,
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const prevMeta =
      trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
        ? (trip.metadata as Record<string, unknown>)
        : {};

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: {
          ...prevMeta,
          activeTripDecisionLoop: result.loop,
        },
        updatedAt: new Date(),
      },
    });

    const dnaScheduled = this.scheduleDnaSync(tripId, result.dnaReasons, result.notifyUserIds);

    this.logger.log(
      `Decision event trip=${tripId} type=${input.type} action=${input.action} actor=${userId} dna=${dnaScheduled}`,
    );

    return {
      tripId,
      type: input.type,
      action: input.action,
      pendingRollback: result.pendingRollback,
      event: result.event,
      dnaScheduled,
      awaitingMemberConfirmations: result.awaitingMemberConfirmations,
    };
  }

  private async loadTripForCollaborator(userId: string, tripId: string) {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });
    if (!collaborator) {
      throw new ForbiddenException('您不是该行程协作者');
    }

    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }
    return trip;
  }

  private async resolveActorRole(
    tripId: string,
    userId: string,
  ): Promise<'captain' | 'member'> {
    const collaborator = await this.prisma.tripCollaborator.findUnique({
      where: { tripId_userId: { tripId, userId } },
      select: { role: true },
    });
    if (collaborator?.role === 'OWNER') return 'captain';
    return 'member';
  }

  private async countMemberCollaborators(tripId: string): Promise<number> {
    return this.prisma.tripCollaborator.count({
      where: { tripId, role: { not: 'OWNER' } },
    });
  }

  private scheduleDnaSync(
    tripId: string,
    reasons: Array<'NEGOTIATION_CONFIRMED' | 'NEGOTIATION_ROLLED_BACK'>,
    userIds: string[],
  ): boolean {
    if (!this.preferenceEvolution || reasons.length === 0) return false;

    for (const uid of new Set(userIds)) {
      if (!uid || uid === 'system') continue;
      for (const reason of reasons) {
        this.preferenceEvolution.scheduleDecisionDnaSync({ userId: uid, tripId, reason });
      }
    }
    return true;
  }
}
