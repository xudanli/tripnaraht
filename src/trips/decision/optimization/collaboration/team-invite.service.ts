/**
 * 团队邀请服务
 *
 * 实现邀请链接的创建、校验、加入与撤销
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TeamCollaborationService } from './team-collaboration.service';
import { DEFAULT_OBJECTIVE_WEIGHTS } from '../objective-function.interface';
import type { TeamMember } from './multi-user-collaboration.interface';

const INVITE_TOKEN_BYTES = 24; // 约 32 字符 base64url

export interface CreateInviteInput {
  teamId: string;
  inviterUserId: string;
  expiresInDays?: number;
  maxUses?: number;
  tripId?: string;
}

export interface CreateInviteResult {
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
  expiresInDays: number;
}

export interface InviteInfo {
  valid: boolean;
  teamId?: string;
  teamName?: string;
  tripId?: string;
  tripTitle?: string;
  inviterDisplayName?: string;
  expiresAt?: string;
  memberCount?: number;
}

export interface JoinByInviteInput {
  displayName: string;
  role?: 'LEADER' | 'MEMBER' | 'OBSERVER';
  fitnessLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  experienceLevel?: 'NOVICE' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | 'EXPERT';
  userId?: string; // 若已登录则传入；否则生成 invite_xxx
}

export interface InviteListItem {
  inviteToken: string;
  inviteUrl: string;
  expiresAt: string;
  usesCount: number;
  maxUses: number;
}

@Injectable()
export class TeamInviteService {
  private readonly logger = new Logger(TeamInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teamService: TeamCollaborationService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /** 生成安全随机 token */
  private generateToken(): string {
    const bytes = new Uint8Array(INVITE_TOKEN_BYTES);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /** 获取邀请链接基础 URL（前端 join-team 页地址） */
  private getInviteBaseUrl(): string {
    const url =
      this.configService?.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'https://example.com';
    return String(url).replace(/\/$/, '');
  }

  /**
   * 检查用户是否为团队创建者或领队（可生成邀请）
   */
  async canCreateInvite(teamId: string, userId: string): Promise<boolean> {
    const team = await this.teamService.getTeam(teamId);
    if (!team) return false;
    const member = team.members.find((m) => m.userId === userId);
    return member?.role === 'LEADER';
  }

  /**
   * 创建邀请链接
   */
  async createInvite(input: CreateInviteInput): Promise<CreateInviteResult> {
    const { teamId, inviterUserId, tripId } = input;
    const expiresInDays = input.expiresInDays ?? 7;
    const maxUses = input.maxUses ?? 0;

    const canCreate = await this.canCreateInvite(teamId, inviterUserId);
    if (!canCreate) {
      throw new Error('TEAM_INVITE_FORBIDDEN: 仅团队创建者或领队可生成邀请');
    }

    const team = await this.teamService.getTeam(teamId);
    if (!team) {
      throw new Error(`TEAM_NOT_FOUND: 团队不存在 ${teamId}`);
    }

    let inviteToken = this.generateToken();
    while (await this.prisma.collaborationTeamInvite.findUnique({ where: { inviteToken } })) {
      inviteToken = this.generateToken();
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await this.prisma.collaborationTeamInvite.create({
      data: {
        teamId,
        inviteToken,
        inviterUserId,
        tripId: tripId ?? undefined,
        expiresAt,
        maxUses,
      },
    });

    const baseUrl = this.getInviteBaseUrl();
    const inviteUrl = `${baseUrl}/join-team/${inviteToken}`;

    this.logger.log(`[TeamInvite] 创建邀请: ${teamId} -> ${inviteToken.slice(0, 8)}...`);
    return {
      inviteToken,
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInDays,
    };
  }

  /**
   * 通过 token 获取邀请信息（公开，无需认证）
   */
  async getInviteInfoByToken(token: string): Promise<InviteInfo> {
    const invite = await this.prisma.collaborationTeamInvite.findUnique({
      where: { inviteToken: token },
      include: { team: { include: { members: true } } },
    });
    if (!invite) {
      return { valid: false };
    }
    const now = new Date();
    if (invite.expiresAt < now) {
      return { valid: false };
    }
    if (invite.maxUses > 0 && invite.usesCount >= invite.maxUses) {
      return { valid: false };
    }

    const inviter = invite.team.members.find((m) => m.userId === invite.inviterUserId);

    let tripTitle: string | undefined;
    if (invite.tripId) {
      const trip = await this.prisma.trip.findUnique({
        where: { id: invite.tripId },
        select: { name: true },
      });
      tripTitle = trip?.name ?? undefined;
    }

    return {
      valid: true,
      teamId: invite.teamId,
      teamName: invite.team.name,
      tripId: invite.tripId ?? undefined,
      tripTitle,
      inviterDisplayName: inviter?.displayName ?? '邀请人',
      expiresAt: invite.expiresAt.toISOString(),
      memberCount: invite.team.members.length,
    };
  }

  /**
   * 通过 token 加入团队
   */
  async joinByToken(token: string, input: JoinByInviteInput): Promise<{ teamId: string; member: TeamMember }> {
    const invite = await this.prisma.collaborationTeamInvite.findUnique({
      where: { inviteToken: token },
      include: { team: { include: { members: true } } },
    });
    if (!invite) {
      throw new Error('TEAM_INVITE_NOT_FOUND: 邀请链接无效或已过期');
    }
    const now = new Date();
    if (invite.expiresAt < now) {
      throw new Error('TEAM_INVITE_EXPIRED: 邀请链接已过期');
    }
    if (invite.maxUses > 0 && invite.usesCount >= invite.maxUses) {
      throw new Error('TEAM_INVITE_MAX_USES: 邀请链接已达到最大使用次数');
    }

    const userId =
      input.userId && input.userId.trim()
        ? input.userId.trim()
        : `invite_${token.slice(0, 12)}_${Date.now()}`;

    const existing = invite.team.members.find((m) => m.userId === userId);
    if (existing) {
      throw new Error('TEAM_ALREADY_MEMBER: 您已是该团队成员');
    }

    const displayName = (input.displayName ?? '').trim() || userId;
    const role = input.role ?? 'MEMBER';
    const fitnessLevel = input.fitnessLevel ?? 'INTERMEDIATE';
    const experienceLevel = input.experienceLevel ?? 'SOME_EXPERIENCE';

    const memberInput = {
      userId,
      displayName,
      role,
      decisionWeight: 1,
      fitnessLevel,
      experienceLevel,
      personalWeights: DEFAULT_OBJECTIVE_WEIGHTS,
      specialConstraints: undefined,
    };

    await this.teamService.addMember(invite.teamId, memberInput);

    await this.prisma.collaborationTeamInvite.update({
      where: { id: invite.id },
      data: { usesCount: { increment: 1 } },
    });

    const team = await this.teamService.getTeam(invite.teamId);
    const member = team!.members.find((m) => m.userId === userId)!;
    this.logger.log(`[TeamInvite] 用户加入: ${displayName} -> ${invite.team.name}`);
    return { teamId: invite.teamId, member };
  }

  /**
   * 列出团队有效邀请
   */
  async listInvites(teamId: string): Promise<{ invites: InviteListItem[] }> {
    const now = new Date();
    const rows = await this.prisma.collaborationTeamInvite.findMany({
      where: { teamId, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = this.getInviteBaseUrl();
    const invites = rows
      .filter((r) => r.maxUses === 0 || r.usesCount < r.maxUses)
      .map((r) => ({
        inviteToken: r.inviteToken,
        inviteUrl: `${baseUrl}/join-team/${r.inviteToken}`,
        expiresAt: r.expiresAt.toISOString(),
        usesCount: r.usesCount,
        maxUses: r.maxUses,
      }));
    return { invites };
  }

  /**
   * 撤销邀请
   */
  async revokeInvite(teamId: string, token: string): Promise<void> {
    const invite = await this.prisma.collaborationTeamInvite.findFirst({
      where: { teamId, inviteToken: token },
    });
    if (!invite) {
      throw new Error('TEAM_INVITE_NOT_FOUND: 邀请链接不存在');
    }
    await this.prisma.collaborationTeamInvite.delete({ where: { id: invite.id } });
    this.logger.log(`[TeamInvite] 撤销邀请: ${teamId} -> ${token.slice(0, 8)}...`);
  }
}
