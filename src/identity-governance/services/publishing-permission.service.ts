import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isPublicPublishingLevel,
  MATCH_SQUARE_FROZEN_MESSAGE,
  PublishingLevel,
  PublishingPermissionStatus,
} from '../constants/identity-governance.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { ProfessionalCertificationService } from './professional-certification.service';
import { AgencyCertificationService } from './agency-certification.service';
import { VerificationService } from './verification.service';

export type PublishingPermissionView = {
  subjectType: 'USER' | 'ORGANIZATION';
  subjectId: string;
  level: PublishingLevel;
  status: PublishingPermissionStatus;
  reason: string | null;
  grantedAt: Date;
  suspendedAt: Date | null;
};

@Injectable()
export class PublishingPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly professionalCertification: ProfessionalCertificationService,
    private readonly agencyCertification: AgencyCertificationService,
    private readonly verification: VerificationService,
  ) {}

  async ensureUserDefaults(userId: string): Promise<void> {
    await this.ensureFreeSubscription(userId);
    await this.ensureDefaultPublishingPermission(userId);
  }

  async getUserPermission(userId: string): Promise<PublishingPermissionView> {
    return this.getSubjectPermission('USER', userId, userId);
  }

  async getSubjectPermission(
    subjectType: 'USER' | 'ORGANIZATION',
    subjectId: string,
    actorUserId: string,
  ): Promise<PublishingPermissionView> {
    if (subjectType === 'USER') {
      await this.ensureUserDefaults(actorUserId);
    }
    const row = await this.prisma.publishingPermission.findFirst({
      where: { subjectType, subjectId, status: 'ACTIVE' },
      orderBy: { grantedAt: 'desc' },
    });
    if (!row) {
      return {
        subjectType,
        subjectId,
        level: 'PRIVATE_ONLY',
        status: 'ACTIVE',
        reason: 'default_private_only',
        grantedAt: new Date(),
        suspendedAt: null,
      };
    }
    return this.toView(row);
  }

  async listApplicationsForUser(userId: string) {
    return this.prisma.publishingPermissionApplication.findMany({
      where: { applicantUserId: userId },
      orderBy: { submittedAt: 'desc' },
      take: 20,
    });
  }

  async submitApplication(
    userId: string,
    requestedLevel: PublishingLevel,
    reason?: string,
    subjectType: 'USER' | 'ORGANIZATION' = 'USER',
    subjectId?: string,
  ) {
    if (!isPublicPublishingLevel(requestedLevel)) {
      throw new BadRequestException('仅可申请公开招募相关发布权限');
    }

    const resolvedSubjectId = subjectId ?? userId;
    if (subjectType === 'ORGANIZATION') {
      await this.assertOrgManager(resolvedSubjectId, userId);
    } else if (resolvedSubjectId !== userId) {
      throw new ForbiddenException('不能为他人提交个人发布权限申请');
    }

    await this.assertApplicationPrerequisites(userId, requestedLevel, subjectType, resolvedSubjectId);

    const pending = await this.prisma.publishingPermissionApplication.findFirst({
      where: {
        subjectType,
        subjectId: resolvedSubjectId,
        requestedLevel,
        status: 'PENDING',
      },
    });
    if (pending) {
      throw new BadRequestException('已有相同类型的待审核申请');
    }

    const application = await this.prisma.publishingPermissionApplication.create({
      data: {
        subjectType,
        subjectId: resolvedSubjectId,
        applicantUserId: userId,
        requestedLevel,
        reason: reason?.trim() || null,
        status: 'PENDING',
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'PUBLISHING_PERMISSION_APPLICATION_SUBMITTED',
      targetType: subjectType,
      targetId: resolvedSubjectId,
      after: { requestedLevel, applicationId: application.id },
    });

    return application;
  }

  async listApplicationsForReview(status = 'PENDING', limit = 50) {
    return this.prisma.publishingPermissionApplication.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' },
      take: limit,
    });
  }

  async reviewApplication(
    adminId: string,
    applicationId: string,
    action: 'approve' | 'reject',
    notes?: string,
  ) {
    const application = await this.prisma.publishingPermissionApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) {
      throw new NotFoundException('发布权限申请不存在');
    }
    if (application.status !== 'PENDING') {
      throw new BadRequestException('申请已处理');
    }

    const now = new Date();
    if (action === 'reject') {
      const rejected = await this.prisma.publishingPermissionApplication.update({
        where: { id: application.id },
        data: {
          status: 'REJECTED',
          reviewNotes: notes ?? null,
          reviewedById: adminId,
          decidedAt: now,
        },
      });
      await this.auditLog.record({
        actorId: adminId,
        action: 'PUBLISHING_PERMISSION_APPLICATION_REJECTED',
        targetType: application.subjectType,
        targetId: application.subjectId,
        after: { applicationId, reviewNotes: notes ?? null },
      });
      return rejected;
    }

    await this.grantPermission(
      application.subjectType as 'USER' | 'ORGANIZATION',
      application.subjectId,
      application.requestedLevel as PublishingLevel,
      adminId,
      `approved_application:${application.id}`,
    );

    const approved = await this.prisma.publishingPermissionApplication.update({
      where: { id: application.id },
      data: {
        status: 'APPROVED',
        reviewNotes: notes ?? null,
        reviewedById: adminId,
        decidedAt: now,
      },
    });

    await this.auditLog.record({
      actorId: adminId,
      action: 'PUBLISHING_PERMISSION_APPLICATION_APPROVED',
      targetType: application.subjectType,
      targetId: application.subjectId,
      after: {
        applicationId: application.id,
        level: application.requestedLevel,
      },
    });

    return approved;
  }

  async canPublicRecruit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    void userId;
    return {
      allowed: false,
      reason: MATCH_SQUARE_FROZEN_MESSAGE,
    };
  }

  /** 可信旅行项目公开发布（Professional/Agency 认证 + 发布权限） */
  async canPublishPublicTrustedProject(
    userId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const permission = await this.getUserPermission(userId);
    if (permission.status === 'SUSPENDED') {
      return {
        allowed: false,
        reason: permission.reason ?? '发布权限已暂停',
      };
    }
    if (!isPublicPublishingLevel(permission.level)) {
      return {
        allowed: false,
        reason: '公开发布需完成专业/机构认证并申请发布权限',
      };
    }

    const professional = await this.professionalCertification.getStatus(userId);
    if (professional.isVerifiedProfessional) {
      return { allowed: true };
    }

    const agencyVerified = await this.userHasVerifiedAgencyMembership(userId);
    if (agencyVerified) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: '公开发布需完成专业领队或机构认证，并申请发布权限',
    };
  }

  async assertPublicRecruitAllowed(userId: string): Promise<void> {
    const check = await this.canPublicRecruit(userId);
    if (!check.allowed) {
      throw new ForbiddenException({
        code: 'PUBLISHING_PERMISSION_DENIED',
        message: check.reason ?? MATCH_SQUARE_FROZEN_MESSAGE,
      });
    }
  }

  async assertPublishPublicTrustedProjectAllowed(userId: string): Promise<void> {
    const check = await this.canPublishPublicTrustedProject(userId);
    if (!check.allowed) {
      throw new ForbiddenException({
        code: 'PUBLISHING_PERMISSION_DENIED',
        message: check.reason ?? '无权公开发布可信旅行项目',
      });
    }
  }

  private async userHasVerifiedAgencyMembership(userId: string): Promise<boolean> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: {
        Organization: { select: { verificationStatus: true } },
      },
    });
    return memberships.some((membership) => membership.Organization.verificationStatus === 'VERIFIED');
  }

  private async grantPermission(
    subjectType: 'USER' | 'ORGANIZATION',
    subjectId: string,
    level: PublishingLevel,
    grantedById: string,
    reason: string,
  ) {
    const existing = await this.prisma.publishingPermission.findFirst({
      where: { subjectType, subjectId, status: 'ACTIVE' },
    });

    if (existing) {
      await this.prisma.publishingPermission.update({
        where: { id: existing.id },
        data: {
          level,
          reason,
          grantedById,
          grantedAt: new Date(),
          suspendedAt: null,
        },
      });
      return;
    }

    await this.prisma.publishingPermission.create({
      data: {
        subjectType,
        subjectId,
        level,
        status: 'ACTIVE',
        reason,
        grantedById,
      },
    });
  }

  private async assertApplicationPrerequisites(
    userId: string,
    requestedLevel: PublishingLevel,
    subjectType: 'USER' | 'ORGANIZATION',
    subjectId: string,
  ) {
    const summary = await this.verification.getSummary(userId);
    if (!summary.emailVerified && !summary.phoneVerified) {
      throw new BadRequestException('申请公开发布权限前需完成手机号或邮箱验证');
    }

    if (requestedLevel === 'PUBLIC_COMMERCIAL') {
      if (subjectType === 'ORGANIZATION') {
        const verified = await this.agencyCertification.isOrganizationVerified(subjectId);
        if (!verified) {
          throw new BadRequestException('商业发布权限需机构企业认证通过');
        }
        return;
      }

      const professional = await this.professionalCertification.getStatus(userId);
      if (!professional.isVerifiedProfessional) {
        throw new BadRequestException('商业发布权限需 Professional 专业认证通过');
      }
    }
  }

  private async assertOrgManager(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    const canManage = membership?.roles.some((r) =>
      ['OWNER', 'AGENCY_ADMIN'].includes(r.toUpperCase()),
    );
    if (!membership || membership.status !== 'ACTIVE' || !canManage) {
      throw new ForbiddenException('无权代表该机构提交申请');
    }
  }

  private async ensureFreeSubscription(userId: string): Promise<void> {
    const existing = await this.prisma.subscription.findFirst({
      where: { accountScope: 'USER', accountId: userId, status: 'ACTIVE' },
    });
    if (existing) return;

    await this.prisma.subscription.create({
      data: {
        accountScope: 'USER',
        accountId: userId,
        plan: 'FREE',
        status: 'ACTIVE',
        entitlements: { tools: ['basic'] },
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'SUBSCRIPTION_DEFAULT_CREATED',
      targetType: 'USER',
      targetId: userId,
      after: { plan: 'FREE' },
    });
  }

  private async ensureDefaultPublishingPermission(userId: string): Promise<void> {
    const existing = await this.prisma.publishingPermission.findFirst({
      where: { subjectType: 'USER', subjectId: userId },
    });
    if (existing) return;

    await this.prisma.publishingPermission.create({
      data: {
        subjectType: 'USER',
        subjectId: userId,
        level: 'PRIVATE_ONLY',
        status: 'ACTIVE',
        reason: 'default_private_only',
        grantedById: userId,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'PUBLISHING_PERMISSION_DEFAULT_GRANTED',
      targetType: 'USER',
      targetId: userId,
      after: { level: 'PRIVATE_ONLY', status: 'ACTIVE' },
    });
  }

  private toView(row: {
    subjectType: string;
    subjectId: string;
    level: string;
    status: string;
    reason: string | null;
    grantedAt: Date;
    suspendedAt: Date | null;
  }): PublishingPermissionView {
    return {
      subjectType: row.subjectType as PublishingPermissionView['subjectType'],
      subjectId: row.subjectId,
      level: row.level as PublishingLevel,
      status: row.status as PublishingPermissionStatus,
      reason: row.reason,
      grantedAt: row.grantedAt,
      suspendedAt: row.suspendedAt,
    };
  }
}
