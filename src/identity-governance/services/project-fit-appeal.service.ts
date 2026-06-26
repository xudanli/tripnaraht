import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { APPEAL_OPEN_STATUSES, AppealStatus } from '../constants/project-fit.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { ProjectFitAppealOverturnService } from './project-fit-appeal-overturn.service';

@Injectable()
export class ProjectFitAppealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly overturn: ProjectFitAppealOverturnService,
  ) {}

  async submit(
    userId: string,
    input: { targetType: string; targetId: string; reason: string },
  ) {
    const appeal = await this.prisma.projectFitAppeal.create({
      data: {
        submitterId: userId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason.trim(),
        status: 'SUBMITTED',
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'APPEAL_SUBMITTED',
      targetType: 'PROJECT_FIT_APPEAL',
      targetId: appeal.id,
    });

    return appeal;
  }

  async listMine(userId: string) {
    return this.prisma.projectFitAppeal.findMany({
      where: { submitterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async listPending(limit = 50) {
    return this.listByStatus([...APPEAL_OPEN_STATUSES], limit);
  }

  async listByStatus(statuses: AppealStatus[], limit = 50) {
    return this.prisma.projectFitAppeal.findMany({
      where: { status: { in: statuses } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async triage(adminId: string, appealId: string, notes?: string) {
    return this.transitionStatus(adminId, appealId, 'SUBMITTED', 'TRIAGED', 'APPEAL_TRIAGED', notes);
  }

  async startReview(adminId: string, appealId: string, notes?: string) {
    return this.transitionStatus(
      adminId,
      appealId,
      ['SUBMITTED', 'TRIAGED'],
      'UNDER_REVIEW',
      'APPEAL_REVIEW_STARTED',
      notes,
    );
  }

  async resolve(
    adminId: string,
    appealId: string,
    resolution: string,
    status: 'UPHELD' | 'PARTIALLY_UPHELD' | 'REJECTED',
  ) {
    const appeal = await this.prisma.projectFitAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException('申诉不存在');
    if (!APPEAL_OPEN_STATUSES.includes(appeal.status as (typeof APPEAL_OPEN_STATUSES)[number])) {
      throw new BadRequestException('仅待处理申诉可结案');
    }

    const updated = await this.prisma.projectFitAppeal.update({
      where: { id: appealId },
      data: {
        status,
        resolution,
        resolvedById: adminId,
        resolvedAt: new Date(),
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: 'APPEAL_RESOLVED',
      targetType: 'PROJECT_FIT_APPEAL',
      targetId: appealId,
      after: { status },
    });

    const overturnEffects = await this.overturn.applyOverturn(updated);

    return {
      ...updated,
      overturnEffects,
    };
  }

  private async transitionStatus(
    adminId: string,
    appealId: string,
    from: AppealStatus | AppealStatus[],
    to: AppealStatus,
    auditAction: string,
    notes?: string,
  ) {
    const appeal = await this.prisma.projectFitAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException('申诉不存在');

    const allowedFrom = Array.isArray(from) ? from : [from];
    if (!allowedFrom.includes(appeal.status as AppealStatus)) {
      throw new BadRequestException(`申诉当前状态为 ${appeal.status}，无法执行该操作`);
    }

    const updated = await this.prisma.projectFitAppeal.update({
      where: { id: appealId },
      data: {
        status: to,
        metadata: notes?.trim()
          ? {
              ...(typeof appeal.metadata === 'object' && appeal.metadata
                ? (appeal.metadata as object)
                : {}),
              lastAdminNote: notes.trim(),
            }
          : undefined,
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: auditAction,
      targetType: 'PROJECT_FIT_APPEAL',
      targetId: appealId,
      after: { status: to },
    });

    return updated;
  }
}
