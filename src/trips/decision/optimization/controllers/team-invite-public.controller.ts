/**
 * 团队邀请公开 API（无需认证）
 *
 * GET /v2/team/invites/:token - 获取邀请信息
 * POST /v2/team/invites/:token/join - 通过邀请加入团队
 */

import { Controller, Get, Post, Body, Param, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Public } from '../../../../auth/decorators/public.decorator';
import { TeamInviteService, InviteInfo, JoinByInviteInput } from '../collaboration/team-invite.service';
import { TeamCollaborationService } from '../collaboration/team-collaboration.service';

@ApiTags('Team - Invites (Public)')
@Controller('v2/team/invites')
export class TeamInvitePublicController {
  private readonly logger = new Logger(TeamInvitePublicController.name);

  constructor(
    private readonly inviteService: TeamInviteService,
    private readonly teamService: TeamCollaborationService,
  ) {}

  @Public()
  @Get(':token')
  @ApiOperation({ summary: '获取邀请信息（无需认证）' })
  @ApiParam({ name: 'token', description: '邀请 token' })
  @ApiResponse({ status: 200, description: '返回邀请信息' })
  async getInviteInfo(@Param('token') token: string): Promise<InviteInfo> {
    const info = await this.inviteService.getInviteInfoByToken(token);
    if (!info.valid) {
      throw new NotFoundException({ message: '邀请链接无效或已过期', code: 'TEAM_INVITE_INVALID' });
    }
    return info;
  }

  @Public()
  @Post(':token/join')
  @ApiOperation({ summary: '通过邀请链接加入团队（无需认证）' })
  @ApiParam({ name: 'token', description: '邀请 token' })
  @ApiResponse({ status: 200, description: '返回团队及新成员信息' })
  @ApiResponse({ status: 404, description: '邀请无效或已过期' })
  @ApiResponse({ status: 409, description: '已是团队成员' })
  async joinByToken(
    @Param('token') token: string,
    @Body() dto: { displayName: string; role?: string; fitnessLevel?: string; experienceLevel?: string; userId?: string },
  ) {
    const input: JoinByInviteInput = {
      displayName: dto.displayName ?? '',
      role: (dto.role as JoinByInviteInput['role']) ?? 'MEMBER',
      fitnessLevel: (dto.fitnessLevel as JoinByInviteInput['fitnessLevel']) ?? 'INTERMEDIATE',
      experienceLevel: (dto.experienceLevel as JoinByInviteInput['experienceLevel']) ?? 'SOME_EXPERIENCE',
      userId: dto.userId,
    };
    try {
      const result = await this.inviteService.joinByToken(token, input);
      const team = await this.teamService.getTeam(result.teamId);
      return { teamId: result.teamId, member: result.member, team };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('TEAM_INVITE_NOT_FOUND') || msg.includes('TEAM_INVITE_EXPIRED') || msg.includes('TEAM_INVITE_MAX_USES')) {
        throw new NotFoundException({ message: msg.replace(/^[A-Z_]+:\s*/, ''), code: 'TEAM_INVITE_INVALID' });
      }
      if (msg.includes('TEAM_ALREADY_MEMBER')) {
        throw new ConflictException({ message: '您已是该团队成员', code: 'TEAM_ALREADY_MEMBER' });
      }
      throw e;
    }
  }
}
