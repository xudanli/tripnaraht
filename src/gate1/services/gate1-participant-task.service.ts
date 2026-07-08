import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateParticipantTaskDto,
  CompleteParticipantTaskDto,
  WaiveParticipantTaskDto,
} from '../dto/gate1.dto';
import {
  GATE1_PARTICIPANT_TASK_CATEGORIES,
  GATE1_READINESS_COHORTS,
} from '../constants/gate1.constants';
import { asInputJson } from '../utils/prisma-json.util';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1ParticipantService } from './gate1-participant.service';

@Injectable()
export class Gate1ParticipantTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly participants: Gate1ParticipantService,
  ) {}

  private assertReadinessCohort(cohort: string) {
    if (!GATE1_READINESS_COHORTS.includes(cohort as (typeof GATE1_READINESS_COHORTS)[number])) {
      throw new BadRequestException(
        `Participant readiness tasks not applicable for cohort ${cohort}`,
      );
    }
  }

  async createTask(projectId: string, actorId: string, dto: CreateParticipantTaskDto) {
    const project = await this.guard.requireProject(projectId);
    this.assertReadinessCohort(project.cohort);

    const participant = await this.prisma.gate1Participant.findFirst({
      where: { id: dto.participantId, projectId },
    });
    if (!participant) throw new NotFoundException('Participant not found in project');

    if (
      !GATE1_PARTICIPANT_TASK_CATEGORIES.includes(
        dto.category as (typeof GATE1_PARTICIPANT_TASK_CATEGORIES)[number],
      )
    ) {
      throw new BadRequestException(`Invalid task category: ${dto.category}`);
    }

    const task = await this.prisma.gate1ParticipantTask.create({
      data: {
        projectId,
        participantId: dto.participantId,
        taskType: dto.taskType ?? 'READINESS',
        category: dto.category,
        title: dto.title,
        description: dto.description ?? null,
        priority: dto.priority ?? (dto.blocking ? 'P0' : 'P1'),
        blocking: dto.blocking ?? false,
        mandatory: dto.mandatory ?? true,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        status: 'NOT_STARTED',
      },
    });

    await this.analytics.track(projectId, project.cohort, 'readiness_task_assigned', {
      actorId,
      participantId: dto.participantId,
      properties: { taskId: task.id, category: dto.category, blocking: task.blocking },
    });

    return task;
  }

  async waiveTask(projectId: string, taskId: string, actorId: string, dto: WaiveParticipantTaskDto) {
    const task = await this.prisma.gate1ParticipantTask.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.mandatory) {
      throw new BadRequestException('Mandatory tasks (legal/visa/safety) cannot be waived without policy');
    }
    if (task.status === 'COMPLETED') {
      throw new BadRequestException('Completed tasks cannot be waived');
    }

    const project = await this.guard.requireProject(projectId);
    const updated = await this.prisma.gate1ParticipantTask.update({
      where: { id: taskId },
      data: {
        status: 'WAIVED',
        waivedAt: new Date(),
        waivedBy: actorId,
        waiveReason: dto.reason,
      },
    });

    await this.analytics.track(projectId, project.cohort, 'readiness_task_waived', {
      actorId,
      participantId: task.participantId,
      properties: { taskId, reason: dto.reason },
    });

    return updated;
  }

  async listForParticipant(token: string) {
    const participant = await this.participants.resolveByToken(token);
    const project = await this.guard.requireProject(participant.projectId);
    this.assertReadinessCohort(project.cohort);

    return this.prisma.gate1ParticipantTask.findMany({
      where: { participantId: participant.id },
      orderBy: [{ blocking: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async completeTask(token: string, taskId: string, dto: CompleteParticipantTaskDto) {
    const participant = await this.participants.resolveByToken(token);
    const task = await this.prisma.gate1ParticipantTask.findFirst({
      where: { id: taskId, participantId: participant.id },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.status === 'WAIVED') {
      throw new BadRequestException('Task already waived');
    }

    const updated = await this.prisma.gate1ParticipantTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        evidence: dto.evidence ? asInputJson(dto.evidence) : (task.evidence === null ? undefined : task.evidence),
      },
    });

    const project = await this.guard.requireProject(participant.projectId);
    await this.analytics.track(participant.projectId, project.cohort, 'readiness_task_completed', {
      participantId: participant.id,
      properties: {
        taskId,
        taskType: task.category,
        blocking: task.blocking,
        late: task.dueAt ? task.dueAt < new Date() : false,
      },
    });

    return updated;
  }

  async getProjectBlockingAggregate(projectId: string) {
    const blocking = await this.prisma.gate1ParticipantTask.count({
      where: {
        projectId,
        blocking: true,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'WAITING'] },
      },
    });
    return { blockingTaskCount: blocking };
  }
}
