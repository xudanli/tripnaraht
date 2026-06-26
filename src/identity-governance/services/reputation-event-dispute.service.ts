import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REPUTATION_DISPUTE_OPEN_STATUSES,
  ReputationDisputeStatus,
} from '../constants/reputation-event.constants';
import { IdentityAuditLogService } from './audit-log.service';

@Injectable()
export class ReputationEventDisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async submit(userId: string, eventId: string, reason: string) {
    const event = await this.prisma.reputationEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('声誉事件不存在');

    if (event.subjectType === 'USER' && event.subjectId !== userId) {
      throw new ForbiddenException('仅事件主体可发起争议');
    }

    const existing = await this.prisma.reputationEventDispute.findFirst({
      where: {
        eventId,
        status: { in: [...REPUTATION_DISPUTE_OPEN_STATUSES] },
      },
    });
    if (existing) {
      throw new BadRequestException('该事件已有进行中的争议');
    }

    const dispute = await this.prisma.reputationEventDispute.create({
      data: {
        eventId,
        submitterId: userId,
        reason: reason.trim(),
        status: 'SUBMITTED',
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'REPUTATION_DISPUTE_SUBMITTED',
      targetType: 'REPUTATION_EVENT_DISPUTE',
      targetId: dispute.id,
      after: { eventId },
    });

    return dispute;
  }

  async listMine(userId: string) {
    return this.prisma.reputationEventDispute.findMany({
      where: { submitterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async listPending(limit = 50) {
    return this.prisma.reputationEventDispute.findMany({
      where: { status: { in: [...REPUTATION_DISPUTE_OPEN_STATUSES] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async startReview(adminId: string, disputeId: string) {
    return this.transition(adminId, disputeId, ['SUBMITTED'], 'UNDER_REVIEW', 'REPUTATION_DISPUTE_REVIEW_STARTED');
  }

  async resolve(
    adminId: string,
    disputeId: string,
    status: 'UPHELD' | 'REJECTED',
    resolution: string,
  ) {
    const dispute = await this.prisma.reputationEventDispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('争议不存在');
    if (!REPUTATION_DISPUTE_OPEN_STATUSES.includes(dispute.status as (typeof REPUTATION_DISPUTE_OPEN_STATUSES)[number])) {
      throw new BadRequestException('仅进行中的争议可结案');
    }

    const updated = await this.prisma.reputationEventDispute.update({
      where: { id: disputeId },
      data: {
        status,
        resolution: resolution.trim(),
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: 'REPUTATION_DISPUTE_RESOLVED',
      targetType: 'REPUTATION_EVENT_DISPUTE',
      targetId: disputeId,
      after: { status },
    });

    if (status === 'UPHELD') {
      const event = await this.prisma.reputationEvent.findUnique({ where: { id: dispute.eventId } });
      await this.prisma.reputationEvent.update({
        where: { id: dispute.eventId },
        data: {
          eventResult: 'DISPUTED',
          metadata: {
            ...(typeof event?.metadata === 'object' && event.metadata ? (event.metadata as object) : {}),
            disputed: true,
            disputeId,
            disputedAt: new Date().toISOString(),
          },
        },
      });
    }

    return updated;
  }

  private async transition(
    adminId: string,
    disputeId: string,
    from: ReputationDisputeStatus[],
    to: ReputationDisputeStatus,
    auditAction: string,
  ) {
    const dispute = await this.prisma.reputationEventDispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException('争议不存在');
    if (!from.includes(dispute.status as ReputationDisputeStatus)) {
      throw new BadRequestException(`争议当前状态为 ${dispute.status}，无法执行该操作`);
    }

    const updated = await this.prisma.reputationEventDispute.update({
      where: { id: disputeId },
      data: { status: to },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: auditAction,
      targetType: 'REPUTATION_EVENT_DISPUTE',
      targetId: disputeId,
      after: { status: to },
    });

    return updated;
  }
}
