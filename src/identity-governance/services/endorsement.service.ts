import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EndorsementSubjectType,
  EndorsementType,
} from '../constants/endorsement.constants';
import { IdentityAuditLogService } from './audit-log.service';

export type SubmitEndorsementInput = {
  endorserSubjectType?: EndorsementSubjectType;
  endorserSubjectId?: string;
  subjectType: EndorsementSubjectType;
  subjectId: string;
  endorsementType: EndorsementType | string;
  factStatement: string;
  relatedListingId?: string;
  relatedTripId?: string;
  expiresAt?: string;
  evidence?: Record<string, unknown>;
};

@Injectable()
export class EndorsementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async submit(actorUserId: string, input: SubmitEndorsementInput) {
    const endorserSubjectType = input.endorserSubjectType ?? 'ORGANIZATION';
    const endorserSubjectId = input.endorserSubjectId;

    if (!endorserSubjectId) {
      throw new BadRequestException('endorserSubjectId 为必填项');
    }

    if (endorserSubjectType === 'ORGANIZATION') {
      await this.assertOrgManager(endorserSubjectId, actorUserId);
    } else if (endorserSubjectId !== actorUserId) {
      throw new ForbiddenException('不能代表他人提交个人背书');
    }

    const factStatement = input.factStatement.trim();
    if (factStatement.length < 10) {
      throw new BadRequestException('背书陈述需至少 10 个字符，且基于可验证事实');
    }

    if (input.relatedListingId) {
      await this.assertListingEligibleForEndorsement(input.relatedListingId, input.subjectId);
    }

    const endorsement = await this.prisma.identityEndorsement.create({
      data: {
        endorserSubjectType,
        endorserSubjectId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        endorsementType: String(input.endorsementType).trim().toUpperCase(),
        factStatement,
        status: 'PENDING',
        evidence: input.evidence as Prisma.InputJsonValue | undefined,
        relatedListingId: input.relatedListingId ?? null,
        relatedTripId: input.relatedTripId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdByUserId: actorUserId,
      },
    });

    await this.auditLog.record({
      actorId: actorUserId,
      action: 'ENDORSEMENT_SUBMITTED',
      targetType: 'IDENTITY_ENDORSEMENT',
      targetId: endorsement.id,
      after: { endorsementType: endorsement.endorsementType },
    });

    return this.toPublicView(endorsement);
  }

  async listForSubject(subjectType: EndorsementSubjectType, subjectId: string) {
    const now = new Date();
    const rows = await this.prisma.identityEndorsement.findMany({
      where: {
        subjectType,
        subjectId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map((r) => this.toPublicView(r));
  }

  async listIssuedBy(endorserSubjectType: EndorsementSubjectType, endorserSubjectId: string) {
    const rows = await this.prisma.identityEndorsement.findMany({
      where: { endorserSubjectType, endorserSubjectId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublicView(r));
  }

  async expireOutdated(): Promise<number> {
    const result = await this.prisma.identityEndorsement.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async listPendingForReview(limit = 50) {
    return this.prisma.identityEndorsement.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async review(
    adminId: string,
    endorsementId: string,
    action: 'activate' | 'reject' | 'revoke',
    notes?: string,
  ) {
    const row = await this.prisma.identityEndorsement.findUnique({ where: { id: endorsementId } });
    if (!row) {
      throw new NotFoundException('背书记录不存在');
    }

    let status: string;
    let issuedAt = row.issuedAt;
    if (action === 'activate') {
      status = 'ACTIVE';
      issuedAt = new Date();
    } else if (action === 'reject') {
      status = 'REJECTED';
    } else {
      status = 'REVOKED';
    }

    const updated = await this.prisma.identityEndorsement.update({
      where: { id: row.id },
      data: {
        status,
        issuedAt,
        verifiedById: adminId,
        evidence: {
          ...(typeof row.evidence === 'object' && row.evidence ? (row.evidence as object) : {}),
          reviewNotes: notes ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: `ENDORSEMENT_${action.toUpperCase()}`,
      targetType: 'IDENTITY_ENDORSEMENT',
      targetId: row.id,
      before: { status: row.status },
      after: { status },
    });

    return this.toPublicView(updated);
  }

  private async assertListingEligibleForEndorsement(listingId: string, subjectUserId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new BadRequestException('关联项目不存在');
    }

    const listingCompleted = await this.prisma.reputationEvent.findFirst({
      where: { listingId, eventType: 'PROJECT_COMPLETED' },
    });
    if (!listingCompleted) {
      throw new BadRequestException('项目尚未完成，无法基于该项目背书');
    }

    const wasLead = listing.responsibleUserId === subjectUserId;
    const wasApprovedMember = await this.prisma.trustedProjectApplication.findFirst({
      where: { listingId, applicantUserId: subjectUserId, status: { in: ['approved', 'APPROVED', 'withdrawn', 'WITHDRAWN'] } },
    });

    if (!wasLead && !wasApprovedMember) {
      throw new BadRequestException('受背书人需参与过该项目');
    }
  }

  private toPublicView(row: {
    id: string;
    endorserSubjectType: string;
    endorserSubjectId: string;
    subjectType: string;
    subjectId: string;
    endorsementType: string;
    factStatement: string;
    status: string;
    relatedListingId: string | null;
    relatedTripId: string | null;
    issuedAt: Date | null;
    expiresAt: Date | null;
  }) {
    return {
      id: row.id,
      endorserSubjectType: row.endorserSubjectType,
      endorserSubjectId: row.endorserSubjectId,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      endorsementType: row.endorsementType,
      factStatement: row.factStatement,
      status: row.status,
      relatedListingId: row.relatedListingId,
      relatedTripId: row.relatedTripId,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
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
      throw new ForbiddenException('无权代表该机构提交背书');
    }
  }
}
