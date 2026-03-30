// src/agent/assistants/planning-assistant/controllers/planning-assistant-v2.controller.ts

/**
 * 规划助手智能体 V2 Controller
 * 
 * 重新设计后的接口实现
 * 
 * 设计原则:
 * - 对话接口为主要入口（AI优先）
 * - 业务接口为快捷方式（AI增强）
 * - RESTful规范（推荐和对比使用GET）
 * 
 * 参考文档:
 * - API_REDESIGN_FINAL.md - 最终方案
 * - API_REDESIGN_DTO_DEFINITIONS.md - DTO定义
 * - API_REDESIGN_ERROR_HANDLING.md - 错误处理
 */

import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { PlanningAssistantV2Service } from '../services/planning-assistant-v2.service';
import { CreateSessionRequestDto } from '../dto/v2/create-session-request.dto';
import { CreateSessionResponseDto } from '../dto/v2/create-session-response.dto';
import { SessionStateResponseDto } from '../dto/v2/session-state-response.dto';
import { MessageHistoryResponseDto } from '../dto/v2/message-history-response.dto';
import { RecommendationsRequestDto } from '../dto/v2/recommendations-request.dto';
import { RecommendationsResponseDto } from '../dto/v2/recommendations-response.dto';
import { GeneratePlanRequestDto } from '../dto/v2/generate-plan-request.dto';
import { GeneratePlanResponseDto } from '../dto/v2/generate-plan-response.dto';
import { AsyncTaskResponseDto } from '../dto/v2/async-task-response.dto';
import { ComparePlansRequestDto } from '../dto/v2/compare-plans-request.dto';
import { ComparePlansResponseDto } from '../dto/v2/compare-plans-response.dto';
import { OptimizePlanRequestDto } from '../dto/v2/optimize-plan-request.dto';
import { ConfirmPlanRequestDto } from '../dto/v2/confirm-plan-request.dto';
import { OptimizeTripRequestDto } from '../dto/v2/optimize-trip-request.dto';
import { RefineTripRequestDto } from '../dto/v2/refine-trip-request.dto';
import { TripSuggestionsResponseDto } from '../dto/v2/trip-suggestions-response.dto';
import { ChatRequestDto } from '../dto/v2/chat-request.dto';
import { ChatResponseDto } from '../dto/v2/chat-response.dto';

@ApiTags('规划助手智能体 V2')
@ApiBearerAuth() // Swagger 文档：需要 Bearer Token
@UseGuards(JwtAuthGuard) // 默认保护所有接口，使用 @Public() 标记公开接口
@Controller('agent/planning-assistant/v2')
export class PlanningAssistantV2Controller {
  constructor(
    private readonly planningAssistantV2Service: PlanningAssistantV2Service
  ) {}

  // ==================== 会话管理 ====================

