// src/agent/assistants/planning-assistant/planning-assistant.controller.ts

import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PlanningAssistantService } from './services/planning-assistant.service';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  PlanningChatRequestDto,
  PlanningChatResponseDto,
  CreateSessionRequestDto,
  CreateSessionResponseDto,
  SessionStateResponseDto,
} from './dto/planning-assistant.dto';

@ApiTags('规划助手智能体')
@Controller('agent/planning-assistant')
export class PlanningAssistantController {
  constructor(private readonly planningAssistantService: PlanningAssistantService) {}

  /**
   * 创建新会话
   */
  @Public()
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建新的规划会话', description: '开始一个新的旅行规划对话会话' })
  @ApiResponse({
    status: 201,
    description: '会话创建成功',
    type: CreateSessionResponseDto,
  })
  async createSession(@Body() dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
    const sessionId = await this.planningAssistantService.createSession(dto.userId);
    return { sessionId };
  }

  /**
   * 对话
   */
  @Public()
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '发送消息进行对话', 
    description: '向规划助手发送消息，获取智能回复、推荐和行程方案' 
  })
  @ApiResponse({
    status: 200,
    description: '对话成功',
    type: PlanningChatResponseDto,
  })
  async chat(@Body() dto: PlanningChatRequestDto): Promise<PlanningChatResponseDto> {
    return await this.planningAssistantService.chat({
      sessionId: dto.sessionId,
      userId: dto.userId,
      message: dto.message,
      language: dto.language,
      context: dto.context ? {
        currentLocation: dto.context.currentLocation ? {
          lat: dto.context.currentLocation.lat!,
          lng: dto.context.currentLocation.lng!,
        } : undefined,
        timezone: dto.context.timezone,
      } : undefined,
    });
  }

  /**
   * 获取会话状态
   */
  @Public()
  @Get('sessions/:sessionId')
  @ApiOperation({ 
    summary: '获取会话状态', 
    description: '获取指定会话的当前状态，包括偏好、推荐和方案' 
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
    type: SessionStateResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '会话不存在',
  })
  async getSessionState(@Param('sessionId') sessionId: string): Promise<SessionStateResponseDto | null> {
    const state = await this.planningAssistantService.getSessionState(sessionId);
    if (!state) {
      return null;
    }
    return {
      sessionId: state.sessionId,
      userId: state.userId,
      phase: state.phase,
      preferences: state.preferences,
      recommendations: state.recommendations,
      selectedDestination: state.selectedDestination,
      planCandidates: state.planCandidates,
      selectedPlanId: state.selectedPlanId,
      confirmedTripId: state.confirmedTripId,
      messageCount: state.messageHistory.length,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  /**
   * 快速推荐（无需会话）
   */
  @Public()
  @Get('quick-recommend')
  @ApiOperation({ 
    summary: '快速获取目的地推荐', 
    description: '无需创建会话，直接根据简单条件获取目的地推荐' 
  })
  @ApiResponse({
    status: 200,
    description: '推荐成功',
  })
  async quickRecommend(
    @Query('budget') budget?: string,
    @Query('travelersCount') travelersCount?: string,
    @Query('preferredType') preferredType?: string,
    @Query('country_code') countryCode?: string,
    @Query('duration_days') durationDays?: string,
    @Query('travel_style') travelStyle?: string,
    @Query('budget_level') budgetLevel?: string,
    @Query('language') language?: 'en' | 'zh',
  ): Promise<any> {
    // 创建临时会话，传入国家代码
    const sessionId = await this.planningAssistantService.createSession(countryCode);
    
    // 构造快速推荐消息
    let message = '请给我推荐目的地';
    if (budget) message += `，预算大约${budget}`;
    if (budgetLevel) message += `，预算级别${budgetLevel}`;
    if (travelersCount) message += `，${travelersCount}人出行`;
    if (durationDays) message += `，${durationDays}天`;
    if (preferredType || travelStyle) message += `，偏好${preferredType || travelStyle}类型的旅行`;
    
    const response = await this.planningAssistantService.chat({
      sessionId,
      message,
      language: language || 'zh',
      countryCode, // 传递国家代码用于过滤
    });
    
    return {
      sessionId,
      recommendations: response.recommendations,
      message: response.message,
      messageCN: response.messageCN,
    };
  }

  /**
   * 获取用户偏好摘要（P1 功能）
   */
  @Public()
  @Get('users/:userId/preferences')
  @ApiOperation({ 
    summary: '获取用户偏好摘要', 
    description: '获取系统学习到的用户旅行偏好，用于个性化推荐' 
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getUserPreferences(@Param('userId') userId: string): Promise<any> {
    return await this.planningAssistantService.getUserPreferenceSummary(userId);
  }

  /**
   * 清除用户偏好（P1 功能）
   */
  @Public()
  @Post('users/:userId/preferences/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '清除用户偏好', 
    description: '清除系统学习到的用户旅行偏好' 
  })
  @ApiResponse({
    status: 200,
    description: '清除成功',
  })
  async clearUserPreferences(@Param('userId') userId: string): Promise<{ success: boolean }> {
    await this.planningAssistantService.clearUserPreferences(userId);
    return { success: true };
  }
}
