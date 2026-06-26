// src/trips/decision/optimization/controllers/user/team-user.controller.ts
/**
 * 用户端 - 团队协同 API
 * 
 * 提供多用户（家庭/团队）协同决策功能
 */

import { Controller, Post, Get, Delete, Patch, Body, Param, Req, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { IsOptional, IsString, IsObject, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';

import { TeamCollaborationService } from '../../collaboration/team-collaboration.service';
import { mapTeamNegotiationToApiResponse, type TeamNegotiationApiResponse } from '../../utils/guardian-negotiation-api.mapper';
import { TeamInviteService } from '../../collaboration/team-invite.service';
import { NegotiateContextLoaderService } from '../../collaboration/negotiate-context-loader.service';
import { GuardianChooseService } from '../../services/guardian-choose.service';
import { CurrentUser, CurrentUserPayload } from '../../../../../auth/decorators/current-user.decorator';
import {
  TeamConfig,
  TeamMember,
  TeamNegotiationResult,
  DecisionWeightMode,
} from '../../collaboration/multi-user-collaboration.interface';
import { ObjectiveFunctionWeights } from '../../objective-function.interface';
import { RoutePlanDraft, WorldModelContext } from '../../../shared/world-model.types';

// ========== Request DTOs ==========

export class CreateTeamDto {
  /** 团队名称 */
  @IsOptional()
  @IsString()
  name?: string;
  /** 团队类型 */
  @IsOptional()
  @IsString()
  type?: string;
  /** 决策权重模式（EQUAL | LEADER_PRIORITY | CAPABILITY_BASED | EXPERIENCE_BASED | CUSTOM，非法时后端用 EQUAL） */
  @IsOptional()
  @IsString()
  decisionWeightMode?: string;
  /** 成员列表 */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  members?: TeamMemberInput[];
  /** 团队约束配置 */
  @IsOptional()
  @IsObject()
  teamConstraints?: {
    useWeakestLink: boolean;
    maxAcceptableDisagreement: number;
    unanimityRequired: string[];
  };
}

export class TeamMemberInput {
  /** 用户 ID */
  userId!: string;
  /** 显示名称 */
  displayName!: string;
  /** 角色 */
  role!: 'LEADER' | 'MEMBER' | 'OBSERVER';
  /** 决策权重 (0-1) */
  decisionWeight!: number;
  /** 体能等级 */
  fitnessLevel!: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  /** 经验等级 */
  experienceLevel!: 'NOVICE' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | 'EXPERT';
  /** 个人偏好权重 */
  personalWeights!: ObjectiveFunctionWeights;
  /** 特殊约束 */
  specialConstraints?: {
    /** 每日最大爬升 (米) */
    maxDailyAscentM?: number;
    /** 每日最大活动时长 (小时) */
    maxDailyHours?: number;
    /** 海拔限制 (米) */
    altitudeLimit?: number;
    /** 休息频率 */
    restFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
    /** 特殊需求 */
    specialNeeds?: string[];
  };
}

export class AddMemberDto extends TeamMemberInput {}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  displayName?: string;
  @IsOptional()
  @IsString()
  role?: 'LEADER' | 'MEMBER' | 'OBSERVER';
  @IsOptional()
  @IsNumber()
  decisionWeight?: number;
  @IsOptional()
  @IsString()
  fitnessLevel?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  @IsOptional()
  @IsString()
  experienceLevel?: 'NOVICE' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | 'EXPERT';
  @IsOptional()
  @IsObject()
  personalWeights?: ObjectiveFunctionWeights;
  @IsOptional()
  @IsObject()
  specialConstraints?: TeamMemberInput['specialConstraints'];
}

export class CreateInviteDto {
  @IsOptional()
  @IsNumber()
  expiresInDays?: number;
  @IsOptional()
  @IsNumber()
  maxUses?: number;
  @IsOptional()
  @IsString()
  tripId?: string;
}

export class TeamNegotiateDto {
  /** 待协商的计划（与 world 二选一：若只传 tripId 则后端按 tripId 加载 plan + world） */
  @IsOptional()
  @IsObject()
  plan?: RoutePlanDraft;

  /** 世界模型上下文 */
  @IsOptional()
  @IsObject()
  world?: WorldModelContext;

  /** 行程 ID：仅当不传 plan/world 时使用，后端将根据 tripId 加载行程并构建 plan 与 world 再协商 */
  @IsOptional()
  @IsString()
  tripId?: string;
}

// ========== Response Types ==========

export interface TeamWeightsResponse {
  /** 团队综合权重 */
  weights: ObjectiveFunctionWeights;
  /** 各成员贡献 */
  memberContributions: Array<{
    userId: string;
    displayName: string;
    contributionWeight: number;
  }>;
}

export interface TeamConstraintsResponse {
  /** 最弱链约束 */
  constraints: TeamMember['specialConstraints'];
  /** 约束来源 */
  constraintSources: Array<{
    constraint: string;
    sourceUserId: string;
    sourceDisplayName: string;
  }>;
}

@ApiTags('User - Team')
@ApiBearerAuth()
@Controller('v2/user/team')
export class TeamUserController {
  private readonly logger = new Logger(TeamUserController.name);

  constructor(
    private readonly teamService: TeamCollaborationService,
    private readonly inviteService: TeamInviteService,
    private readonly negotiateLoader: NegotiateContextLoaderService,
    private readonly guardianChoose: GuardianChooseService,
  ) {}

  // ========== 团队管理 ==========

  @Post()
  @ApiOperation({ 
    summary: '创建团队',
    description: '创建新的协作团队，设置成员和决策模式'
  })
  @ApiResponse({ status: 201, description: '返回创建的团队' })
  async createTeam(@Body() dto: CreateTeamDto, @Req() req: Request): Promise<TeamConfig> {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const name = (dto.name ?? raw.name ?? raw.team_name) as string;
    const typeRaw = String(dto.type ?? raw.type ?? 'CUSTOM').toUpperCase();
    const type = ['FAMILY', 'FRIENDS', 'EXPEDITION', 'TOUR_GROUP', 'CUSTOM'].includes(typeRaw) ? typeRaw : 'CUSTOM';
    const modeRaw = String(dto.decisionWeightMode ?? raw.decisionWeightMode ?? raw.decision_weight_mode ?? 'EQUAL').toUpperCase();
    const decisionWeightMode = ['EQUAL', 'LEADER_PRIORITY', 'CAPABILITY_BASED', 'EXPERIENCE_BASED', 'CUSTOM'].includes(modeRaw) ? modeRaw : 'EQUAL';
    this.logger.log(`[User] 创建团队: ${name || '(未命名)'}`);

    const members = Array.isArray(dto.members) ? dto.members : (Array.isArray(raw.members) ? raw.members : []) as TeamMemberInput[];
    return this.teamService.createTeam({
      name: name || '未命名团队',
      type: type as TeamConfig['type'],
      decisionWeightMode: decisionWeightMode as DecisionWeightMode,
      members: members.map((m: TeamMemberInput) => ({
        ...m,
        joinedAt: new Date().toISOString(),
      })),
      teamConstraints: dto.teamConstraints || {
        useWeakestLink: true,
        maxAcceptableDisagreement: 0.3,
        unanimityRequired: ['SAFETY_CRITICAL'],
      },
    });
  }

  @Get(':teamId')
  @ApiOperation({ 
    summary: '获取团队信息',
    description: '返回团队配置和成员列表'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回团队信息' })
  async getTeam(@Param('teamId') teamId: string): Promise<TeamConfig | null> {
    return (await this.teamService.getTeam(teamId)) ?? null;
  }

  // ========== 邀请链接 ==========

  @Post(':teamId/invites')
  @ApiOperation({ summary: '生成邀请链接' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 201, description: '返回邀请链接' })
  @ApiResponse({ status: 403, description: '无权限（仅创建者/领队可生成）' })
  async createInvite(
    @Param('teamId') teamId: string,
    @Body() dto: CreateInviteDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId;
    if (!userId) {
      throw new ForbiddenException({ message: '需要登录才能生成邀请', code: 'UNAUTHORIZED' });
    }
    const raw = (dto as Record<string, unknown>) || {};
    const expiresInDays = dto.expiresInDays ?? (raw.expiresInDays as number) ?? 7;
    const maxUses = dto.maxUses ?? (raw.maxUses as number) ?? 0;
    const tripId = (dto.tripId ?? (raw.tripId as string))?.trim() || undefined;
    try {
      return await this.inviteService.createInvite({
        teamId,
        inviterUserId: userId,
        expiresInDays,
        maxUses,
        tripId,
      });
    } catch (e: any) {
      if (String(e?.message).includes('TEAM_INVITE_FORBIDDEN')) {
        throw new ForbiddenException({ message: '仅团队创建者或领队可生成邀请', code: 'TEAM_INVITE_FORBIDDEN' });
      }
      if (String(e?.message).includes('TEAM_NOT_FOUND')) {
        throw new BadRequestException({ message: '团队不存在', code: 'TEAM_NOT_FOUND' });
      }
      throw e;
    }
  }

  @Get(':teamId/invites')
  @ApiOperation({ summary: '列出团队有效邀请' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回邀请列表' })
  async listInvites(
    @Param('teamId') teamId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId;
    if (!userId) {
      throw new ForbiddenException({ message: '需要登录才能查看邀请', code: 'UNAUTHORIZED' });
    }
    const canCreate = await this.inviteService.canCreateInvite(teamId, userId);
    if (!canCreate) {
      throw new ForbiddenException({ message: '仅团队创建者或领队可查看邀请', code: 'TEAM_INVITE_FORBIDDEN' });
    }
    return this.inviteService.listInvites(teamId);
  }

  @Delete(':teamId/invites/:token')
  @ApiOperation({ summary: '撤销邀请链接' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiParam({ name: 'token', description: '邀请 token' })
  @ApiResponse({ status: 200, description: '撤销成功' })
  async revokeInvite(
    @Param('teamId') teamId: string,
    @Param('token') token: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId;
    if (!userId) {
      throw new ForbiddenException({ message: '需要登录才能撤销邀请', code: 'UNAUTHORIZED' });
    }
    const canCreate = await this.inviteService.canCreateInvite(teamId, userId);
    if (!canCreate) {
      throw new ForbiddenException({ message: '仅团队创建者或领队可撤销邀请', code: 'TEAM_INVITE_FORBIDDEN' });
    }
    try {
      await this.inviteService.revokeInvite(teamId, token);
      return { success: true };
    } catch (e: any) {
      if (String(e?.message).includes('TEAM_INVITE_NOT_FOUND')) {
        throw new BadRequestException({ message: '邀请链接不存在', code: 'TEAM_INVITE_NOT_FOUND' });
      }
      throw e;
    }
  }

  @Post(':teamId/members')
  @ApiOperation({ 
    summary: '添加成员',
    description: '向团队添加新成员'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回更新后的团队' })
  async addMember(
    @Param('teamId') teamId: string,
    @Body() dto: AddMemberDto,
    @Req() req: Request,
  ): Promise<TeamConfig> {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const member: AddMemberDto = {
      userId: (dto.userId ?? raw.userId ?? raw.user_id ?? '') as string,
      displayName: (dto.displayName ?? raw.displayName ?? raw.display_name ?? '') as string,
      role: (dto.role ?? raw.role ?? 'MEMBER') as AddMemberDto['role'],
      decisionWeight: Number(dto.decisionWeight ?? raw.decisionWeight ?? raw.decision_weight ?? 1),
      fitnessLevel: (dto.fitnessLevel ?? raw.fitnessLevel ?? raw.fitness_level ?? 'INTERMEDIATE') as AddMemberDto['fitnessLevel'],
      experienceLevel: (dto.experienceLevel ?? raw.experienceLevel ?? raw.experience_level ?? 'SOME_EXPERIENCE') as AddMemberDto['experienceLevel'],
      personalWeights: (dto.personalWeights ?? raw.personalWeights ?? raw.personal_weights ?? {}) as ObjectiveFunctionWeights,
      specialConstraints: (dto.specialConstraints ?? raw.specialConstraints ?? raw.special_constraints) as AddMemberDto['specialConstraints'],
    };
    this.logger.log(`[User] 添加成员: ${member.displayName || member.userId} -> ${teamId}`);
    return this.teamService.addMember(teamId, member);
  }

  @Delete(':teamId/members/:userId')
  @ApiOperation({ 
    summary: '移除成员',
    description: '从团队移除指定成员'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({ status: 200, description: '返回更新后的团队' })
  async removeMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ): Promise<TeamConfig> {
    this.logger.log(`[User] 移除成员: ${userId} <- ${teamId}`);
    return this.teamService.removeMember(teamId, userId);
  }

  @Patch(':teamId/members/:userId')
  @ApiOperation({
    summary: '更新成员',
    description: '更新团队成员角色、权重、能力等级、偏好权重或特殊约束',
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  @ApiResponse({ status: 200, description: '返回更新后的团队' })
  async updateMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
    @Req() req: Request,
  ): Promise<TeamConfig> {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const patch: Partial<Omit<TeamMember, 'userId' | 'joinedAt'>> = {};

    const displayName = dto.displayName ?? raw.displayName ?? raw.display_name;
    if (typeof displayName === 'string') patch.displayName = displayName;

    const role = dto.role ?? raw.role;
    if (typeof role === 'string') patch.role = role as TeamMember['role'];

    const decisionWeight = dto.decisionWeight ?? raw.decisionWeight ?? raw.decision_weight;
    if (decisionWeight !== undefined) patch.decisionWeight = Number(decisionWeight);

    const fitnessLevel = dto.fitnessLevel ?? raw.fitnessLevel ?? raw.fitness_level;
    if (typeof fitnessLevel === 'string') patch.fitnessLevel = fitnessLevel as TeamMember['fitnessLevel'];

    const experienceLevel = dto.experienceLevel ?? raw.experienceLevel ?? raw.experience_level;
    if (typeof experienceLevel === 'string') patch.experienceLevel = experienceLevel as TeamMember['experienceLevel'];

    const personalWeights = dto.personalWeights ?? raw.personalWeights ?? raw.personal_weights;
    if (personalWeights && typeof personalWeights === 'object') {
      patch.personalWeights = personalWeights as ObjectiveFunctionWeights;
    }

    const specialConstraints = dto.specialConstraints ?? raw.specialConstraints ?? raw.special_constraints;
    if (specialConstraints === null || (specialConstraints && typeof specialConstraints === 'object')) {
      patch.specialConstraints = specialConstraints as TeamMember['specialConstraints'];
    }

    this.logger.log(`[User] 更新成员: ${userId} -> ${teamId}`);
    return this.teamService.updateMember(teamId, userId, patch);
  }

  // ========== 团队决策 ==========

  @Post(':teamId/negotiate')
  @ApiOperation({ 
    summary: '团队协商',
    description: '启动团队协商流程，综合所有成员偏好进行决策'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回协商结果' })
  async negotiate(
    @Param('teamId') teamId: string,
    @Body() dto: TeamNegotiateDto,
    @Req() req: Request,
  ): Promise<TeamNegotiationApiResponse> {
    this.logger.log(`[User] 团队协商: ${teamId}`);

    let plan: RoutePlanDraft;
    let world: WorldModelContext;

    const raw = (req.body ?? {}) as Record<string, unknown>;
    const tripIdFromBody =
      dto?.tripId ?? (dto as Record<string, unknown>)?.trip_id ?? raw?.tripId ?? raw?.trip_id;
    const tripIdStr =
      typeof tripIdFromBody === 'string' ? tripIdFromBody.trim() : '';

    if (dto?.plan != null && dto?.world != null) {
      plan = dto.plan;
      world = dto.world;
    } else if (tripIdStr) {
      const loaded = await this.negotiateLoader.loadPlanAndWorld(tripIdStr);
      plan = loaded.plan;
      world = loaded.world;
    } else {
      if (dto?.plan == null) {
        throw new BadRequestException('请求体缺少 plan（待协商的计划）；或仅传 tripId 由后端加载');
      }
      throw new BadRequestException('请求体缺少 world（世界模型上下文）；或仅传 tripId 由后端加载');
    }

    const tripIdForPersist = tripIdStr || plan.tripId?.trim() || '';
    const response = mapTeamNegotiationToApiResponse(
      await this.teamService.negotiateAsTeam(teamId, plan, world),
    );

    if (
      tripIdForPersist &&
      response.decision === 'REQUIRES_DISCUSSION' &&
      response.humanDecisionPointsFlat?.length &&
      !response.hardConstraintBlocked
    ) {
      await this.guardianChoose.persistChooseContext(tripIdForPersist, {
        source: 'team_negotiation',
        decisionPoints: response.humanDecisionPointsFlat,
        hardConstraintBlocked: false,
        correlationId: `team-${teamId}-${Date.now()}`,
      });
    }

    return response;
  }

  @Get(':teamId/weights')
  @ApiOperation({ 
    summary: '获取团队综合权重',
    description: '计算团队成员权重的加权平均值'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回团队权重' })
  async getTeamWeights(@Param('teamId') teamId: string): Promise<TeamWeightsResponse | null> {
    const team = await this.teamService.getTeam(teamId);
    if (!team) {
      return null;
    }
    
    const weights = this.teamService.calculateTeamWeights(team);
    
    const memberContributions = team.members
      .filter(m => m.role !== 'OBSERVER')
      .map(m => ({
        userId: m.userId,
        displayName: m.displayName,
        contributionWeight: m.decisionWeight,
      }));
    
    return {
      weights,
      memberContributions,
    };
  }

  @Get(':teamId/constraints')
  @ApiOperation({ 
    summary: '获取团队约束（最弱链）',
    description: '返回团队中最严格的约束条件'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回团队约束' })
  async getTeamConstraints(@Param('teamId') teamId: string): Promise<TeamConstraintsResponse | null> {
    const team = await this.teamService.getTeam(teamId);
    if (!team) {
      return null;
    }
    
    const constraints = this.teamService.calculateTeamConstraints(team);
    
    // 找出约束来源
    const constraintSources: TeamConstraintsResponse['constraintSources'] = [];
    
    if (constraints?.maxDailyAscentM) {
      const source = team.members.find(
        m => m.specialConstraints?.maxDailyAscentM === constraints.maxDailyAscentM
      );
      if (source) {
        constraintSources.push({
          constraint: `最大日爬升 ${constraints.maxDailyAscentM}m`,
          sourceUserId: source.userId,
          sourceDisplayName: source.displayName,
        });
      }
    }
    
    if (constraints?.maxDailyHours) {
      const source = team.members.find(
        m => m.specialConstraints?.maxDailyHours === constraints.maxDailyHours
      );
      if (source) {
        constraintSources.push({
          constraint: `最大日时长 ${constraints.maxDailyHours}h`,
          sourceUserId: source.userId,
          sourceDisplayName: source.displayName,
        });
      }
    }
    
    if (constraints?.altitudeLimit) {
      const source = team.members.find(
        m => m.specialConstraints?.altitudeLimit === constraints.altitudeLimit
      );
      if (source) {
        constraintSources.push({
          constraint: `海拔限制 ${constraints.altitudeLimit}m`,
          sourceUserId: source.userId,
          sourceDisplayName: source.displayName,
        });
      }
    }
    
    return {
      constraints,
      constraintSources,
    };
  }
}
