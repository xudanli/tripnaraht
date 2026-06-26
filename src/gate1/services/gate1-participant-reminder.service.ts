import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Gate1AnalyticsService } from './gate1-support.services';
import { Gate1ParticipantNotificationService } from './gate1-participant-notification.service';
import { buildPortalPath } from '../utils/gate1-project-fit-bridge.util';
import {
  bumpProposalReminderMeta,
  canSendAdvisorInitiatedReminder,
  GATE1_PREFERENCE_REMINDER,
  shouldSendPreferenceReminder,
  shouldSendProposalFeedbackReminder,
} from '../utils/gate1-reminder.util';
import { asInputJson } from '../utils/prisma-json.util';

@Injectable()
export class Gate1ParticipantReminderService {
  private readonly logger = new Logger(Gate1ParticipantReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly notifications: Gate1ParticipantNotificationService,
  ) {}

  async runAll(): Promise<{
    preference: { sent: number; scanned: number };
    proposalFeedback: { sent: number; scanned: number };
  }> {
    const preference = await this.sendPreferenceIncompleteReminders();
    const proposalFeedback = await this.sendProposalFeedbackReminders();
    return { preference, proposalFeedback };
  }

  async sendPreferenceIncompleteReminders(): Promise<{ sent: number; scanned: number }> {
    const participants = await this.prisma.gate1Participant.findMany({
      where: {
        status: { in: ['CONSENTED', 'IN_PROGRESS', 'JOINED'] },
        reminderCount: { lt: GATE1_PREFERENCE_REMINDER.maxCount },
        consentedAt: { not: null },
      },
      include: {
        project: { select: { id: true, title: true, cohort: true, experimentStatus: true } },
      },
    });

    let sent = 0;
    const now = new Date();

    for (const participant of participants) {
      if (['WITHDRAWN', 'COMPLETED'].includes(participant.project.experimentStatus)) {
        continue;
      }

      if (!shouldSendPreferenceReminder(participant, now)) {
        continue;
      }

      const portalPath = buildPortalPath(participant.inviteToken);
      const attempt = participant.reminderCount + 1;
      const result = await this.notifications.queueAndSend({
        eventType: 'preference_incomplete_reminder',
        dedupeKey: `pref-reminder:${participant.id}:${attempt}`,
        title: `请继续填写「${participant.project.title}」旅行偏好`,
        body: `您尚未完成本次旅行的偏好填写，团队方案需要您的输入。预计 3-5 分钟：${portalPath}`,
        projectId: participant.projectId,
        participantId: participant.id,
        userId: participant.userId ?? undefined,
        channel: 'EMAIL',
      });

      if (result.skipped === 'deduped') {
        continue;
      }

      const metadata = {
        ...(typeof participant.metadata === 'object' && participant.metadata
          ? (participant.metadata as Record<string, unknown>)
          : {}),
        lastPreferenceReminderAt: now.toISOString(),
      };

      await this.prisma.gate1Participant.update({
        where: { id: participant.id },
        data: {
          reminderCount: { increment: 1 },
          metadata: asInputJson(metadata),
        },
      });

      await this.analytics.track(
        participant.projectId,
        participant.project.cohort,
        'preference_reminder_sent',
        {
          participantId: participant.id,
          properties: { attempt, channel: 'email_or_skip' },
        },
      );

      sent += 1;
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} preference incomplete reminders (scanned ${participants.length})`);
    }

    return { sent, scanned: participants.length };
  }

  async sendProposalFeedbackReminders(): Promise<{ sent: number; scanned: number }> {
    const participants = await this.prisma.gate1Participant.findMany({
      where: { status: 'SUBMITTED' },
      include: {
        project: { select: { id: true, title: true, cohort: true, experimentStatus: true } },
        proposalFeedbacks: { select: { candidateStrategyId: true, status: true } },
      },
    });

    let sent = 0;
    const now = new Date();

    for (const participant of participants) {
      if (['WITHDRAWN', 'COMPLETED'].includes(participant.project.experimentStatus)) {
        continue;
      }

      const candidates = await this.prisma.gate1CandidateStrategy.findMany({
        where: { projectId: participant.projectId, status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
      });

      for (const candidate of candidates) {
        const hasValidFeedback = participant.proposalFeedbacks.some(
          (f) => f.candidateStrategyId === candidate.id && f.status === 'SUBMITTED',
        );
        if (hasValidFeedback) continue;

        if (
          !shouldSendProposalFeedbackReminder(
            candidate.id,
            candidate.publishedAt,
            participant.metadata,
            now,
          )
        ) {
          continue;
        }

        const portalPath = `/participant/projects/${participant.inviteToken}/proposals/${candidate.id}`;
        const result = await this.notifications.queueAndSend({
          eventType: 'proposal_feedback_reminder',
          dedupeKey: `proposal-reminder:${participant.id}:${candidate.id}`,
          title: `请反馈方案「${candidate.label}」`,
          body: `顾问已发布候选方案，等待您的反馈：${portalPath}`,
          projectId: participant.projectId,
          participantId: participant.id,
          userId: participant.userId ?? undefined,
          channel: 'EMAIL',
        });

        if (result.skipped === 'deduped') continue;

        await this.prisma.gate1Participant.update({
          where: { id: participant.id },
          data: {
            metadata: asInputJson(
              bumpProposalReminderMeta(participant.metadata, candidate.id, now),
            ),
          },
        });

        await this.analytics.track(
          participant.projectId,
          participant.project.cohort,
          'proposal_feedback_reminder_sent',
          {
            participantId: participant.id,
            properties: { candidateId: candidate.id, label: candidate.label },
          },
        );

        sent += 1;
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} proposal feedback reminders`);
    }

    return { sent, scanned: participants.length };
  }

  async sendAdvisorInitiatedReminder(
    projectId: string,
    participantId: string,
    actorId: string,
  ): Promise<{ sent: boolean; reason?: string }> {
    const participant = await this.prisma.gate1Participant.findFirst({
      where: { id: participantId, projectId },
      include: { project: { select: { id: true, title: true, cohort: true, experimentStatus: true } } },
    });
    if (!participant) throw new NotFoundException('Participant not found');
    if (participant.status === 'SUBMITTED') {
      return { sent: false, reason: 'ALREADY_SUBMITTED' };
    }
    if (['DECLINED', 'WITHDRAWN', 'DELETED'].includes(participant.status)) {
      throw new BadRequestException('Cannot remind inactive participant');
    }
    if (!canSendAdvisorInitiatedReminder(participant.metadata)) {
      throw new BadRequestException(
        'Advisor-initiated reminder limited to once per 24 hours per member (PRD §7.3)',
      );
    }

    const now = new Date();
    const portalPath = buildPortalPath(participant.inviteToken);
    const result = await this.notifications.queueAndSend({
      eventType: 'advisor_initiated_reminder',
      dedupeKey: `advisor-reminder:${participant.id}:${now.toISOString().slice(0, 10)}`,
      title: `顾问提醒：请完成「${participant.project.title}」信息填写`,
      body: `您的旅行顾问请求您尽快完成偏好与约束填写：${portalPath}`,
      projectId,
      participantId: participant.id,
      userId: participant.userId ?? undefined,
      channel: 'EMAIL',
    });

    if (result.skipped === 'deduped') {
      return { sent: false, reason: 'DEDUPED' };
    }

    const metadata = {
      ...(typeof participant.metadata === 'object' && participant.metadata
        ? (participant.metadata as Record<string, unknown>)
        : {}),
      lastAdvisorReminderAt: now.toISOString(),
    };

    await this.prisma.gate1Participant.update({
      where: { id: participant.id },
      data: { metadata: asInputJson(metadata) },
    });

    await this.analytics.track(projectId, participant.project.cohort, 'advisor_reminder_sent', {
      actorId,
      participantId: participant.id,
      properties: { channel: 'email_or_skip' },
    });

    return { sent: true };
  }
}