  /**
   * 创建会话
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建新的规划会话' })
  @ApiResponse({ status: 201, description: '会话创建成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async createSession(@Body() dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
    return await this.planningAssistantV2Service.createSession(dto);
  }

  /**
   * 获取会话状态
   * 
   * 需要认证：会话包含用户数据，只有所有者可以访问
   */
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 次/分钟
  @Get('sessions/:sessionId')
  @ApiOperation({ summary: '获取会话状态' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限访问此会话' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async getSessionState(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<SessionStateResponseDto> {
    return await this.planningAssistantV2Service.getSessionState(sessionId, user?.userId);
  }

  /**
   * 删除会话
   * 
   * 需要认证：删除操作，只有所有者可以执行
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除会话' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限删除此会话' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async deleteSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<{ success: boolean; sessionId: string }> {
    await this.planningAssistantV2Service.deleteSession(sessionId, user?.userId);
    return { success: true, sessionId };
  }

  /**
   * 获取对话历史
   * 
   * 需要认证：包含用户数据，只有所有者可以访问
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 次/分钟
  @Get('sessions/:sessionId/history')
  @ApiOperation({ summary: '获取对话历史' })
  @ApiParam({ name: 'sessionId', description: '会话ID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限访问此会话' })
  @ApiResponse({ status: 404, description: '会话不存在' })
  async getMessageHistory(
    @Param('sessionId') sessionId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<MessageHistoryResponseDto> {
    return await this.planningAssistantV2Service.getMessageHistory(sessionId, limit, offset, user?.userId);
  }

  // ==================== 对话接口（主要入口） ====================

  /**
   * 智能对话（主要入口，AI增强，支持智能路由）
   */
  @Public()
  @Throttle({ 
    default: { 
      limit: process.env.NODE_ENV === 'production' ? 30 : 300, // 生产环境：30次/分钟，开发环境：300次/分钟
      ttl: 60000 
    } 
  })
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: '智能对话',
    description: '主要入口，支持自然语言理解、多轮对话、上下文感知和智能路由'
  })
  @ApiResponse({ status: 200, description: '对话成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
    return await this.planningAssistantV2Service.chat(dto);
  }

  // ==================== 业务操作（快捷方式） ====================

  /**
   * 获取目的地推荐（GET，支持自然语言参数）
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 次/分钟
  @Get('recommendations')
  @ApiOperation({ 
    summary: '获取目的地推荐',
    description: '支持自然语言参数（?q=...）和结构化参数'
  })
  @ApiQuery({ name: 'q', required: false, description: '自然语言描述' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'language', required: false, enum: ['en', 'zh'] })
  @ApiResponse({ status: 200, description: '推荐成功' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async getRecommendations(
    @Query('q') naturalLanguage?: string,
    @Query() structuredParams?: RecommendationsRequestDto,
  ): Promise<RecommendationsResponseDto> {
    return await this.planningAssistantV2Service.getRecommendations({
      naturalLanguageDescription: naturalLanguage,
      ...structuredParams,
    });
  }

  /**
   * 生成方案（同步，支持自然语言描述）
   * 
   * 需要认证：创建用户数据，需要认证
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('plans/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成方案（同步）' })
  @ApiResponse({ status: 200, description: '生成成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async generatePlan(
    @Body() dto: GeneratePlanRequestDto,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<GeneratePlanResponseDto> {
    // 如果 DTO 中没有 userId，使用当前认证用户
    if (!dto.userId && user?.userId) {
      dto.userId = user.userId;
    }
    return await this.planningAssistantV2Service.generatePlan(dto);
  }

  /**
   * 生成方案（异步）
   * 
   * 需要认证：创建用户数据，需要认证
   */
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 次/分钟
  @Post('plans/generate-async')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: '生成方案（异步）' })
  @ApiResponse({ status: 202, description: '任务已创建' })
  @ApiResponse({ status: 401, description: '未认证' })
  async generatePlanAsync(
    @Body() dto: GeneratePlanRequestDto,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<AsyncTaskResponseDto> {
    // 如果 DTO 中没有 userId，使用当前认证用户
    if (!dto.userId && user?.userId) {
      dto.userId = user.userId;
    }
    return await this.planningAssistantV2Service.generatePlanAsync(dto);
  }

  /**
   * 查询生成任务状态
   * 
   * 需要认证：查询用户任务，需要认证
   */
  @Throttle({ default: { limit: 60, ttl: 60000 } }) // 60 次/分钟
  @Get('plans/generate/:taskId')
  @ApiOperation({ summary: '查询生成任务状态' })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限访问此任务' })
  @ApiResponse({ status: 404, description: '任务不存在' })
  async getGenerateTaskStatus(
    @Param('taskId') taskId: string,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<AsyncTaskResponseDto> {
    return await this.planningAssistantV2Service.getGenerateTaskStatus(taskId, user?.userId);
  }

  /**
   * 对比方案（GET，支持自然语言参数）
   * 
   * 需要认证：涉及用户方案数据
   */
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 次/分钟
  @Get('plans/compare')
  @ApiOperation({ summary: '对比方案' })
  @ApiQuery({ name: 'planIds', required: true, description: '方案ID列表，逗号分隔' })
  @ApiQuery({ name: 'compareFields', required: false, description: '对比维度，逗号分隔' })
  @ApiResponse({ status: 200, description: '对比成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 400, description: '请求参数错误' })
  async comparePlans(
    @Query('planIds') planIds: string,
    @Query('compareFields') compareFields?: string,
    @Query('sessionId') sessionId?: string,
    @Query('language') language?: 'en' | 'zh',
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<ComparePlansResponseDto> {
    const dto: ComparePlansRequestDto = {
      planIds: planIds.split(','),
      compareFields: compareFields?.split(','),
      sessionId,
      language,
    };
    return await this.planningAssistantV2Service.comparePlans(dto, user?.userId);
  }

  /**
   * 优化方案
   * 
   * 需要认证：修改用户数据，需要认证
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('plans/:planId/optimize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '优化方案' })
  @ApiParam({ name: 'planId', description: '方案ID' })
  @ApiResponse({ status: 200, description: '优化成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限优化此方案' })
  @ApiResponse({ status: 404, description: '方案不存在' })
  async optimizePlan(
    @Param('planId') planId: string,
    @Body() dto: OptimizePlanRequestDto,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<GeneratePlanResponseDto> {
    const fullDto: OptimizePlanRequestDto = { 
      ...dto, 
      planId,
    };
    return await this.planningAssistantV2Service.optimizePlan(fullDto, user?.userId);
  }

  /**
   * 确认方案
   * 
   * 需要认证：创建行程，需要认证
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('plans/:planId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '确认方案' })
  @ApiParam({ name: 'planId', description: '方案ID' })
  @ApiResponse({ status: 200, description: '确认成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限确认此方案' })
  @ApiResponse({ status: 404, description: '方案不存在' })
  async confirmPlan(
    @Param('planId') planId: string,
    @Body() dto: ConfirmPlanRequestDto,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<{ success: boolean; tripId: string }> {
    const fullDto: ConfirmPlanRequestDto = { 
      ...dto, 
      planId,
      userId: user?.userId || dto.userId, // 使用认证用户ID
    };
    return await this.planningAssistantV2Service.confirmPlan(fullDto);
  }

  // ==================== 行程操作 ====================

  /**
   * 优化已创建行程
   * 
   * 需要认证：修改用户行程，需要认证
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('trips/:tripId/optimize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '优化已创建行程' })
  @ApiParam({ name: 'tripId', description: '行程ID' })
  @ApiResponse({ status: 200, description: '优化成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限优化此行程' })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async optimizeTrip(
    @Param('tripId') tripId: string,
    @Body() dto: OptimizeTripRequestDto,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<{ success: boolean; tripId: string }> {
    const fullDto: OptimizeTripRequestDto = { 
      ...dto, 
      tripId,
    };
    return await this.planningAssistantV2Service.optimizeTrip(fullDto, user?.userId);
  }

  /**
   * 细化行程
   * 
   * 需要认证：修改用户行程，需要认证
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('trips/:tripId/refine')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '细化行程' })
  @ApiParam({ name: 'tripId', description: '行程ID' })
  @ApiResponse({ status: 200, description: '细化成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限细化此行程' })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async refineTrip(
    @Param('tripId') tripId: string,
    @Body() dto: RefineTripRequestDto,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<{ success: boolean; tripId: string }> {
    const fullDto: RefineTripRequestDto = { 
      ...dto, 
      tripId,
    };
    return await this.planningAssistantV2Service.refineTrip(fullDto, user?.userId);
  }

  /**
   * 获取优化建议
   * 
   * 需要认证：查询用户行程，需要认证
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 次/分钟
  @Get('trips/:tripId/suggestions')
  @ApiOperation({ summary: '获取优化建议' })
  @ApiParam({ name: 'tripId', description: '行程ID' })
  @ApiResponse({ status: 200, description: '获取成功' })
  @ApiResponse({ status: 401, description: '未认证' })
  @ApiResponse({ status: 403, description: '无权限访问此行程' })
  @ApiResponse({ status: 404, description: '行程不存在' })
  async getTripSuggestions(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: { userId: string; email?: string },
  ): Promise<TripSuggestionsResponseDto> {
    return await this.planningAssistantV2Service.getTripSuggestions(tripId, user?.userId);
  }
}
