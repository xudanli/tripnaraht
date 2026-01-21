// src/agent/planning-workbench.controller.ts
/**
 * Planning Workbench Controller
 * 
 * 规划工作台 API 接口
 */

import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PlanningWorkbenchAgentService, PlanningWorkbenchRequest, PlanningWorkbenchResponse } from './services/planning-workbench-agent.service';
import { PlanContext } from '../skills/plan/shared/plan-state.types';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { BudgetEvaluationService } from '../trips/services/budget-evaluation.service';
import { TripBudgetService, BudgetConstraint } from '../trips/services/trip-budget.service';
import { PlanningWorkbenchAdminService } from './services/planning-workbench-admin.service';

@ApiTags('planning-workbench')
@Controller('planning-workbench')
export class PlanningWorkbenchController {
  private readonly logger = new Logger(PlanningWorkbenchController.name);

  constructor(
    private readonly planningWorkbenchAgent: PlanningWorkbenchAgentService,
    private readonly budgetEvaluationService: BudgetEvaluationService,
    private readonly tripBudgetService: TripBudgetService,
    private readonly planningWorkbenchAdminService: PlanningWorkbenchAdminService,
  ) {}

  /**
   * 执行规划工作台流程
   */
  @Public()
  @Post('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '执行规划工作台流程',
    description: `
规划工作台的主入口，支持以下操作：
- generate: 生成行程骨架方案
- compare: 对比多个方案
- commit: 提交选定的方案
- adjust: 调整现有方案

返回三人格的决策结果（Abu/Dr.Dre/Neptune），其他角色（预算/交通/节奏/总规划师）隐藏为能力模块。
    `.trim(),
  })
  @ApiBody({
    description: '规划工作台请求',
    schema: {
      type: 'object',
      properties: {
        context: {
          type: 'object',
          properties: {
            destination: {
              type: 'object',
              properties: {
                country: { type: 'string' },
                city: { type: 'string' },
                region: { type: 'string' },
              },
            },
            days: { type: 'number' },
            travelMode: { type: 'string', enum: ['self_drive', 'public_transit', 'walking', 'mixed'] },
            mustDo: { type: 'array', items: { type: 'string' } },
            mustAvoid: { type: 'array', items: { type: 'string' } },
            constraints: { type: 'object' },
          },
          required: ['destination', 'days'],
        },
        tripId: { type: 'string' },
        userAction: { type: 'string', enum: ['generate', 'compare', 'commit', 'adjust'] },
      },
      required: ['context'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '规划工作台执行成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            planState: { type: 'object' },
            uiOutput: {
              type: 'object',
              properties: {
                personas: {
                  type: 'object',
                  properties: {
                    abu: { type: 'object' },
                    drdre: { type: 'object' },
                    neptune: { type: 'object' },
                  },
                },
                consolidatedDecision: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ALLOW', 'NEED_CONFIRM', 'REJECT'] },
                    summary: { type: 'string' },
                    nextSteps: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async execute(@Body() request: PlanningWorkbenchRequest) {
    try {
      const result = await this.planningWorkbenchAgent.execute(request);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取规划状态
   */
  @Public()
  @Get('state/:planId')
  @ApiOperation({
    summary: '获取规划状态',
    description: '根据 planId 获取当前的 PlanState',
  })
  @ApiParam({
    name: 'planId',
    description: '规划 ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getState(@Param('planId') planId: string) {
    try {
      const result = await this.planningWorkbenchAgent.getPlanState(planId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取指定行程的规划工作台数据
   */
  @Public()
  @Get('trips/:tripId')
  @ApiOperation({
    summary: '获取行程的规划工作台数据',
    description: '获取指定行程的当前方案和方案历史列表',
  })
  @ApiParam({
    name: 'tripId',
    description: '行程 ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getTripWorkbench(@Param('tripId') tripId: string) {
    try {
      const result = await this.planningWorkbenchAgent.getTripWorkbench(tripId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取指定行程的所有规划方案列表
   */
  @Public()
  @Get('trips/:tripId/plans')
  @ApiOperation({
    summary: '获取行程的规划方案列表',
    description: '获取指定行程的所有规划方案列表，支持状态筛选和分页',
  })
  @ApiParam({
    name: 'tripId',
    description: '行程 ID',
    type: 'string',
  })
  @ApiQuery({
    name: 'status',
    description: '筛选状态',
    required: false,
    enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'],
  })
  @ApiQuery({
    name: 'limit',
    description: '每页数量',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'offset',
    description: '偏移量',
    required: false,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getTripPlans(
    @Param('tripId') tripId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    try {
      const result = await this.planningWorkbenchAgent.getTripPlans(tripId, {
        status: status as any,
        limit: limit ? parseInt(limit.toString(), 10) : 20,
        offset: offset ? parseInt(offset.toString(), 10) : 0,
      });
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取指定方案的详细信息
   */
  @Public()
  @Get('plans/:planId')
  @ApiOperation({
    summary: '获取方案详情',
    description: '获取指定方案的详细信息（包含完整的 planState 和 uiOutput）',
  })
  @ApiParam({
    name: 'planId',
    description: '方案 ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getPlan(@Param('planId') planId: string) {
    try {
      const result = await this.planningWorkbenchAgent.getPlan(planId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 对比多个规划方案
   */
  @Public()
  @Post('plans/compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '对比多个规划方案',
    description: '对比多个规划方案，提供详细的对比结果',
  })
  @ApiBody({
    description: '对比方案请求',
    schema: {
      type: 'object',
      properties: {
        planIds: {
          type: 'array',
          items: { type: 'string' },
          description: '要对比的方案 ID 列表（至少 2 个）',
        },
        compareFields: {
          type: 'array',
          items: { type: 'string' },
          description: '要对比的字段（可选）',
        },
      },
      required: ['planIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '对比成功',
  })
  async comparePlans(@Body() body: { planIds: string[]; compareFields?: string[] }) {
    try {
      const result = await this.planningWorkbenchAgent.comparePlans(body.planIds, body.compareFields);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 基于现有方案进行调整
   */
  @Public()
  @Post('plans/:planId/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '调整规划方案',
    description: '基于现有方案进行调整，提供更细粒度的调整控制',
  })
  @ApiParam({
    name: 'planId',
    description: '方案 ID',
    type: 'string',
  })
  @ApiBody({
    description: '调整方案请求',
    schema: {
      type: 'object',
      properties: {
        adjustments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['add_place', 'remove_place', 'modify_constraint', 'change_day', 'modify_budget'],
              },
              data: { type: 'object' },
            },
          },
        },
        regenerate: {
          type: 'boolean',
          description: '是否重新生成方案',
          default: true,
        },
      },
      required: ['adjustments'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '调整成功',
  })
  async adjustPlan(
    @Param('planId') planId: string,
    @Body() body: { adjustments: Array<{ type: string; data: any }>; regenerate?: boolean },
  ) {
    try {
      const result = await this.planningWorkbenchAgent.adjustPlan(planId, body.adjustments, body.regenerate);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 提交方案接口
   */
  @Public()
  @Post('plans/:planId/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提交规划方案',
    description: '将规划方案提交并保存到行程，支持部分提交',
  })
  @ApiParam({
    name: 'planId',
    description: '规划 ID',
    type: 'string',
  })
  @ApiBody({
    description: '提交方案请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        options: {
          type: 'object',
          properties: {
            partialCommit: { type: 'boolean', description: '是否部分提交' },
            commitDays: { type: 'array', items: { type: 'number' }, description: '要提交的天数（如果部分提交）' },
          },
        },
      },
      required: ['tripId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '提交成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            tripId: { type: 'string' },
            planId: { type: 'string' },
            committedAt: { type: 'string' },
            changes: {
              type: 'object',
              properties: {
                added: { type: 'number' },
                modified: { type: 'number' },
                removed: { type: 'number' },
              },
            },
          },
        },
      },
    },
  })
  async commitPlan(
    @Param('planId') planId: string,
    @Body() body: { tripId: string; options?: { partialCommit?: boolean; commitDays?: number[] } },
  ) {
    try {
      const result = await this.planningWorkbenchAgent.commitPlan(planId, body.tripId, body.options);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 预算合理性评估（Should-Exist Gate）
   */
  @Public()
  @Post('budget/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '预算合理性评估',
    description: '评估规划方案的预算合理性（Should-Exist Gate 的一部分）',
  })
  @ApiBody({
    description: '预算评估请求',
    schema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: '方案 ID' },
        tripId: { type: 'string', description: '行程 ID' },
        estimatedCost: { type: 'number', description: '预估总成本' },
        categoryBreakdown: {
          type: 'object',
          properties: {
            accommodation: { type: 'number' },
            transportation: { type: 'number' },
            food: { type: 'number' },
            activities: { type: 'number' },
            other: { type: 'number' },
          },
        },
        budgetConstraint: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            currency: { type: 'string' },
            dailyBudget: { type: 'number' },
            categoryLimits: { type: 'object' },
            alertThreshold: { type: 'number' },
          },
        },
      },
      required: ['planId', 'tripId', 'estimatedCost', 'categoryBreakdown', 'budgetConstraint'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '评估成功',
  })
  async evaluateBudget(@Body() body: {
    planId: string;
    tripId: string;
    estimatedCost: number;
    categoryBreakdown: {
      accommodation: number;
      transportation: number;
      food: number;
      activities: number;
      other: number;
    };
    budgetConstraint: BudgetConstraint;
  }) {
    try {
      const result = await this.budgetEvaluationService.evaluateBudget({
        planId: body.planId,
        tripId: body.tripId,
        estimatedCost: body.estimatedCost,
        categoryBreakdown: body.categoryBreakdown,
        budgetConstraint: body.budgetConstraint,
      });
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取预算决策日志
   */
  @Public()
  @Get('budget/decision-log')
  @ApiOperation({
    summary: '获取预算决策日志',
    description: '获取预算评估的决策日志（用于可解释性）',
  })
  @ApiQuery({ name: 'planId', description: '方案 ID', required: true })
  @ApiQuery({ name: 'tripId', description: '行程 ID', required: true })
  @ApiQuery({ name: 'limit', description: '分页限制', required: false, type: Number })
  @ApiQuery({ name: 'offset', description: '分页偏移', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getBudgetDecisionLog(
    @Query('planId') planId: string,
    @Query('tripId') tripId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    try {
      const result = await this.budgetEvaluationService.getBudgetDecisionLog(
        planId,
        tripId,
        limit ? parseInt(limit.toString(), 10) : undefined,
        offset ? parseInt(offset.toString(), 10) : undefined,
      );
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 获取规划方案的预算评估结果
   */
  @Public()
  @Get('plans/:planId/budget-evaluation')
  @ApiOperation({
    summary: '获取规划方案的预算评估结果',
    description: '获取规划方案的预算评估结果，包含三人格输出（Abu）',
  })
  @ApiParam({ name: 'planId', description: '方案 ID' })
  @ApiQuery({ name: 'tripId', description: '行程 ID', required: true })
  @ApiResponse({
    status: 200,
    description: '获取成功',
  })
  async getPlanBudgetEvaluation(
    @Param('planId') planId: string,
    @Query('tripId') tripId: string,
  ) {
    try {
      const result = await this.budgetEvaluationService.getPlanBudgetEvaluation(planId, tripId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 应用预算优化建议
   */
  @Public()
  @Post('budget/apply-optimization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '应用预算优化建议',
    description: '应用预算优化建议（自动调整行程项）',
  })
  @ApiBody({
    description: '应用优化请求',
    schema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: '方案 ID' },
        tripId: { type: 'string', description: '行程 ID' },
        optimizationIds: {
          type: 'array',
          items: { type: 'string' },
          description: '要应用的优化建议 ID 列表',
        },
        autoCommit: { type: 'boolean', description: '是否自动提交（默认 false）', default: false },
      },
      required: ['planId', 'tripId', 'optimizationIds'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '应用成功',
  })
  async applyBudgetOptimization(@Body() body: {
    planId: string;
    tripId: string;
    optimizationIds: string[];
    autoCommit?: boolean;
  }) {
    try {
      // TODO: 实现应用优化建议的逻辑
      // 当前返回模拟结果
      const result = {
        planId: body.planId,
        appliedOptimizations: body.optimizationIds.map(id => ({
          id,
          type: 'REPLACE',
          estimatedSavings: 100,
          status: 'success' as const,
        })),
        totalSavings: body.optimizationIds.length * 100,
        newEstimatedCost: 0, // 需要从实际方案中计算
      };
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 后台管理接口 ====================

  @Public()
  @Get('admin/sessions')
  @ApiOperation({
    summary: '获取规划会话列表（管理接口）',
    description: '获取规划会话列表，支持分页、筛选、排序。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'] })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回会话列表',
    type: ApiSuccessResponseDto,
  })
  async getAdminSessions(@Query() query: any) {
    try {
      const result = await this.planningWorkbenchAdminService.getSessions({
        tripId: query.tripId,
        userId: query.userId,
        status: query.status,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取会话列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/sessions/:id')
  @ApiOperation({
    summary: '获取规划会话详情（管理接口）',
    description: '获取单个规划会话的详细信息，包含所有交互历史。',
  })
  @ApiParam({ name: 'id', description: '会话ID（PlanningPlan ID）' })
  @ApiResponse({
    status: 200,
    description: '成功返回会话详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '会话不存在',
    type: ApiErrorResponseDto,
  })
  async getAdminSessionDetail(@Param('id') id: string) {
    try {
      const session = await this.planningWorkbenchAdminService.getSessionById(id);
      if (!session) {
        return errorResponse(ErrorCode.NOT_FOUND, `会话 ${id} 不存在`);
      }
      return successResponse(session);
    } catch (error: any) {
      this.logger.error(`获取会话详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/sessions/stats')
  @ApiOperation({
    summary: '获取会话统计（管理接口）',
    description: '获取规划会话的统计信息，包括成功率、平均时长等。',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回会话统计',
    type: ApiSuccessResponseDto,
  })
  async getAdminSessionStats(@Query() query: any) {
    try {
      const stats = await this.planningWorkbenchAdminService.getSessionStats({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
      });
      return successResponse(stats);
    } catch (error: any) {
      this.logger.error(`获取会话统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/plans')
  @ApiOperation({
    summary: '获取规划方案列表（管理接口）',
    description: '获取规划方案列表，支持分页、筛选。',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'] })
  @ApiResponse({
    status: 200,
    description: '成功返回方案列表',
    type: ApiSuccessResponseDto,
  })
  async getAdminPlans(@Query() query: any) {
    try {
      const result = await this.planningWorkbenchAdminService.getPlans({
        tripId: query.tripId,
        status: query.status,
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取方案列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/plans/:id')
  @ApiOperation({
    summary: '获取规划方案详情（管理接口）',
    description: '获取单个规划方案的详细信息。',
  })
  @ApiParam({ name: 'id', description: '方案ID（PlanningPlan ID）' })
  @ApiResponse({
    status: 200,
    description: '成功返回方案详情',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '方案不存在',
    type: ApiErrorResponseDto,
  })
  async getAdminPlanDetail(@Param('id') id: string) {
    try {
      const plan = await this.planningWorkbenchAdminService.getPlanById(id);
      if (!plan) {
        return errorResponse(ErrorCode.NOT_FOUND, `方案 ${id} 不存在`);
      }
      return successResponse(plan);
    } catch (error: any) {
      this.logger.error(`获取方案详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
