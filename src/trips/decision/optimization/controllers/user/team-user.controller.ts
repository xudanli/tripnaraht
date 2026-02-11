// src/trips/decision/optimization/controllers/user/team-user.controller.ts
/**
 * 用户端 - 团队协同 API
 * 
 * 提供多用户（家庭/团队）协同决策功能
 */

import { Controller, Post, Get, Delete, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';

import { TeamCollaborationService } from '../../collaboration/team-collaboration.service';
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
  name!: string;
  /** 团队类型 */
  type!: 'FAMILY' | 'FRIENDS' | 'EXPEDITION' | 'TOUR_GROUP' | 'CUSTOM';
  /** 决策权重模式 */
  decisionWeightMode!: DecisionWeightMode;
  /** 成员列表 */
  members!: TeamMemberInput[];
  /** 团队约束配置 */
  teamConstraints?: {
    /** 是否使用最弱链原则 */
    useWeakestLink: boolean;
    /** 最大可接受分歧度 */
    maxAcceptableDisagreement: number;
    /** 需要全票通过的决策类型 */
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

export class TeamNegotiateDto {
  /** 待协商的计划 */
  plan!: RoutePlanDraft;
  /** 世界模型上下文 */
  world!: WorldModelContext;
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
  ) {}

  // ========== 团队管理 ==========

  @Post()
  @ApiOperation({ 
    summary: '创建团队',
    description: '创建新的协作团队，设置成员和决策模式'
  })
  @ApiResponse({ status: 201, description: '返回创建的团队' })
  async createTeam(@Body() dto: CreateTeamDto): Promise<TeamConfig> {
    this.logger.log(`[User] 创建团队: ${dto.name}`);
    
    return this.teamService.createTeam({
      name: dto.name,
      type: dto.type,
      decisionWeightMode: dto.decisionWeightMode,
      members: dto.members.map(m => ({
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
    return this.teamService.getTeam(teamId) || null;
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
  ): Promise<TeamConfig> {
    this.logger.log(`[User] 添加成员: ${dto.displayName} -> ${teamId}`);
    return this.teamService.addMember(teamId, dto);
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
  ): Promise<TeamNegotiationResult> {
    this.logger.log(`[User] 团队协商: ${teamId}`);
    return this.teamService.negotiateAsTeam(teamId, dto.plan, dto.world);
  }

  @Get(':teamId/weights')
  @ApiOperation({ 
    summary: '获取团队综合权重',
    description: '计算团队成员权重的加权平均值'
  })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiResponse({ status: 200, description: '返回团队权重' })
  async getTeamWeights(@Param('teamId') teamId: string): Promise<TeamWeightsResponse | null> {
    const team = this.teamService.getTeam(teamId);
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
    const team = this.teamService.getTeam(teamId);
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
