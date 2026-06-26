import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityAuditLogService } from './audit-log.service';

const MANAGER_ROLES = ['OWNER', 'AGENCY_ADMIN'];

@Injectable()
export class OrganizationMemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async listMembers(organizationId: string, actorUserId: string) {
    await this.assertCanManage(organizationId, actorUserId);
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
      include: {
        User: { select: { id: true, email: true, displayName: true } },
      },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      email: m.User.email,
      displayName: m.User.displayName,
      roles: m.roles,
      status: m.status,
      invitedAt: m.invitedAt,
      acceptedAt: m.acceptedAt,
    }));
  }

  async inviteMember(
    organizationId: string,
    actorUserId: string,
    email: string,
    roles: string[],
  ) {
    await this.assertCanManage(organizationId, actorUserId);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('邮箱不能为空');
    }

    const invitee = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });
    if (!invitee) {
      throw new BadRequestException('该邮箱尚未注册 TripNARA 账号，请先邀请对方注册');
    }

    const normalizedRoles = roles.length ? roles.map((r) => r.toUpperCase()) : ['ADVISOR'];
    if (normalizedRoles.includes('OWNER')) {
      throw new BadRequestException('不能通过邀请授予 OWNER 角色');
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: invitee.id },
      },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new BadRequestException('该用户已是机构成员');
    }

    const member = await this.prisma.organizationMember.upsert({
      where: {
        organizationId_userId: { organizationId, userId: invitee.id },
      },
      create: {
        organizationId,
        userId: invitee.id,
        roles: normalizedRoles,
        status: 'INVITED',
      },
      update: {
        roles: normalizedRoles,
        status: 'INVITED',
        invitedAt: new Date(),
        acceptedAt: null,
      },
    });

    await this.auditLog.record({
      actorId: actorUserId,
      action: 'ORGANIZATION_MEMBER_INVITED',
      targetType: 'ORGANIZATION',
      targetId: organizationId,
      after: { inviteeUserId: invitee.id, roles: normalizedRoles },
    });

    return {
      memberId: member.id,
      userId: invitee.id,
      email: invitee.email,
      roles: normalizedRoles,
      status: 'INVITED',
    };
  }

  async acceptInvite(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('未找到机构邀请');
    }
    if (membership.status !== 'INVITED') {
      throw new BadRequestException('邀请状态无效');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE', acceptedAt: new Date() },
    });

    const existingContext = await this.prisma.userAccountContext.findFirst({
      where: { userId, contextType: 'organization', contextId: organizationId },
    });
    if (!existingContext) {
      await this.prisma.userAccountContext.create({
        data: {
          userId,
          contextType: 'organization',
          contextId: organizationId,
          isActive: false,
        },
      });
    }

    await this.auditLog.record({
      actorId: userId,
      action: 'ORGANIZATION_MEMBER_ACCEPTED',
      targetType: 'ORGANIZATION',
      targetId: organizationId,
    });

    return updated;
  }

  async declineInvite(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership || membership.status !== 'INVITED') {
      throw new NotFoundException('未找到待处理的邀请');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: membership.id },
      data: { status: 'LEFT' },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'ORGANIZATION_MEMBER_DECLINED',
      targetType: 'ORGANIZATION',
      targetId: organizationId,
    });

    return updated;
  }

  async removeMember(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
  ) {
    await this.assertCanManage(organizationId, actorUserId);

    const target = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: targetUserId } },
    });
    if (!target) {
      throw new NotFoundException('成员不存在');
    }
    if (target.roles.some((r) => r.toUpperCase() === 'OWNER')) {
      throw new BadRequestException('不能移除机构 Owner');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: target.id },
      data: { status: 'REMOVED' },
    });

    await this.auditLog.record({
      actorId: actorUserId,
      action: 'ORGANIZATION_MEMBER_REMOVED',
      targetType: 'ORGANIZATION',
      targetId: organizationId,
      after: { targetUserId },
    });

    return updated;
  }

  async listPendingInvites(userId: string) {
    const rows = await this.prisma.organizationMember.findMany({
      where: { userId, status: 'INVITED' },
      include: { Organization: { select: { id: true, displayName: true } } },
    });
    return rows.map((r) => ({
      organizationId: r.organizationId,
      displayName: r.Organization.displayName,
      roles: r.roles,
      invitedAt: r.invitedAt,
    }));
  }

  private async assertCanManage(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    const canManage =
      membership?.status === 'ACTIVE' &&
      membership.roles.some((r) => MANAGER_ROLES.includes(r.toUpperCase()));
    if (!canManage) {
      throw new ForbiddenException('无权管理机构成员');
    }
  }
}
