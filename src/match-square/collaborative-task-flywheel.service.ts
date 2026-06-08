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
import { TrekkingFitnessBackflowService } from './trekking-fitness-backflow.service';
import {
  applyCollaborativeTaskBehaviorEvent,
  readCollaborativeTaskFlywheelFromMetadata,
} from './engine/collaborative-task-behavior.engine';
import type {
  CollaborativeTaskBehaviorAction,
  CollaborativeTaskEventResultView,
  CollaborativeTaskListView,
} from './types/recruitment-task-flywheel.types';

@Injectable()
export class CollaborativeTaskFlywheelService {
  private readonly logger = new Logger(CollaborativeTaskFlywheelService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
    @Optional() private readonly trekkingFitnessBackflow?: TrekkingFitnessBackflowService,
  ) {}

  async listCollaborativeTasks(userId: string, tripId: string): Promise<CollaborativeTaskListView> {
    const trip = await this.loadTripForCollaborator(userId, tripId);
    const flywheel = readCollaborativeTaskFlywheelFromMetadata(trip.metadata);
    if (!flywheel) {
      throw new NotFoundException('该行程暂无协同任务飞轮（需先完成 Match Square 成团实例化）');
    }

    return {
      tripId,
      flywheel: {
        version: flywheel.version,
        recruitmentPostId: flywheel.recruitmentPostId,
        tasks: flywheel.tasks,
        dispatchedAt: flywheel.dispatchedAt,
      },
      tasks: flywheel.tasks,
      behaviorLog: (flywheel.behaviorLog ?? []).map((e) => ({
        eventId: e.eventId,
        taskId: e.taskId,
        action: e.action,
        actorUserId: e.actorUserId,
        at: e.at,
        note: e.note,
        revisionCountAfter: e.revisionCountAfter,
        responseLatencyMs: e.responseLatencyMs ?? null,
      })),
    };
  }

  async recordCollaborativeTaskEvent(
    userId: string,
    tripId: string,
    taskId: string,
    input: {
      action: CollaborativeTaskBehaviorAction;
      note?: string;
      evidenceRefs?: string[];
      fitnessSubjectUserId?: string;
    },
  ): Promise<CollaborativeTaskEventResultView> {
    const trip = await this.loadTripForCollaborator(userId, tripId);
    const actorRole = await this.resolveActorRole(tripId, userId);

    const flywheel = readCollaborativeTaskFlywheelFromMetadata(trip.metadata);
    if (!flywheel) {
      throw new NotFoundException('该行程暂无协同任务飞轮');
    }

    let result;
    try {
      result = applyCollaborativeTaskBehaviorEvent({
        plan: flywheel,
        taskId,
        action: input.action,
        actorUserId: userId,
        actorRole,
        note: input.note ?? null,
        evidenceRefs: input.evidenceRefs,
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'TASK_NOT_FOUND') {
        throw new NotFoundException('协同任务不存在');
      }
      throw new BadRequestException(message);
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
          collaborativeTaskFlywheel: result.plan,
        },
        updatedAt: new Date(),
      },
    });

    const dnaScheduled = this.scheduleTaskDnaSync(tripId, result.dnaReasons, result.notifyUserIds);

    if (
      input.action === 'rollback' &&
      input.fitnessSubjectUserId?.trim() &&
      this.trekkingFitnessBackflow
    ) {
      void this.trekkingFitnessBackflow
        .recordPhysicalFailureEvent({
          tripId,
          subjectUserId: input.fitnessSubjectUserId.trim(),
          reporterUserId: userId,
          eventType: 'member_fitness_collapse',
          evidenceLabel: input.note ?? `协同任务 ${taskId} rollback`,
        })
        .catch((e) =>
          this.logger.warn(
            `体能负反馈联动失败 trip=${tripId} subject=${input.fitnessSubjectUserId}: ${(e as Error).message}`,
          ),
        );
    }

    this.logger.log(
      `Task event trip=${tripId} task=${taskId} action=${input.action} actor=${userId} dna=${dnaScheduled}`,
    );

    return {
      tripId,
      task: result.task,
      event: {
        eventId: result.event.eventId,
        taskId: result.event.taskId,
        action: result.event.action,
        actorUserId: result.event.actorUserId,
        at: result.event.at,
        note: result.event.note,
        revisionCountAfter: result.event.revisionCountAfter,
        responseLatencyMs: result.event.responseLatencyMs ?? null,
      },
      dnaScheduled,
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

  private scheduleTaskDnaSync(
    tripId: string,
    reasons: Array<'TASK_CHAIN_CONFIRMED' | 'TASK_CHAIN_ROLLED_BACK' | 'TASK_CHAIN_TIMEOUT'>,
    userIds: string[],
  ): boolean {
    if (!this.preferenceEvolution || reasons.length === 0) return false;

    for (const uid of new Set(userIds)) {
      if (!uid) continue;
      for (const reason of reasons) {
        this.preferenceEvolution.scheduleDecisionDnaSync({ userId: uid, tripId, reason });
      }
    }
    return true;
  }
}
