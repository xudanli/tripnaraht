import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QualificationSubjectType,
  QualificationStatus,
} from '../constants/qualification.constants';
import { IdentityAuditLogService } from './audit-log.service';

export type SubmitQualificationInput = {
  subjectType?: QualificationSubjectType;
  subjectId?: string;
  qualificationType: string;
  issuer?: string;
  certificateNumber?: string;
  validFrom?: string;
  validUntil?: string;
  evidence?: Record<string, unknown>;
};

@Injectable()
export class QualificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async submit(userId: string, input: SubmitQualificationInput) {
    const subjectType = input.subjectType ?? 'USER';
    const subjectId = input.subjectId ?? userId;

    if (subjectType === 'USER' && subjectId !== userId) {
      throw new ForbiddenException('不能为他人提交个人资质');
    }
    if (subjectType === 'ORGANIZATION') {
      await this.assertOrgManager(subjectId, userId);
    }

    const qualification = await this.prisma.qualification.create({
      data: {
        subjectType,
        subjectId,
        qualificationType: input.qualificationType.trim().toUpperCase(),
        issuer: input.issuer?.trim() || null,
        certificateNumber: input.certificateNumber?.trim() || null,
        status: 'PENDING',
        evidence: input.evidence as Prisma.InputJsonValue | undefined,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'QUALIFICATION_SUBMITTED',
      targetType: 'QUALIFICATION',
      targetId: qualification.id,
      after: { qualificationType: qualification.qualificationType },
    });

    return this.toPublicView(qualification);
  }

  async listMine(userId: string) {
    const rows = await this.prisma.qualification.findMany({
      where: {
        OR: [
          { subjectType: 'USER', subjectId: userId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    const orgMemberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    const orgIds = orgMemberships.map((m) => m.organizationId);
    const orgQualifications =
      orgIds.length > 0
        ? await this.prisma.qualification.findMany({
            where: { subjectType: 'ORGANIZATION', subjectId: { in: orgIds } },
            orderBy: { updatedAt: 'desc' },
          })
        : [];

    return [...rows, ...orgQualifications].map((q) => this.toPublicView(q));
  }

  async listVerifiedForSubject(subjectType: QualificationSubjectType, subjectId: string) {
    const now = new Date();
    const rows = await this.prisma.qualification.findMany({
      where: {
        subjectType,
        subjectId,
        status: 'VERIFIED',
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: { validUntil: 'asc' },
    });
    return rows.map((q) => this.toPublicView(q));
  }

  async listPendingForReview(limit = 50) {
    return this.prisma.qualification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async review(
    adminId: string,
    qualificationId: string,
    action: 'verify' | 'reject' | 'revoke',
    notes?: string,
  ) {
    const row = await this.prisma.qualification.findUnique({ where: { id: qualificationId } });
    if (!row) {
      throw new NotFoundException('资质记录不存在');
    }

    let status: QualificationStatus;
    if (action === 'verify') status = 'VERIFIED';
    else if (action === 'reject') status = 'REJECTED';
    else status = 'REVOKED';

    const updated = await this.prisma.qualification.update({
      where: { id: row.id },
      data: {
        status,
        verifiedAt: action === 'verify' ? new Date() : row.verifiedAt,
        verifiedById: adminId,
        evidence: {
          ...(typeof row.evidence === 'object' && row.evidence ? (row.evidence as object) : {}),
          reviewNotes: notes ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: `QUALIFICATION_${action.toUpperCase()}`,
      targetType: 'QUALIFICATION',
      targetId: row.id,
      before: { status: row.status },
      after: { status },
    });

    return this.toPublicView(updated);
  }

  async expireOutdated(): Promise<number> {
    const result = await this.prisma.qualification.updateMany({
      where: {
        status: 'VERIFIED',
        validUntil: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  private toPublicView(row: {
    id: string;
    subjectType: string;
    subjectId: string;
    qualificationType: string;
    issuer: string | null;
    status: string;
    validFrom: Date | null;
    validUntil: Date | null;
    verifiedAt: Date | null;
  }) {
    return {
      id: row.id,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      qualificationType: row.qualificationType,
      issuer: row.issuer,
      status: row.status,
      validFrom: row.validFrom?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
    };
  }

  private async assertOrgManager(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    const canManage = membership?.roles.some((r) =>
      ['OWNER', 'AGENCY_ADMIN'].includes(r.toUpperCase()),
    );
    if (!membership || membership.status !== 'ACTIVE' || !canManage) {
      throw new ForbiddenException('无权代表该机构提交资质');
    }
  }
}
