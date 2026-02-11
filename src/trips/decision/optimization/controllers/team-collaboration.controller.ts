// src/trips/decision/optimization/controllers/team-collaboration.controller.ts
/**
 * 团队协同 API Controller
 * 
 * 提供多用户（家庭/团队）协同决策接口
 */

import { Controller, Post, Get, Delete, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { TeamCollaborationService } from '../collaboration/team-collaboration.service';
import {
  TeamConfig,
  TeamMember,
  TeamNegotiationResult,
  DecisionWeightMode,
} from '../collaboration/multi-user-collaboration.interface';
import { ObjectiveFunctionWeights } from '../objective-function.interface';
import { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';

// ========== DTOs ==========

class CreateTeamDto {
  name!: string;
  type!: 'FAMILY' | 'FRIENDS' | 'EXPEDITION' | 'TOUR_GROUP' | 'CUSTOM';
  decisionWeightMode!: DecisionWeightMode;
  members!: Array<{
    userId: string;
    displayName: string;
    role: 'LEADER' | 'MEMBER' | 'OBSERVER';
    decisionWeight: number;
    fitnessLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
    experienceLevel: 'NOVICE' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | 'EXPERT';
    personalWeights: ObjectiveFunctionWeights;
    specialConstraints?: {
      maxDailyAscentM?: number;
      maxDailyHours?: number;
      altitudeLimit?: number;
      restFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
      specialNeeds?: string[];
    };
  }>;
  teamConstraints?: {
    useWeakestLink: boolean;
    maxAcceptableDisagreement: number;
    unanimityRequired: string[];
  };
}

class AddMemberDto {
  userId!: string;
  displayName!: string;
  role!: 'LEADER' | 'MEMBER' | 'OBSERVER';
  decisionWeight!: number;
  fitnessLevel!: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  experienceLevel!: 'NOVICE' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | 'EXPERT';
  personalWeights!: ObjectiveFunctionWeights;
  specialConstraints?: {
    maxDailyAscentM?: number;
    maxDailyHours?: number;
    altitudeLimit?: number;
    restFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
    specialNeeds?: string[];
  };
}

class TeamNegotiateDto {
  plan!: RoutePlanDraft;
  world!: WorldModelContext;
}

@ApiTags('Team Collaboration')
@Controller('v2/team')
export class TeamCollaborationController {
  private readonly logger = new Logger(TeamCollaborationController.name);

  constructor(
    private readonly teamService: TeamCollaborationService,
  ) {}

  // ========== 团队管理 ==========

  @Post()
  @ApiOperation({ summary: '创建团队' })
  @ApiResponse({ status: 201, description: '返回创建的团队配置' })
  async createTeam(@Body() dto: CreateTeamDto): Promise<TeamConfig> {
    this.logger.log(`[TeamCollaboration] 创建团队: ${dto.name}`);
    
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
  @ApiOperation({ summary: '获取团队信息' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  async getTeam(@Param('teamId') teamId: string): Promise<TeamConfig | null> {
    const team = this.teamService.getTeam(teamId);
    if (!team) {
      return null;
    }
    return team;
  }

  @Post(':teamId/members')
  @ApiOperation({ summary: '添加团队成员' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  async addMember(
    @Param('teamId') teamId: string,
    @Body() dto: AddMemberDto,
  ): Promise<TeamConfig> {
    this.logger.log(`[TeamCollaboration] 添加成员: ${dto.displayName} -> ${teamId}`);
    return this.teamService.addMember(teamId, dto);
  }

  @Delete(':teamId/members/:userId')
  @ApiOperation({ summary: '移除团队成员' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  @ApiParam({ name: 'userId', description: '用户 ID' })
  async removeMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ): Promise<TeamConfig> {
    this.logger.log(`[TeamCollaboration] 移除成员: ${userId} <- ${teamId}`);
    return this.teamService.removeMember(teamId, userId);
  }

  // ========== 团队决策 ==========

  @Post(':teamId/negotiate')
  @ApiOperation({ summary: '启动团队协商' })
  @ApiResponse({ status: 200, description: '返回团队协商结果' })
  async negotiate(
    @Param('teamId') teamId: string,
    @Body() dto: TeamNegotiateDto,
  ): Promise<TeamNegotiationResult> {
    this.logger.log(`[TeamCollaboration] 启动团队协商: ${teamId}`);
    return this.teamService.negotiateAsTeam(teamId, dto.plan, dto.world);
  }

  @Get(':teamId/weights')
  @ApiOperation({ summary: '计算团队综合权重' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  async getTeamWeights(@Param('teamId') teamId: string): Promise<ObjectiveFunctionWeights | null> {
    const team = this.teamService.getTeam(teamId);
    if (!team) {
      return null;
    }
    return this.teamService.calculateTeamWeights(team);
  }

  @Get(':teamId/constraints')
  @ApiOperation({ summary: '计算团队综合约束（最弱链）' })
  @ApiParam({ name: 'teamId', description: '团队 ID' })
  async getTeamConstraints(@Param('teamId') teamId: string): Promise<TeamMember['specialConstraints'] | null> {
    const team = this.teamService.getTeam(teamId);
    if (!team) {
      return null;
    }
    return this.teamService.calculateTeamConstraints(team);
  }
}
