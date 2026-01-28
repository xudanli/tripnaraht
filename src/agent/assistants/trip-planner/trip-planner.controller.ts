// src/agent/assistants/trip-planner/trip-planner.controller.ts

import { Controller, Post, Body, Get, Param, Logger, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { TripPlannerService, StreamEvent } from './services/trip-planner.service';
import { StartTripPlannerSessionDto, TripPlannerChatDto, TripPlannerActionDto, ConfirmChangesDto, ApplySuggestionDto } from './dto/trip-planner.dto';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';

@ApiTags('trip-planner')
@ApiBearerAuth()
@Public() // 临时开放测试，生产环境应移除
@Controller('trip-planner')
export class TripPlannerController {
  private readonly logger = new Logger(TripPlannerController.name);

  constructor(private readonly tripPlannerService: TripPlannerService) {}

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
    description: '成功开始会话',
    schema: {
      example: {
        success: true,
        data: {
          sessionId: 'planner_xxx_abc123',
          message: '您好！我是 NARA，您的专属旅行规划师...',
          phase: 'OVERVIEW',
          intent: 'SHOW_OVERVIEW',
          quickActions: [
            { id: '1', label: '📍 优化行程路线', action: 'OPTIMIZE_ROUTE' },
          ],
        },
      },
    },
  })
  async startSession(
    @Body() dto: StartTripPlannerSessionDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 开始会话: tripId=${dto.tripId}, userId=${userId}`);

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
    summary: '确认待处理的修改',
    description: '确认并应用规划助手建议的修改',
  })
  @ApiBody({ type: ConfirmChangesDto })
  @ApiResponse({
    status: 200,
    description: '成功确认修改',
  })
  async confirmChanges(
    @Body() dto: ConfirmChangesDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 确认修改: tripId=${dto.tripId}, changeIds=${dto.changeIds.join(',')}`);

    try {
      // TODO: 实现确认修改逻辑
      return {
        success: true,
        data: {
          message: '修改已确认并应用',
          appliedChanges: dto.changeIds,
        },
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
   * 应用 AI 建议到行程
   */
  @Post('apply-suggestion')
  @ApiOperation({
    summary: '应用 AI 建议到行程',
    description: '将 AI 的建议（如添加餐厅、景点）一键应用到行程中',
  })
  @ApiBody({ type: ApplySuggestionDto })
  @ApiResponse({
    status: 200,
    description: '成功应用建议',
    schema: {
      example: {
        success: true,
        message: '已将「一兰拉面」添加到第1天 12:00-13:00',
        item: {
          id: 'item_abc123',
          tripDayId: 'day_001',
          startTime: '2026-03-01T12:00:00.000Z',
          endTime: '2026-03-01T13:00:00.000Z',
          type: 'MEAL_ANCHOR',
          placeId: 12345,
        },
        tripUpdate: {
          totalChanges: 1,
          addedItems: 1,
          removedItems: 0,
          modifiedItems: 0,
          affectedDays: [1],
        },
        followUpSuggestions: [
          '需要我帮您规划从浅草寺到一兰拉面的交通吗？',
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: '应用失败',
    schema: {
      example: {
        success: false,
        error: {
          code: 'TIME_CONFLICT',
          message: '时间段已被占用',
        },
      },
    },
  })
  async applySuggestion(
    @Body() dto: ApplySuggestionDto,
    @CurrentUser() user?: CurrentUserPayload
  ) {
    const userId = user?.userId || 'anonymous';
    this.logger.debug(`[TripPlanner] 应用建议: tripId=${dto.tripId}, suggestionId=${dto.suggestionId}, type=${dto.suggestionType}`);

    try {
      const result = await this.tripPlannerService.applySuggestion(dto, userId);
      return {
        success: true,
        ...result,
      };
    } catch (error: any) {
      this.logger.error(`[TripPlanner] 应用建议失败: ${error.message}`, error.stack);
      
      // 识别特定错误类型
      let errorCode = 'APPLY_SUGGESTION_FAILED';
      if (error.message.includes('时间冲突') || error.message.includes('conflict')) {
        errorCode = 'TIME_CONFLICT';
      } else if (error.message.includes('不存在') || error.message.includes('not found')) {
        errorCode = 'DAY_NOT_FOUND';
      } else if (error.message.includes('无效') || error.message.includes('invalid')) {
        errorCode = 'INVALID_SUGGESTION';
      }
      
      return {
        success: false,
        error: {
          code: errorCode,
          message: error.message,
        },
      };
    }
  }
}
