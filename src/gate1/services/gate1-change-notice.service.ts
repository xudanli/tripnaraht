import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AckChangeNoticeDto,
  CreateChangeNoticeDto,
} from '../dto/gate1.dto';
import {
  GATE1_CHANGE_SEVERITIES,
  GATE1_PLAN_B_COHORTS,
} from '../constants/gate1.constants';
import { Gate1AnalyticsService, Gate1GuardService } from './gate1-support.services';
import { Gate1ParticipantService } from './gate1-participant.service';
import { Gate1ParticipantNotificationService } from './gate1-participant-notification.service';

@Injectable()
export class Gate1ChangeNoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guard: Gate1GuardService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly participants: Gate1ParticipantService,
    private readonly notifications: Gate1ParticipantNotificationService,
  ) {}

  async publish(projectId: string, actorId: string, dto: CreateChangeNoticeDto) {
    const project = await this.guard.requireProject(projectId);
    if (!GATE1_PLAN_B_COHORTS.includes(project.cohort as (typeof GATE1_PLAN_B_COHORTS)[number])) {
      throw new BadRequestException(`Change notices not applicable for cohort ${project.cohort}`);
    }

    if (!GATE1_CHANGE_SEVERITIES.includes(dto.severity as (typeof GATE1_CHANGE_SEVERITIES)[number])) {
      throw new BadRequestException(`Invalid severity: ${dto.severity}`);
    }

    if (dto.planBId) {
      const planB = await this.prisma.gate1PlanB.findFirst({
        where: { id: dto.planBId, projectId },
      });
      if (!planB) throw new BadRequestException('planBId must belong to this project');
    }
    if (dto.travelEventId) {
      const event = await this.prisma.gate1TravelEvent.findFirst({
        where: { id: dto.travelEventId, projectId },
      });
      if (!event) throw new BadRequestException('travelEventId must belong to this project');
    }

    const notice = await this.prisma.gate1ChangeNotice.create({
      data: {
        projectId,
        severity: dto.severity,
        title: dto.title,
        whatHappened: dto.whatHappened,
        impactSummary: dto.impactSummary ?? null,
        actionRequired: dto.actionRequired ?? null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        planBId: dto.planBId ?? null,
        travelEventId: dto.travelEventId ?? null,
        requiresAck: dto.requiresAck ?? true,
        createdBy: actorId,
      },
    });

    await this.analytics.track(projectId, project.cohort, 'change_notice_sent', {
      actorId,
      properties: { noticeId: notice.id, severity: dto.severity },
    });

    await this.notifications.notifyProjectParticipants(projectId, {
      eventType: 'change_notice_sent',
      dedupeKey: `change:${notice.id}`,
      title: dto.severity === 'HIGH' || dto.severity === 'EMERGENCY' ? `【重要】${dto.title}` : dto.title,
      body: `${dto.whatHappened}\n\n${dto.actionRequired ?? '请登录成员门户查看并确认。'}`,
    });

    return notice;
  }

  async createFromPlanBTrigger(projectId: string, planBId: string, actorId: string) {
    const planB = await this.prisma.gate1PlanB.findFirst({
      where: { id: planBId, projectId },
    });
    if (!planB) return null;

    return this.publish(projectId, actorId, {
      severity: 'HIGH',
      title: `Plan B 已触发：${planB.riskTitle}`,
      whatHappened: planB.riskDescription ?? planB.triggerCondition,
      impactSummary: planB.impactSummary ?? planB.alternativeSummary,
      actionRequired: '请查看替代方案并确认您的安排',
      deadline: planB.latestDecisionAt?.toISOString(),
      planBId: planB.id,
      requiresAck: true,
    });
  }

  async createFromTravelEvent(projectId: string, travelEventId: string, actorId: string) {
    const event = await this.prisma.gate1TravelEvent.findFirst({
      where: { id: travelEventId, projectId },
    });
    if (!event) return null;

    const severity = event.eventType === 'INCIDENT' ? 'HIGH' : 'MEDIUM';
    return this.publish(projectId, actorId, {
      severity,
      title: event.title,
      whatHappened: event.description ?? event.title,
      impactSummary: event.result,
      actionRequired: '请确认是否影响您的行程',
      travelEventId: event.id,
      requiresAck: true,
    });
  }

  async listForParticipant(token: string) {
    const participant = await this.participants.resolveByToken(token);
    const notices = await this.prisma.gate1ChangeNotice.findMany({
      where: { projectId: participant.projectId },
      orderBy: { publishedAt: 'desc' },
      include: {
        acks: { where: { participantId: participant.id }, take: 1 },
        planB: {
          select: {
            id: true,
            label: true,
            alternativeSummary: true,
            costSummary: true,
          },
        },
      },
    });

    return notices.map((n) => ({
      id: n.id,
      severity: n.severity,
      title: n.title,
      whatHappened: n.whatHappened,
      impactSummary: n.impactSummary,
      actionRequired: n.actionRequired,
      deadline: n.deadline,
      publishedAt: n.publishedAt,
      requiresAck: n.requiresAck,
      acknowledged: n.acks.length > 0,
      acknowledgedAt: n.acks[0]?.acknowledgedAt ?? null,
      planB: n.planB,
    }));
  }

  async getNotice(token: string, noticeId: string) {
    const participant = await this.participants.resolveByToken(token);
    const notice = await this.prisma.gate1ChangeNotice.findFirst({
      where: { id: noticeId, projectId: participant.projectId },
      include: {
        acks: { where: { participantId: participant.id } },
        planB: true,
      },
    });
    if (!notice) throw new NotFoundException('Change notice not found');
    return {
      ...notice,
      acknowledged: notice.acks.length > 0,
    };
  }

  async acknowledge(token: string, noticeId: string, dto: AckChangeNoticeDto) {
    const participant = await this.participants.resolveByToken(token);
    const notice = await this.prisma.gate1ChangeNotice.findFirst({
      where: { id: noticeId, projectId: participant.projectId },
    });
    if (!notice) throw new NotFoundException('Change notice not found');

    const ack = await this.prisma.gate1ChangeNoticeAck.upsert({
      where: {
        changeNoticeId_participantId: {
          changeNoticeId: noticeId,
          participantId: participant.id,
        },
      },
      create: {
        changeNoticeId: noticeId,
        participantId: participant.id,
        helpRequested: dto.helpRequested ?? false,
      },
      update: {
        acknowledgedAt: new Date(),
        helpRequested: dto.helpRequested ?? false,
      },
    });

    const project = await this.guard.requireProject(participant.projectId);
    const responseTimeMs = Date.now() - notice.publishedAt.getTime();
    await this.analytics.track(participant.projectId, project.cohort, 'change_notice_acknowledged', {
      participantId: participant.id,
      properties: {
        noticeId,
        severity: notice.severity,
        responseTimeMs,
        helpRequested: dto.helpRequested ?? false,
      },
    });

    if (dto.helpRequested) {
      await this.analytics.track(participant.projectId, project.cohort, 'change_notice_help_requested', {
        participantId: participant.id,
        properties: { noticeId },
      });
    }

    return ack;
  }
}
