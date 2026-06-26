import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityAuditLogService } from './audit-log.service';

@Injectable()
export class OrganizationWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async createDraft(userId: string, displayName: string) {
    const trimmed = displayName.trim();
    if (!trimmed) {
      throw new BadRequestException('机构名称不能为空');
    }

    const organization = await this.prisma.organization.create({
      data: {
        displayName: trimmed,
        ownerId: userId,
        verificationStatus: 'DRAFT',
        members: {
          create: {
            userId,
            roles: ['OWNER'],
            status: 'ACTIVE',
            acceptedAt: new Date(),
          },
        },
      },
      include: { members: true },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'AGENCY_DRAFT_CREATED',
      targetType: 'ORGANIZATION',
      targetId: organization.id,
      after: { displayName: trimmed, verificationStatus: 'DRAFT' },
    });

    return organization;
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'INVITED'] },
      },
      include: {
        Organization: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return memberships.map((m) => ({
      organizationId: m.organizationId,
      displayName: m.Organization.displayName,
      verificationStatus: m.Organization.verificationStatus,
      roles: m.roles,
      memberStatus: m.status,
    }));
  }
}
