import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

export type QueueNotificationInput = {
  eventType: string;
  dedupeKey: string;
  title: string;
  body: string;
  projectId?: string;
  participantId?: string;
  userId?: string;
  recipientEmail?: string;
  channel?: 'EMAIL' | 'IN_APP';
};

@Injectable()
export class Gate1ParticipantNotificationService {
  private readonly logger = new Logger(Gate1ParticipantNotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.initTransporter();
  }

  private initTransporter() {
    const smtpHost = this.configService?.get<string>('SMTP_HOST');
    const smtpUser = this.configService?.get<string>('SMTP_USER');
    const smtpPassword =
      this.configService?.get<string>('SMTP_PASSWORD') ||
      this.configService?.get<string>('SMTP_PASS');
    const smtpPort = parseInt(this.configService?.get<string>('SMTP_PORT') || '465', 10);
    const smtpSecure =
      this.configService?.get<string>('SMTP_SECURE') === 'true' || smtpPort === 465;

    if (!smtpHost || !smtpUser || !smtpPassword) {
      this.logger.warn('SMTP not configured; participant notifications will be queued only');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPassword },
    });
  }

  async queueAndSend(input: QueueNotificationInput): Promise<{ sent: boolean; skipped?: string }> {
    const existing = await this.prisma.gate1NotificationOutbox.findUnique({
      where: {
        eventType_dedupeKey: { eventType: input.eventType, dedupeKey: input.dedupeKey },
      },
    });
    if (existing) {
      return { sent: false, skipped: 'deduped' };
    }

    let recipient = input.recipientEmail;
    if (!recipient && input.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true },
      });
      recipient = user?.email ?? undefined;
    }
    if (!recipient && input.participantId) {
      const participant = await this.prisma.gate1Participant.findUnique({
        where: { id: input.participantId },
        select: { contactHint: true, userId: true },
      });
      if (participant?.contactHint?.includes('@')) {
        recipient = participant.contactHint;
      } else if (participant?.userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: participant.userId },
          select: { email: true },
        });
        recipient = user?.email ?? undefined;
      }
    }

    const channel = input.channel ?? 'EMAIL';
    const record = await this.prisma.gate1NotificationOutbox.create({
      data: {
        projectId: input.projectId ?? null,
        participantId: input.participantId ?? null,
        userId: input.userId ?? null,
        channel,
        eventType: input.eventType,
        dedupeKey: input.dedupeKey,
        title: input.title,
        body: input.body,
        recipient: recipient ?? null,
        status: recipient && channel === 'EMAIL' ? 'QUEUED' : 'SKIPPED',
        error: recipient ? null : 'no_recipient',
      },
    });

    await this.writeInAppMirror(input);

    if (!recipient || channel !== 'EMAIL' || !this.transporter) {
      return { sent: false, skipped: recipient ? 'smtp_unavailable' : 'no_recipient' };
    }

    try {
      const from =
        this.configService?.get<string>('SMTP_FROM') ||
        this.configService?.get<string>('SMTP_USER') ||
        'noreply@tripnara.com';
      await this.transporter.sendMail({
        from,
        to: recipient,
        subject: input.title,
        text: input.body,
        html: `<p>${input.body.replace(/\n/g, '<br/>')}</p>`,
      });
      await this.prisma.gate1NotificationOutbox.update({
        where: { id: record.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.gate1NotificationOutbox.update({
        where: { id: record.id },
        data: { status: 'FAILED', error: message },
      });
      this.logger.error(`Notification send failed: ${message}`);
      return { sent: false, skipped: 'send_failed' };
    }
  }

  private async writeInAppMirror(input: QueueNotificationInput) {
    if (!input.participantId) return;
    const inAppKey = `in-app:${input.dedupeKey}`;
    const exists = await this.prisma.gate1NotificationOutbox.findUnique({
      where: { eventType_dedupeKey: { eventType: input.eventType, dedupeKey: inAppKey } },
    });
    if (exists) return;

    await this.prisma.gate1NotificationOutbox.create({
      data: {
        projectId: input.projectId ?? null,
        participantId: input.participantId,
        userId: input.userId ?? null,
        channel: 'IN_APP',
        eventType: input.eventType,
        dedupeKey: inAppKey,
        title: input.title,
        body: input.body,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  }

  async notifyProjectParticipants(
    projectId: string,
    input: Omit<QueueNotificationInput, 'projectId' | 'participantId' | 'userId'>,
  ) {
    const participants = await this.prisma.gate1Participant.findMany({
      where: {
        projectId,
        status: { notIn: ['DECLINED', 'WITHDRAWN', 'DELETED'] },
      },
      select: { id: true, userId: true },
    });

    for (const p of participants) {
      await this.queueAndSend({
        ...input,
        projectId,
        participantId: p.id,
        userId: p.userId ?? undefined,
        dedupeKey: `${input.dedupeKey}:${p.id}`,
      });
    }
  }

  async listForParticipant(token: string, limit = 20) {
    const participant = await this.prisma.gate1Participant.findUnique({
      where: { inviteToken: token },
      select: { id: true, userId: true, projectId: true },
    });
    if (!participant) return [];

    const rows = await this.prisma.gate1NotificationOutbox.findMany({
      where: {
        channel: 'IN_APP',
        OR: [
          { participantId: participant.id },
          ...(participant.userId ? [{ userId: participant.userId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: {
        id: true,
        eventType: true,
        title: true,
        body: true,
        channel: true,
        status: true,
        createdAt: true,
        sentAt: true,
        projectId: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      title: r.title,
      body: r.body,
      channel: r.channel,
      status: r.status,
      createdAt: r.createdAt,
      sentAt: r.sentAt,
      projectId: r.projectId,
    }));
  }
}
