import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountContextType } from '../constants/identity-governance.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { PublishingPermissionService } from './publishing-permission.service';
import { VerificationService } from './verification.service';
import { ProfessionalCertificationService } from './professional-certification.service';

export type AccountContextView = {
  contextType: AccountContextType;
  contextId: string | null;
  label: string;
  isActive: boolean;
};

@Injectable()
export class AccountContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly publishingPermission: PublishingPermissionService,
    private readonly verification: VerificationService,
    private readonly professionalCertification: ProfessionalCertificationService,
  ) {}

  async getOverview(userId: string) {
    await this.publishingPermission.ensureUserDefaults(userId);
    const contexts = await this.ensureContexts(userId);
    const active = contexts.find((c) => c.isActive) ?? contexts[0];
    const verification = await this.verification.getSummary(userId);
    const publishing = await this.publishingPermission.getUserPermission(userId);
    const professional = await this.professionalCertification.getStatus(userId);
    const organizations = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { Organization: { select: { id: true, displayName: true, verificationStatus: true } } },
    });

    const agencyVerified = organizations.some(
      (m) => m.Organization.verificationStatus === 'VERIFIED',
    );

    return {
      userId,
      activeContext: active,
      contexts,
      verification,
      verifications: verification.records.map((record) => ({
        type: record.verificationType,
        status: record.status,
        verifiedAt: record.verifiedAt,
        expiresAt: record.expiresAt,
      })),
      publishingPermission: publishing,
      professional: {
        isVerifiedProfessional: professional.isVerifiedProfessional,
        status: professional.certification?.status ?? 'NOT_STARTED',
        verifiedAt: professional.certification?.verifiedAt ?? null,
      },
      agency: {
        isVerified: agencyVerified,
        status: agencyVerified ? 'VERIFIED' : 'DRAFT',
      },
      subscriptions: await this.prisma.subscription.findMany({
        where: { accountScope: 'USER', accountId: userId, status: 'ACTIVE' },
        orderBy: { validFrom: 'desc' },
        take: 1,
        select: { plan: true, status: true },
      }),
      projectMemberships: await this.prisma.projectMembership.findMany({
        where: { userId, status: 'ACTIVE' },
        select: { tripId: true, roles: true },
        take: 20,
      }),
      organizationMemberships: organizations.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.Organization.displayName,
        verificationStatus: m.Organization.verificationStatus,
        roles: m.roles,
        status: m.status,
      })),
      organizations: organizations.map((m) => ({
        organizationId: m.organizationId,
        displayName: m.Organization.displayName,
        verificationStatus: m.Organization.verificationStatus,
        roles: m.roles,
      })),
    };
  }

  async switchContext(
    userId: string,
    contextType: AccountContextType,
    contextId?: string,
  ): Promise<AccountContextView[]> {
    if (contextType === 'organization') {
      if (!contextId) {
        throw new BadRequestException('切换机构上下文需要提供 organizationId');
      }
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: contextId,
            userId,
          },
        },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new NotFoundException('未找到有效的机构成员关系');
      }
    }

    await this.prisma.userAccountContext.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    const target = await this.prisma.userAccountContext.findFirst({
      where: {
        userId,
        contextType,
        contextId: contextType === 'organization' ? contextId ?? null : null,
      },
    });

    if (!target) {
      throw new NotFoundException('上下文不存在');
    }

    const updated = await this.prisma.userAccountContext.update({
      where: { id: target.id },
      data: { isActive: true },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'ACCOUNT_CONTEXT_SWITCHED',
      targetType: 'USER',
      targetId: userId,
      after: {
        contextType: updated.contextType,
        contextId: updated.contextId,
      },
    });

    return this.ensureContexts(userId);
  }

  private async ensureContexts(userId: string): Promise<AccountContextView[]> {
    const existing = await this.prisma.userAccountContext.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (existing.length === 0) {
      await this.prisma.userAccountContext.create({
        data: {
          userId,
          contextType: 'personal',
          isActive: true,
        },
      });
      return this.ensureContexts(userId);
    }

    if (!existing.some((c) => c.isActive)) {
      await this.prisma.userAccountContext.update({
        where: { id: existing[0].id },
        data: { isActive: true },
      });
      return this.ensureContexts(userId);
    }

    return existing.map((row) => ({
      contextType: row.contextType as AccountContextType,
      contextId: row.contextId,
      label: this.contextLabel(row.contextType as AccountContextType, row.contextId),
      isActive: row.isActive,
    }));
  }

  private contextLabel(contextType: AccountContextType, contextId: string | null): string {
    if (contextType === 'personal') return '个人旅行';
    if (contextType === 'professional') return '专业服务';
    return contextId ? `机构 ${contextId}` : '机构空间';
  }
}
