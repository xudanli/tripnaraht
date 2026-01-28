// src/agent/assistants/trip-planner/trip-planner.controller.ts

import { Controller, Post, Body, Get, Param, Logger, Sse, MessageEvent, Put, Delete, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { TripPlannerService, StreamEvent } from './services/trip-planner.service';
import { TripPlannerFeedbackService } from './services/trip-planner-feedback.service';
import { GapPreferencesService, GapDisplayPreferences, IgnorePattern } from './services/gap-preferences.service';
import { StartTripPlannerSessionDto, TripPlannerChatDto, TripPlannerActionDto, ConfirmChangesDto, ApplySuggestionDto } from './dto/trip-planner.dto';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';

@ApiTags('trip-planner')
@ApiBearerAuth()
@Public() // 临时开放测试，生产环境应移除
@Controller('trip-planner')
export class TripPlannerController {
  private readonly logger = new Logger(TripPlannerController.name);

  constructor(
    private readonly tripPlannerService: TripPlannerService,
    private readonly feedbackService: TripPlannerFeedbackService, // 🚀 Phase 3 优化：反馈服务
    private readonly gapPreferencesService: GapPreferencesService, // 🚀 Phase 3 优化：缺口偏好服务
  ) {}

  /**
   * 开始规划会话
   */
  @Post('start')
  @ApiOperation({
    summary: '开始规划会话',
    description: '为已创建的行程开始一个智能规划会话，返回欢迎信息和行程概览',
  })
  @ApiBody({ type: StartTripPlannerSessionDto })
  @ApiResponse({
    status: 200,
    description: '成功返回会话信息和行程概览',
  })
  async startSession(
    @Body() dto: StartTripPlannerSessionDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 开始会话: tripId=${dto.tripId}`);

    try {
      const response = await this.tripPlannerService.startSession(dto.tripId, userId);
      return {
        success: true,
        data: response,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 开始会话失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'START_SESSION_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 对话接口
   */
  @Post('chat')
  @ApiOperation({
    summary: '与规划助手对话',
    description: '发送消息与规划助手交互，支持优化、细化、咨询、执行等多种能力',
  })
  @ApiBody({ type: TripPlannerChatDto })
  @ApiResponse({
    status: 200,
    description: '成功返回助手回复',
    schema: {
      example: {
        success: true,
        data: {
          sessionId: 'planner_xxx_abc123',
          message: '好的，我来帮您优化行程路线...',
          phase: 'OPTIMIZING',
          intent: 'OPTIMIZE_ROUTE',
          quickActions: [],
          followUp: {
            question: '需要我进一步解释吗？',
            options: ['好的', '直接应用'],
            type: 'single',
          },
        },
      },
    },
  })
  async chat(
    @Body() dto: TripPlannerChatDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 收到消息: tripId=${dto.tripId}, message=${dto.message.substring(0, 50)}...`);

    try {
      const response = await this.tripPlannerService.chat({
        sessionId: dto.sessionId,
        tripId: dto.tripId,
        userId,
        message: dto.message,
        targetDay: dto.targetDay,
        targetItemId: dto.targetItemId,
        context: dto.context,
      });

      return {
        success: true,
        data: response,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 对话失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'CHAT_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 流式对话接口（SSE）
   */
  @Sse('chat/stream')
  @ApiOperation({
    summary: '流式对话（SSE）',
    description: '使用 Server-Sent Events 进行流式对话，实时返回处理进度和结果',
  })
  chatStream(
    @Body() dto: TripPlannerChatDto,
    @CurrentUser() user?: CurrentUserPayload
  ): Observable<MessageEvent> {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 流式对话: tripId=${dto.tripId}, message=${dto.message.substring(0, 50)}...`);

    return this.tripPlannerService.chatStream({
      sessionId: dto.sessionId,
      tripId: dto.tripId,
      userId,
      message: dto.message,
      targetDay: dto.targetDay,
      targetItemId: dto.targetItemId,
      context: dto.context,
    }).pipe(
      map((event: StreamEvent) => ({
        data: JSON.stringify(event),
      } as MessageEvent))
    );
  }

  /**
   * 撤销操作
   */
  @Post('undo')
  @ApiOperation({
    summary: '撤销操作',
    description: '回滚到上一个检查点',
  })
  async undo(
    @Body() dto: { tripId: string; sessionId: string; checkpointId?: string },
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 撤销操作: sessionId=${dto.sessionId}`);

    try {
      const result = await this.tripPlannerService.rollbackToCheckpoint(dto.sessionId, dto.checkpointId);
      return {
        success: result.success,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 撤销失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'UNDO_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 执行快捷操作
   */
  @Post('action')
  @ApiOperation({
    summary: '执行快捷操作',
    description: '执行预定义的快捷操作，如优化路线、添加活动等',
  })
  @ApiBody({ type: TripPlannerActionDto })
  @ApiResponse({
    status: 200,
    description: '成功执行操作',
  })
  async executeAction(
    @Body() dto: TripPlannerActionDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 执行操作: tripId=${dto.tripId}, action=${dto.action}`);

    try {
      // 🆕 特殊处理：FIX_NIGHT_ACTIVITIES 直接调用凌晨活动调整
      if (dto.action === 'FIX_NIGHT_ACTIVITIES') {
        const result = await this.tripPlannerService.fixNightActivities({
          tripId: dto.tripId,
          sessionId: dto.sessionId,
          userId,
          changeId: dto.params?.changeId,
        });
        return {
          success: true,
          data: result,
        };
      }

      // 🆕 特殊处理：APPLY_OPTIMIZATION 直接应用优化
      if (dto.action === 'APPLY_OPTIMIZATION' && dto.params?.changeId) {
        const result = await this.tripPlannerService.applyPendingChange({
          tripId: dto.tripId,
          sessionId: dto.sessionId,
          changeId: dto.params.changeId,
          userId,
        });
        return {
          success: true,
          data: result,
        };
      }

      // 🚀 Phase 1 优化：操作闭环处理
      // 特殊操作直接处理，不转换为对话消息
      if (dto.action === 'ADD_TO_CHECKLIST') {
        return await this.handleAddToChecklist(dto, userId);
      }
      
      if (dto.action === 'SHOW_RAG_SOURCES') {
        return await this.handleShowRAGSources(dto, userId);
      }
      
      if (dto.action === 'ASK_FOLLOW_UP') {
        return await this.handleAskFollowUp(dto, userId);
      }
      
      if (dto.action === 'SHOW_WEATHER') {
        return await this.handleShowWeather(dto, userId);
      }
      
      if (dto.action === 'RECOMMEND_RESTAURANTS') {
        return await this.handleRecommendRestaurants(dto, userId);
      }

      // 将快捷操作转换为对话消息
      const actionMessages: Record<string, string> = {
        // 基础操作
        OPTIMIZE_ROUTE: '帮我优化行程路线',
        ARRANGE_MEALS: '帮我推荐餐厅',
        CREATE_CHECKLIST: '生成行前清单',
        SHOW_OVERVIEW: '查看行程概览',
        PLAN_TRANSPORT: '帮我规划交通',
        FILL_FREE_TIME: '帮我填充空闲时间，推荐一些适合的活动',
        GET_SUGGESTION: '给我一些建议',
        EXPORT_ITINERARY: '导出行程',
        AUTO_FIX: '自动修复行程中的问题',
        // 🆕 问题修复
        FIX_ISSUES: '帮我分析并修复行程中的问题',
        // 🆕 目的地特色功能
        FIND_AURORA_SPOTS: '推荐适合观测极光的地点和时间',
        FIND_LOCAL_FOOD: '推荐当地特色美食和餐厅',
        FIND_BEACHES: '推荐适合游玩的海滩和海岛',
        FIND_MUSEUMS: '推荐值得参观的博物馆和艺术馆',
        FIND_WATER_ACTIVITIES: '推荐潜水、浮潜等水上活动',
        FIND_LOCAL_ATTRACTIONS: '推荐当地特色景点和体验',
        GENERATE_PACKING_LIST: '生成行前清单',
      };

      const message = actionMessages[dto.action] || `执行操作: ${dto.action}`;

      const response = await this.tripPlannerService.chat({
        sessionId: dto.sessionId,
        tripId: dto.tripId,
        userId,
        message,
        context: dto.params as any,
      });

      return {
        success: true,
        data: response,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 执行操作失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'ACTION_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 确认修改
   */
  @Post('confirm')
  @ApiOperation({
    summary: '确认修改',
    description: '确认并应用待确认的修改',
  })
  @ApiBody({ type: ConfirmChangesDto })
  async confirmChanges(
    @Body() dto: ConfirmChangesDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 确认修改: sessionId=${dto.sessionId}, changeIds=${dto.changeIds?.join(',')}`);

    try {
      const result = await this.tripPlannerService.confirmChanges({
        sessionId: dto.sessionId,
        tripId: dto.tripId,
        changeIds: dto.changeIds || [],
        userId,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 确认修改失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'CONFIRM_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 应用建议
   */
  @Post('apply-suggestion')
  @ApiOperation({
    summary: '应用建议',
    description: '应用规划助手提供的建议',
  })
  @ApiBody({ type: ApplySuggestionDto })
  async applySuggestion(
    @Body() dto: ApplySuggestionDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 应用建议: sessionId=${dto.sessionId}, suggestionId=${dto.suggestionId}`);

    try {
      const result = await this.tripPlannerService.applySuggestion({
        sessionId: dto.sessionId,
        tripId: dto.tripId,
        suggestionId: dto.suggestionId,
        targetDay: dto.targetDay || 1,
        suggestionType: dto.suggestionType || 'add_place',
        place: dto.place,
        timeSlot: dto.timeSlot,
      }, userId);

      return {
        success: true,
        data: result,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 应用建议失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'APPLY_SUGGESTION_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 获取会话状态
   */
  @Get('session/:sessionId')
  @ApiOperation({
    summary: '获取会话状态',
    description: '获取指定会话的当前状态',
  })
  async getSession(@Param('sessionId') sessionId: string) {
    this.logger.debug(`[TripPlanner] 获取会话状态: sessionId=${sessionId}`);

    try {
      const session = await this.tripPlannerService.getSession(sessionId);
      if (!session) {
        return {
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: '会话不存在',
          },
        };
      }

      return {
        success: true,
        data: session,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 获取会话状态失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'GET_SESSION_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 🚀 Phase 1 优化：操作闭环处理
   */
  
  /**
   * 添加到行前清单
   */
  private async handleAddToChecklist(dto: TripPlannerActionDto, userId: string) {
    const { tripId, params } = dto;
    
    this.logger.debug(`[TripPlanner] 添加到清单: tripId=${tripId}, category=${params?.category}`);
    
    // 调用清单服务添加项目
    const response = await this.tripPlannerService.chat({
      sessionId: dto.sessionId,
      tripId,
      userId,
      message: `添加到行前清单：${params?.content || ''}`,
      context: { action: 'ADD_TO_CHECKLIST', category: params?.category },
    });
    
    return {
      success: true,
      data: {
        ...response,
        message: `✅ 已添加到行前清单（${params?.category || '其他'}）\n\n${response.message}`,
        tripUpdate: {
          changed: true,
          summary: `已添加清单项：${params?.content?.substring(0, 50)}...`,
        },
      },
    };
  }

  /**
   * 显示 RAG 来源
   */
  private async handleShowRAGSources(dto: TripPlannerActionDto, userId: string) {
    const { params } = dto;
    const sources = params?.sources || [];
    
    this.logger.debug(`[TripPlanner] 显示 RAG 来源: ${sources.length} 个来源`);
    
    const response = await this.tripPlannerService.chat({
      sessionId: dto.sessionId,
      tripId: dto.tripId,
      userId,
      message: `查看相关文档来源`,
      context: { action: 'SHOW_RAG_SOURCES', sources },
    });
    
    return {
      success: true,
      data: {
        ...response,
        message: `📚 相关文档来源（${sources.length} 条）\n\n${sources.map((s: any, i: number) => `${i + 1}. **${s.title}**（相关度：${((s.score || 0) * 100).toFixed(0)}%）`).join('\n')}`,
        richContent: {
          type: 'rag_sources',
          data: { sources },
        },
      },
    };
  }

  /**
   * 继续追问
   */
  private async handleAskFollowUp(dto: TripPlannerActionDto, userId: string) {
    this.logger.debug(`[TripPlanner] 继续追问: sessionId=${dto.sessionId}`);
    
    const response = await this.tripPlannerService.chat({
      sessionId: dto.sessionId,
      tripId: dto.tripId,
      userId,
      message: '继续追问',
      context: { action: 'ASK_FOLLOW_UP' },
    });
    
    return {
      success: true,
      data: response,
    };
  }

  /**
   * 显示天气预报
   */
  private async handleShowWeather(dto: TripPlannerActionDto, userId: string) {
    const { params } = dto;
    
    this.logger.debug(`[TripPlanner] 显示天气: destination=${params?.destination}`);
    
    const response = await this.tripPlannerService.chat({
      sessionId: dto.sessionId,
      tripId: dto.tripId,
      userId,
      message: `查看${params?.destination || '目的地'}的天气预报`,
      context: { action: 'SHOW_WEATHER', destination: params?.destination },
    });
    
    return {
      success: true,
      data: response,
    };
  }

  /**
   * 推荐餐厅
   */
  private async handleRecommendRestaurants(dto: TripPlannerActionDto, userId: string) {
    const { params } = dto;
    
    this.logger.debug(`[TripPlanner] 推荐餐厅: destination=${params?.destination}`);
    
    const response = await this.tripPlannerService.chat({
      sessionId: dto.sessionId,
      tripId: dto.tripId,
      userId,
      message: `推荐${params?.destination || '目的地'}的餐厅`,
      context: { action: 'RECOMMEND_RESTAURANTS', destination: params?.destination },
    });
    
    return {
      success: true,
      data: response,
    };
  }

  /**
   * 🚀 Phase 2 优化：用户反馈
   */
  @Post('feedback')
  @ApiOperation({
    summary: '提交用户反馈',
    description: '收集用户对回答的反馈，用于改进回答质量',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        questionId: { type: 'string', description: '问题ID（会话消息ID）' },
        question: { type: 'string', description: '用户问题' },
        answer: { type: 'string', description: '助手回答' },
        helpful: { type: 'boolean', description: '是否有用' },
        rating: { type: 'number', description: '评分（1-5）', minimum: 1, maximum: 5 },
        comment: { type: 'string', description: '评论' },
        actionTaken: { type: 'string', description: '用户执行的操作' },
      },
      required: ['questionId', 'helpful'],
    },
  })
  async submitFeedback(
    @Body() dto: {
      questionId: string;
      question?: string;
      answer?: string;
      helpful: boolean;
      rating?: number;
      comment?: string;
      actionTaken?: string;
      sessionId?: string;
    },
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 用户反馈: questionId=${dto.questionId}, helpful=${dto.helpful}`);

    try {
      // 🚀 Phase 3 优化：获取会话状态以获取元数据
      let session = null;
      if (dto.sessionId) {
        try {
          session = await this.tripPlannerService.getSession(dto.sessionId);
        } catch (error) {
          this.logger.warn(`[TripPlanner] 获取会话失败: ${error}`);
        }
      }
      
      const lastMessage = session?.messages?.find(m => m.id === dto.questionId);
      const assistantMessage = session?.messages?.find(m => m.role === 'assistant' && m.id !== dto.questionId);
      
      const feedback = {
        questionId: dto.questionId,
        sessionId: dto.sessionId,
        tripId: session?.tripId,
        userId,
        question: dto.question || lastMessage?.content,
        answer: dto.answer || assistantMessage?.content,
        helpful: dto.helpful,
        rating: dto.rating,
        comment: dto.comment,
        actionTaken: dto.actionTaken,
        source: (lastMessage?.meta as any)?.source as 'RAG' | 'RAG+LLM' | 'LLM' | undefined,
        ragConfidence: (lastMessage?.meta as any)?.ragConfidence,
        processingTimeMs: (lastMessage?.meta as any)?.processingTime,
      };

      // 🚀 Phase 3 优化：存储反馈到数据库
      await this.feedbackService.saveFeedback(feedback);

      // 如果反馈负面，触发改进流程
      if (!dto.helpful || (dto.rating && dto.rating < 3)) {
        this.logger.warn(`[TripPlanner] 负面反馈: questionId=${dto.questionId}, rating=${dto.rating}`);
        await this.feedbackService.triggerImprovement(feedback);
      }

      return {
        success: true,
        data: { message: '反馈已提交，感谢您的反馈！' },
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 反馈提交失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'FEEDBACK_FAILED',
          message: error.message,
        },
      };
    }
  }

  /**
   * 🚀 Phase 3 优化：获取反馈统计
   */
  @Get('feedback/stats')
  @ApiOperation({
    summary: '获取反馈统计',
    description: '获取最近N天的反馈统计数据',
  })
  async getFeedbackStats(
    @Param('days') days?: string,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    const daysParam = days ? parseInt(days, 10) : 7;

    try {
      const stats = await this.feedbackService.getFeedbackStats(daysParam);
      return {
        success: true,
        data: stats,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 获取反馈统计失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: {
          code: 'GET_STATS_FAILED',
          message: error.message,
        },
      };
    }
  }

  // ==================== 🚀 Phase 3 优化：缺口偏好管理 API ====================

  /**
   * 获取用户缺口偏好
   */
  @Get('gap-preferences')
  @ApiOperation({ summary: '获取用户缺口偏好' })
  @ApiQuery({ name: 'tripId', required: false, description: '行程ID' })
  @ApiQuery({ name: 'sessionId', required: false, description: '会话ID' })
  async getGapPreferences(
    @CurrentUser() user?: CurrentUserPayload,
    @Query('tripId') tripId?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[缺口偏好] 获取偏好: userId=${userId}, tripId=${tripId || 'null'}, sessionId=${sessionId || 'null'}`);

    try {
      const preferences = await this.gapPreferencesService.getPreferences(userId, tripId, sessionId);
      return {
        success: true,
        data: preferences,
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 获取偏好失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 更新用户缺口偏好
   */
  @Put('gap-preferences')
  @ApiOperation({ summary: '更新用户缺口偏好' })
  async updateGapPreferences(
    @Body() dto: {
      tripId?: string;
      sessionId?: string;
      collapsed?: boolean;
      showOnlyCritical?: boolean;
      filterTypes?: string[];
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[缺口偏好] 更新偏好: userId=${userId}, dto=${JSON.stringify(dto)}`);

    try {
      const preferences: Partial<GapDisplayPreferences> = {
        collapsed: dto.collapsed,
        showOnlyCritical: dto.showOnlyCritical,
        filterTypes: dto.filterTypes as any,
      };

      const updated = await this.gapPreferencesService.updatePreferences(
        userId,
        preferences,
        dto.tripId,
        dto.sessionId
      );

      return {
        success: true,
        data: updated,
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 更新偏好失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 忽略缺口
   */
  @Post('ignore-gap')
  @ApiOperation({ summary: '忽略单个缺口' })
  async ignoreGap(
    @Body() dto: {
      gapId: string;
      gapType: string;
      tripId?: string;
      pattern?: IgnorePattern;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[缺口偏好] 忽略缺口: userId=${userId}, gapId=${dto.gapId}, gapType=${dto.gapType}`);

    try {
      await this.gapPreferencesService.ignoreGap(
        userId,
        dto.gapId,
        dto.gapType as any,
        dto.pattern,
        dto.tripId
      );

      return {
        success: true,
        message: '缺口已忽略',
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 忽略缺口失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 批量忽略缺口
   */
  @Post('ignore-gaps-batch')
  @ApiOperation({ summary: '批量忽略缺口' })
  async ignoreGapsBatch(
    @Body() dto: {
      gapIds: string[];
      gapType?: string;
      tripId?: string;
      pattern?: IgnorePattern;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[缺口偏好] 批量忽略: userId=${userId}, count=${dto.gapIds.length}`);

    try {
      const ignoredCount = await this.gapPreferencesService.ignoreGapsBatch(
        userId,
        dto.gapIds,
        dto.gapType as any,
        dto.pattern,
        dto.tripId
      );

      return {
        success: true,
        data: {
          ignoredCount,
          totalCount: dto.gapIds.length,
        },
        message: `成功忽略 ${ignoredCount} 个缺口`,
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 批量忽略失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 取消忽略缺口
   */
  @Delete('ignore-gap/:gapId')
  @ApiOperation({ summary: '取消忽略单个缺口' })
  @ApiParam({ name: 'gapId', description: '缺口ID' })
  async unignoreGap(
    @Param('gapId') gapId: string,
    @Query('tripId') tripId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[缺口偏好] 取消忽略: userId=${userId}, gapId=${gapId}`);

    try {
      await this.gapPreferencesService.unignoreGap(userId, gapId, tripId);

      return {
        success: true,
        message: '已取消忽略',
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 取消忽略失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 🚀 Phase 3 Week 3：批量取消忽略缺口
   */
  @Post('unignore-gaps-batch')
  @ApiOperation({ summary: '批量取消忽略缺口' })
  async unignoreGapsBatch(
    @Body() dto: {
      gapIds: string[];
      tripId?: string;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[缺口偏好] 批量取消忽略: userId=${userId}, count=${dto.gapIds.length}`);

    try {
      const unignoredCount = await this.gapPreferencesService.unignoreGapsBatch(
        userId,
        dto.gapIds,
        dto.tripId
      );

      return {
        success: true,
        data: {
          unignoredCount,
          totalCount: dto.gapIds.length,
        },
        message: `成功取消忽略 ${unignoredCount} 个缺口`,
      };
    } catch (error: any) {
      this.logger.error(`[缺口偏好] 批量取消忽略失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
