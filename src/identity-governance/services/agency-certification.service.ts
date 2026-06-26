import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AGENCY_CERT_VALIDITY_YEARS,
  AgencyCertStatus,
  assertAgencyCertTransition,
} from '../constants/agency-certification.constants';
import { IdentityAuditLogService } from './audit-log.service';

export type AgencyMaterialsInput = {
  legalName?: string;
  registrationNumber?: string;
  registeredAddress?: string;
  authorizedRepresentative?: string;
  businessScope?: string[];
  refundPolicy?: string;
  insurance?: Record<string, unknown>;
  banking?: Record<string, unknown>;
};

export type AgencyReviewAction = 'approve' | 'reject' | 'need_more_info' | 'suspend' | 'restore';

@Injectable()
export class AgencyCertificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async getStatus(organizationId: string, userId: string) {
    await this.assertOrgManager(organizationId, userId);
    const [organization, certification] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.getLatest(organizationId),
    ]);
    if (!organization) {
      throw new NotFoundException('机构不存在');
    }
    return {
      organization: {
        id: organization.id,
        displayName: organization.displayName,
        legalName: organization.legalName,
        verificationStatus: organization.verificationStatus,
      },
      certification,
      isVerifiedAgency: certification?.status === 'VERIFIED',
    };
  }

  async saveDraft(organizationId: string, userId: string, materials: AgencyMaterialsInput) {
    await this.assertOrgManager(organizationId, userId);

    if (materials.legalName?.trim()) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { legalName: materials.legalName.trim() },
      });
    }

    const existing = await this.getLatest(organizationId);
    const currentStatus = (existing?.status ?? 'DRAFT') as AgencyCertStatus;

    if (existing) {
      if (!['DRAFT', 'NEED_MORE_INFO', 'REJECTED'].includes(currentStatus)) {
        throw new BadRequestException(`当前状态 ${currentStatus} 不可编辑材料`);
      }
      let targetStatus: AgencyCertStatus = currentStatus;
      if (currentStatus === 'REJECTED') {
        assertAgencyCertTransition('REJECTED', 'DRAFT');
        targetStatus = 'DRAFT';
      }

      const updated = await this.prisma.agencyCertification.update({
        where: { id: existing.id },
        data: {
          status: targetStatus,
          materials: materials as Prisma.InputJsonValue,
        },
      });
      await this.syncOrganizationStatus(organizationId, targetStatus);
      await this.auditLog.record({
        actorId: userId,
        action: 'AGENCY_CERT_DRAFT_SAVED',
        targetType: 'ORGANIZATION',
        targetId: organizationId,
        after: { status: targetStatus },
      });
      return updated;
    }

    const created = await this.prisma.agencyCertification.create({
      data: {
        organizationId,
        status: 'DRAFT',
        materials: materials as Prisma.InputJsonValue,
      },
    });
    await this.syncOrganizationStatus(organizationId, 'DRAFT');
    await this.auditLog.record({
      actorId: userId,
      action: 'AGENCY_CERT_DRAFT_CREATED',
      targetType: 'ORGANIZATION',
      targetId: organizationId,
      after: { status: 'DRAFT' },
    });
    return created;
  }

  async submit(organizationId: string, userId: string) {
    await this.assertOrgManager(organizationId, userId);
    const existing = await this.getLatest(organizationId);
    if (!existing) {
      throw new BadRequestException('请先保存企业认证材料');
    }

    const currentStatus = existing.status as AgencyCertStatus;
    if (!['DRAFT', 'NEED_MORE_INFO'].includes(currentStatus)) {
      throw new BadRequestException(`当前状态 ${currentStatus} 不可提交`);
    }

    assertAgencyCertTransition(currentStatus, 'SUBMITTED');
    assertAgencyCertTransition('SUBMITTED', 'UNDER_REVIEW');

    const updated = await this.prisma.agencyCertification.update({
      where: { id: existing.id },
      data: {
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        reviewNotes: null,
      },
    });
    await this.syncOrganizationStatus(organizationId, 'UNDER_REVIEW');
    await this.ensureOrganizationContext(organizationId, userId);

    await this.auditLog.record({
      actorId: userId,
      action: 'AGENCY_CERT_SUBMITTED',
      targetType: 'ORGANIZATION',
      targetId: organizationId,
      after: { status: 'UNDER_REVIEW' },
    });
    return updated;
  }

  async listForReview(status = 'UNDER_REVIEW', limit = 50) {
    return this.prisma.agencyCertification.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' },
      take: limit,
      include: {
        Organization: {
          select: {
            id: true,
            displayName: true,
            legalName: true,
            ownerId: true,
            verificationStatus: true,
          },
        },
      },
    });
  }

  async review(
    adminId: string,
    certificationId: string,
    action: AgencyReviewAction,
    notes?: string,
  ) {
    const cert = await this.prisma.agencyCertification.findUnique({
      where: { id: certificationId },
      include: { Organization: true },
    });
    if (!cert) {
      throw new NotFoundException('机构认证申请不存在');
    }

    const from = cert.status as AgencyCertStatus;
    let to: AgencyCertStatus;
    switch (action) {
      case 'approve':
        to = 'VERIFIED';
        break;
      case 'reject':
        to = 'REJECTED';
        break;
      case 'need_more_info':
        to = 'NEED_MORE_INFO';
        break;
      case 'suspend':
        to = 'SUSPENDED';
        break;
      case 'restore':
        to = 'VERIFIED';
        break;
      default:
        throw new BadRequestException('未知审核动作');
    }

    assertAgencyCertTransition(from, to);

    const now = new Date();
    const expiresAt =
      to === 'VERIFIED'
        ? new Date(now.getFullYear() + AGENCY_CERT_VALIDITY_YEARS, now.getMonth(), now.getDate())
        : cert.expiresAt;

    const updated = await this.prisma.agencyCertification.update({
      where: { id: cert.id },
      data: {
        status: to,
        reviewNotes: notes ?? null,
        reviewedById: adminId,
        verifiedAt: to === 'VERIFIED' ? now : cert.verifiedAt,
        expiresAt,
      },
    });

    await this.syncOrganizationStatus(cert.organizationId, to);

    await this.auditLog.record({
      actorId: adminId,
      action: `AGENCY_CERT_${action.toUpperCase()}`,
      targetType: 'ORGANIZATION',
      targetId: cert.organizationId,
      before: { status: from },
      after: { status: to, reviewNotes: notes ?? null },
    });

    return updated;
  }

  async isOrganizationVerified(organizationId: string): Promise<boolean> {
    const cert = await this.getLatest(organizationId);
    return cert?.status === 'VERIFIED';
  }

  private async getLatest(organizationId: string) {
    return this.prisma.agencyCertification.findFirst({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async assertOrgManager(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
    });
    const isOwner = membership?.roles.some((r) => r.toUpperCase() === 'OWNER');
    const isAdmin = membership?.roles.some((r) => r.toUpperCase() === 'AGENCY_ADMIN');
    if (!membership || membership.status !== 'ACTIVE' || (!isOwner && !isAdmin)) {
      throw new ForbiddenException('无权管理该机构认证材料');
    }
  }

  private async syncOrganizationStatus(organizationId: string, certStatus: AgencyCertStatus) {
    const orgStatus =
      certStatus === 'VERIFIED'
        ? 'VERIFIED'
        : certStatus === 'SUSPENDED'
          ? 'SUSPENDED'
          : certStatus === 'UNDER_REVIEW' || certStatus === 'SUBMITTED'
            ? 'UNDER_REVIEW'
            : certStatus === 'REJECTED'
              ? 'REJECTED'
              : 'DRAFT';

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { verificationStatus: orgStatus },
    });
  }

  private async ensureOrganizationContext(organizationId: string, userId: string) {
    const existing = await this.prisma.userAccountContext.findFirst({
      where: { userId, contextType: 'organization', contextId: organizationId },
    });
    if (existing) return;

    await this.prisma.userAccountContext.create({
      data: {
        userId,
        contextType: 'organization',
        contextId: organizationId,
        isActive: false,
      },
    });
  }
}
