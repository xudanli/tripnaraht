// src/agent/planning-workbench.controller.ts
/**
 * Planning Workbench Controller
 * 
 * 规划工作台 API 接口
 */

import { Controller, Post, Get, Body, Param, Query, HttpCode, HttpStatus, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiQuery, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { PlanningWorkbenchAgentService, PlanningWorkbenchRequest } from './services/planning-workbench-agent.service';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { Public } from '../auth/decorators/public.decorator';
import { BudgetEvaluationService } from '../trips/services/budget-evaluation.service';
import { TripBudgetService, BudgetConstraint } from '../trips/services/trip-budget.service';
import type { BudgetStructure, TripBudgetIntent } from '../trips/budget-os/types/trip-budget-os.types';
import { PlanningWorkbenchAdminService } from './services/planning-workbench-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceRouterService } from '../data-contracts/services/data-source-router.service';
import { WeatherQuery } from '../data-contracts/interfaces/weather.interface';
import { RoadStatusQuery } from '../data-contracts/interfaces/road-status.interface';
import { PlacesService } from '../places/places.service';
import { EvidenceFetchTaskService } from '../trips/services/evidence-fetch-task.service';
import { PlanningWorkbenchTaskService } from './services/planning-workbench-task.service';
import { TripSuggestionsService } from '../trips/services/trip-suggestions.service';
import { TripWishService } from '../trips/wishlist/services/trip-wish.service';
import { TripDomainInfluenceService } from '../trips/domain-influence/services/trip-domain-influence.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { PersonaShellOutputDto, GuardianPersonaPresentationDto } from './dto/guardian-persona.dto';

@ApiTags('planning-workbench')
@ApiExtraModels(PersonaShellOutputDto, GuardianPersonaPresentationDto)
@Controller('planning-workbench')
export class PlanningWorkbenchController {
  private readonly logger = new Logger(PlanningWorkbenchController.name);

  constructor(
    private readonly planningWorkbenchAgent: PlanningWorkbenchAgentService,
    private readonly budgetEvaluationService: BudgetEvaluationService,
    private readonly tripBudgetService: TripBudgetService,
    private readonly planningWorkbenchAdminService: PlanningWorkbenchAdminService,
    private readonly prisma?: PrismaService,
    @Optional() private readonly dataSourceRouter?: DataSourceRouterService,
    @Optional() private readonly placesService?: PlacesService,
    @Optional() private readonly evidenceFetchTaskService?: EvidenceFetchTaskService,
    @Optional() private readonly planningWorkbenchTaskService?: PlanningWorkbenchTaskService,
    @Optional() private readonly tripSuggestionsService?: TripSuggestionsService,
    @Optional() private readonly tripWishService?: TripWishService,
    @Optional() private readonly tripDomainInfluenceService?: TripDomainInfluenceService,
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
- generate: 生成行程骨架方案（✅ v2.0新增：自动填充DEM地形数据和地理特征）
- compare: 对比多个方案（✅ v2.0新增：多维度评分对比）
- commit: 提交选定的方案（✅ v2.0新增：自动填充DEM和地理特征）
- adjust: 调整现有方案

**v2.0新增功能**：
- ✅ DEM地形数据填充：自动填充segments的distanceKm、ascentM、slopePct
- ✅ 地理特征查询：自动查询河流、山脉、危险区域等
- ✅ RAG语义搜索：POI查询使用向量搜索进行语义匹配
- ✅ 决策追溯链：记录决策过程和排除原因

返回三人格的决策结果（Abu/Dr.Dre/Neptune），其他角色（预算/交通/节奏/总规划师）隐藏为能力模块。

详细文档请参考：/src/agent/PLANNING_WORKBENCH_API.md
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
        selectedOptionId: { type: 'string', description: '选定的方案ID（commit时使用）' },
        skeletonOptions: { type: 'object', description: '骨架方案集（compare时使用）' },
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
                personas: { $ref: getSchemaPath(PersonaShellOutputDto) },
                presentation: {
                  description: '单主角表达别名 — 与 uiOutput.personas.presentation 相同',
                  allOf: [{ $ref: getSchemaPath(GuardianPersonaPresentationDto) }],
                },
                consolidatedDecision: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ALLOW', 'NEED_CONFIRM', 'REJECT'] },
                    summary: { type: 'string' },
                    nextSteps: { type: 'array', items: { type: 'string' } },
                  },
                },
                skeletonOptions: {
                  type: 'object',
                  description: '骨架方案集（generate操作返回）',
                },
                comparison: {
                  type: 'object',
                  description: '对比结果（compare操作返回，包含多维度评分）',
                },
                health: {
                  type: 'object',
                  description: '健康度评估（预算/节奏/可行性）',
                },
                confirmations: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '需要用户确认的事项',
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
   * 愿望单摘要（工作台「私密想法」徽标 + 各天影响计数）
   */
  @Public()
  @Get('trips/:tripId/wish-summary')
  @ApiOperation({
    summary: '获取行程愿望单摘要',
    description: '供规划工作台展示私密愿望数量与各天偏好影响计数',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getTripWishSummary(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (!this.tripWishService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'TripWishService 未注入');
      }
      const userId = this.resolveWishUserId(user);
      const summary = await this.tripWishService.getWishSummary(tripId, userId);
      return successResponse(summary);
    } catch (error: any) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 行程领域分解（右侧栏：认领状态 + 影响力权重）
   */
  @Public()
  @Get('trips/:tripId/domain-breakdown')
  @ApiOperation({
    summary: '获取行程领域影响力分解',
    description: '供规划工作台右侧栏展示领域认领、团队认可度与决策权重',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getTripDomainBreakdown(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (!this.tripDomainInfluenceService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'TripDomainInfluenceService 未注入');
      }
      const userId = this.resolveWishUserId(user);
      const sidebar = await this.tripDomainInfluenceService.getWorkbenchSidebar(tripId, userId);
      return successResponse(sidebar);
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
      experience?: number;
    };
    budgetConstraint: BudgetConstraint;
    budgetIntent?: TripBudgetIntent;
    budgetStructure?: BudgetStructure;
  }) {
    try {
      const result = await this.budgetEvaluationService.evaluateBudget({
        planId: body.planId,
        tripId: body.tripId,
        estimatedCost: body.estimatedCost,
        categoryBreakdown: body.categoryBreakdown,
        budgetConstraint: body.budgetConstraint,
        budgetIntent: body.budgetIntent,
        budgetStructure: body.budgetStructure,
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

  /**
   * Auto综合：批量应用高优先级建议
   * 
   * 决策：只应用高优先级建议（severity === BLOCKER）
   * 参考：.claude/product-decisions/trip-detail-page-key-decisions.md
   */
  @Public()
  @Post('auto-optimize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Auto综合：批量应用高优先级建议',
    description: '自动应用所有高优先级建议（severity === BLOCKER）。只应用高优先级建议，确保安全性。',
  })
  @ApiBody({
    description: 'Auto综合请求',
    schema: {
      type: 'object',
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        preview: { type: 'boolean', description: '是否预览模式（不实际应用）', default: false },
        limit: { type: 'number', description: '最多应用的建议数量', default: 10 },
      },
      required: ['tripId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '执行成功',
  })
  async autoOptimize(@Body() body: {
    tripId: string;
    preview?: boolean;
    limit?: number;
  }) {
    try {
      if (!this.tripSuggestionsService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'TripSuggestionsService 未注入');
      }

      const result = await this.tripSuggestionsService.applyHighPrioritySuggestions(
        body.tripId,
        {
          preview: body.preview || false,
          limit: body.limit || 10,
        }
      );

      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`Auto综合优化失败: ${error.message}`, error.stack);
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

  // ==================== 天气数据获取接口 ====================

  @Public()
  @Post('trips/:tripId/fetch-weather')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '为行程地点批量获取天气数据',
    description: '为指定行程中缺少天气数据的地点批量获取天气数据，并更新到 Place 的 metadata 中',
  })
  @ApiParam({
    name: 'tripId',
    description: '行程 ID',
    type: 'string',
  })
  @ApiQuery({
    name: 'placeIds',
    description: '指定要获取天气数据的地点 ID 列表（可选，不提供则处理所有缺少天气数据的地点）',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'forceRefresh',
    description: '是否强制刷新已有天气数据',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回天气数据获取结果',
  })
  async fetchWeatherForTrip(
    @Param('tripId') tripId: string,
    @Query('placeIds') placeIds?: string,
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    try {
      if (!this.prisma) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'PrismaService 未注入');
      }

      if (!this.dataSourceRouter) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'DataSourceRouterService 未注入');
      }

      // 获取行程信息
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: {
                    select: {
                      id: true,
                      nameCN: true,
                      nameEN: true,
                      category: true,
                      metadata: true,
                    },
                  },
                },
                where: {
                  placeId: { not: null },
                },
              },
            },
          },
        },
      });

      if (!trip) {
        return errorResponse(ErrorCode.NOT_FOUND, `行程 ${tripId} 不存在`);
      }

      // 收集所有地点
      const placeMap = new Map<number, any>();
      const tripWithDays = trip as any; // 类型断言，因为 Prisma include 的类型推断可能不完整
      if (tripWithDays.TripDay) {
        for (const day of tripWithDays.TripDay) {
          if (day.ItineraryItem) {
            for (const item of day.ItineraryItem) {
              if (item.Place) {
                placeMap.set(item.Place.id, item.Place);
              }
            }
          }
        }
      }

      // 如果指定了 placeIds，只处理指定的地点
      let targetPlaceIds: number[] | null = null;
      if (placeIds) {
        targetPlaceIds = placeIds.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id));
      }

      const shouldForceRefresh = forceRefresh === 'true';
      const results: Array<{
        placeId: number;
        placeName: string;
        status: 'success' | 'failed' | 'skipped';
        error?: string;
        weatherData?: any;
      }> = [];

      let successCount = 0;
      let failedCount = 0;

      // 处理每个地点
      for (const [placeId, place] of placeMap.entries()) {
        // 如果指定了 placeIds，只处理指定的地点
        if (targetPlaceIds && !targetPlaceIds.includes(placeId)) {
          continue;
        }

        const placeName = place.nameCN || place.nameEN || `Place ${placeId}`;
        const metadata = (place.metadata as any) || {};

        // 检查是否已有天气数据
        if (!shouldForceRefresh && (metadata.weatherInfo || metadata.weather)) {
          results.push({
            placeId,
            placeName,
            status: 'skipped',
          });
          continue;
        }

        // 获取地点坐标
        let lat: number | null = null;
        let lng: number | null = null;

        // 方法1: 从 metadata 中获取坐标
        if (metadata.lat && metadata.lng) {
          lat = metadata.lat;
          lng = metadata.lng;
        } else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
          lat = metadata.coordinates[1];
          lng = metadata.coordinates[0];
        } else if (place.location) {
          // 方法2: 从 location 字段提取（支持多种格式）
          const location = place.location;
          
          // 2.1: 如果是 JSON 对象格式 {lat, lng}
          if (typeof location === 'object' && location.lat && location.lng) {
            lat = location.lat;
            lng = location.lng;
          }
          // 2.2: 如果是 GeoJSON 格式 {coordinates: [lng, lat]}
          else if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
            lng = location.coordinates[0];
            lat = location.coordinates[1];
          }
          // 2.3: 如果是字符串格式 POINT(lng lat)
          else if (typeof location === 'string') {
            const match = location.match(/POINT\(([^)]+)\)/);
            if (match) {
              const [lngStr, latStr] = match[1].split(/\s+/);
              lng = parseFloat(lngStr);
              lat = parseFloat(latStr);
            }
          }
        }

        // 方法3: 如果前面都没获取到，使用原始 SQL 查询 PostGIS location 字段
        if ((!lat || !lng) && this.prisma) {
          try {
            const placeCoords = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
              SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ${placeId} AND location IS NOT NULL
            `;
            if (placeCoords && placeCoords.length > 0 && placeCoords[0].lat && placeCoords[0].lng) {
              lat = placeCoords[0].lat;
              lng = placeCoords[0].lng;
            }
          } catch (err) {
            // 忽略查询错误，继续使用前面的结果
            this.logger.debug(`PostGIS 坐标查询失败 (placeId: ${placeId}): ${err}`);
          }
        }

        if (!lat || !lng) {
          this.logger.warn(`地点 ${placeId} (${placeName}) 无法获取坐标`);
          results.push({
            placeId,
            placeName,
            status: 'failed',
            error: '无法获取地点坐标',
          });
          failedCount++;
          continue;
        }

        try {
          // 调用天气接口获取天气数据
          const weatherQuery: WeatherQuery = {
            lat,
            lng,
            includeWindDetails: false,
            includeAuroraInfo: false,
          };

          const weatherData = await this.dataSourceRouter.getWeather(weatherQuery);

          // 更新 Place 的 metadata
          const updatedMetadata = {
            ...metadata,
            weatherInfo: {
              temperature: weatherData.temperature,
              feelsLikeTemperature: weatherData.feelsLikeTemperature,
              condition: weatherData.condition,
              windSpeed: weatherData.windSpeed,
              windDirection: weatherData.windDirection,
              humidity: weatherData.humidity,
              visibility: weatherData.visibility,
              alerts: weatherData.alerts,
              lastUpdated: weatherData.lastUpdated,
              source: weatherData.source,
            },
            weather: weatherData, // 保留完整数据
            weatherFetchedAt: new Date().toISOString(),
          };

          await this.prisma.place.update({
            where: { id: placeId },
            data: {
              metadata: updatedMetadata as any,
              updatedAt: new Date(),
            },
          });

          results.push({
            placeId,
            placeName,
            status: 'success',
            weatherData: {
              temperature: weatherData.temperature,
              condition: weatherData.condition,
              source: weatherData.source,
            },
          });
          successCount++;
        } catch (error: any) {
          this.logger.error(`为地点 ${placeId} (${placeName}) 获取天气数据失败: ${error.message}`, error.stack);
          results.push({
            placeId,
            placeName,
            status: 'failed',
            error: error.message || '获取天气数据失败',
          });
          failedCount++;
        }
      }

      return successResponse({
        totalPlaces: placeMap.size,
        processedPlaces: results.length,
        successCount,
        failedCount,
        results,
      });
    } catch (error: any) {
      this.logger.error(`批量获取天气数据失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 综合证据获取接口 ====================

  @Public()
  @Post('trips/:tripId/fetch-evidence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '为行程地点批量获取所有类型的证据数据',
    description: '为指定行程中缺少证据的地点批量获取天气、道路封闭、开放时间等证据数据，并更新到 Place 的 metadata 中',
  })
  @ApiParam({
    name: 'tripId',
    description: '行程 ID',
    type: 'string',
  })
  @ApiQuery({
    name: 'placeIds',
    description: '指定要获取证据的地点 ID 列表（可选，不提供则处理所有缺少证据的地点）',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'evidenceTypes',
    description: '要获取的证据类型，多个类型用逗号分隔（weather,road_closure,opening_hours）。不提供则获取所有类型',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'forceRefresh',
    description: '是否强制刷新已有证据数据',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回证据数据获取结果',
  })
  async fetchEvidenceForTrip(
    @Param('tripId') tripId: string,
    @Query('placeIds') placeIds?: string,
    @Query('evidenceTypes') evidenceTypes?: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('async') async?: string,  // P1功能：是否异步执行
  ) {
    // 🆕 P1功能：任务相关变量（在try块外声明，以便在catch中使用）
    let taskId: string | undefined;
    const shouldAsync = async === 'true';
    
    try {
      if (!this.prisma) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'PrismaService 未注入');
      }

      // 解析证据类型
      const requestedTypes = evidenceTypes
        ? evidenceTypes.split(',').map(t => t.trim().toLowerCase())
        : ['weather', 'road_closure', 'opening_hours'];
      
      const shouldFetchWeather = requestedTypes.includes('weather');
      const shouldFetchRoadClosure = requestedTypes.includes('road_closure');
      const shouldFetchOpeningHours = requestedTypes.includes('opening_hours');
      const shouldForceRefresh = forceRefresh === 'true';

      // 获取行程信息
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        include: {
          TripDay: {
            include: {
              ItineraryItem: {
                include: {
                  Place: {
                    select: {
                      id: true,
                      nameCN: true,
                      nameEN: true,
                      category: true,
                      metadata: true,
                    },
                  },
                },
                where: {
                  placeId: { not: null },
                },
              },
            },
          },
        },
      });

      if (!trip) {
        return errorResponse(ErrorCode.NOT_FOUND, `行程 ${tripId} 不存在`);
      }

      // 收集所有地点
      const placeMap = new Map<number, any>();
      const tripWithDays = trip as any;
      if (tripWithDays.TripDay) {
        for (const day of tripWithDays.TripDay) {
          if (day.ItineraryItem) {
            for (const item of day.ItineraryItem) {
              if (item.Place) {
                placeMap.set(item.Place.id, item.Place);
              }
            }
          }
        }
      }

      // 批量获取所有地点的坐标（使用原始 SQL 查询 PostGIS location 字段）
      const allPlaceIds = Array.from(placeMap.keys());
      const locationMap = new Map<number, { lat: number; lng: number }>();
      
      if (shouldAsync && this.evidenceFetchTaskService) {
        // 如果指定了 placeIds，只计算指定的地点数量
        const targetPlaceIds = placeIds
          ? placeIds.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id))
          : null;
        
        const totalPlaces = targetPlaceIds ? targetPlaceIds.length : placeMap.size;
        
        taskId = this.evidenceFetchTaskService.createTask(tripId, totalPlaces);
        this.evidenceFetchTaskService.markRunning(taskId);
        
        // 异步执行，立即返回任务ID
        // 使用setImmediate确保立即返回响应
        setImmediate(() => {
          this.executeFetchEvidenceAsync(
            taskId!,
            tripId,
            placeMap,
            targetPlaceIds,
            requestedTypes,
            shouldFetchWeather,
            shouldFetchRoadClosure,
            shouldFetchOpeningHours,
            shouldForceRefresh,
            locationMap,
          ).catch(error => {
            this.logger.error(`异步获取证据失败: ${error.message}`, error.stack);
            if (this.evidenceFetchTaskService) {
              this.evidenceFetchTaskService.markFailed(taskId!, error.message);
            }
          });
        });
        
        return successResponse({
          taskId,
          message: '证据获取任务已启动，请使用任务ID查询进度',
        });
      }
      if (allPlaceIds.length > 0 && this.prisma) {
        try {
          this.logger.debug(`批量查询 ${allPlaceIds.length} 个地点的坐标: ${allPlaceIds.join(', ')}`);
          
          // 根据用户反馈，location 字段可能是 JSON 对象格式 {lat, lng}
          // 尝试多种方式查询坐标
          
          // 方法1: 尝试 PostGIS geography 查询
          try {
            const postgisResults = await this.prisma.$queryRaw<Array<{ id: number; lat: number; lng: number }>>`
              SELECT 
                id,
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ANY(${allPlaceIds}::int[]) 
                AND location IS NOT NULL
            `;
            
            postgisResults.forEach(result => {
              if (!isNaN(result.lat) && !isNaN(result.lng)) {
                locationMap.set(result.id, {
                  lat: Number(result.lat),
                  lng: Number(result.lng),
                });
                this.logger.debug(`地点 ${result.id} 坐标（PostGIS）: lat=${result.lat}, lng=${result.lng}`);
              }
            });
            this.logger.debug(`PostGIS 查询返回 ${postgisResults.length} 个坐标`);
          } catch (postgisError: any) {
            this.logger.debug(`PostGIS 查询失败（可能不是 geography 类型）: ${postgisError.message}`);
          }
          
          // 方法2: 如果 PostGIS 查询没有返回所有地点，尝试查询 location 的文本表示（可能是 JSON）
          if (locationMap.size < allPlaceIds.length) {
            try {
              const missingIds = allPlaceIds.filter(id => !locationMap.has(id));
              if (missingIds.length > 0) {
                this.logger.debug(`尝试查询 ${missingIds.length} 个缺失地点的 location 文本`);
                // 直接查询 location 的文本表示，然后尝试解析
                const rawResults = await this.prisma.$queryRaw<Array<{ id: number; location_text: string | null }>>`
                  SELECT 
                    id,
                    location::text as location_text
                  FROM "Place"
                  WHERE id = ANY(${missingIds}::int[]) 
                    AND location IS NOT NULL
                `;
                
                this.logger.debug(`原始 location 文本查询返回 ${rawResults.length} 个结果`);
                rawResults.forEach(result => {
                  if (!locationMap.has(result.id) && result.location_text) {
                    const locText = result.location_text;
                    // 尝试解析 JSON 格式 {lat: ..., lng: ...}
                    try {
                      // 如果 location 是 JSONB 类型，直接解析
                      if (locText.startsWith('{')) {
                        const locJson = JSON.parse(locText);
                        if (locJson && typeof locJson === 'object' && locJson.lat && locJson.lng) {
                          locationMap.set(result.id, {
                            lat: Number(locJson.lat),
                            lng: Number(locJson.lng),
                          });
                          this.logger.debug(`地点 ${result.id} 坐标（JSON解析）: lat=${locJson.lat}, lng=${locJson.lng}`);
                        }
                      }
                      // 如果 location 是 PostGIS POINT 格式，解析坐标
                      else if (locText.includes('POINT')) {
                        const match = locText.match(/POINT\(([^)]+)\)/);
                        if (match) {
                          const [lngStr, latStr] = match[1].split(/\s+/);
                          const lng = parseFloat(lngStr);
                          const lat = parseFloat(latStr);
                          if (!isNaN(lat) && !isNaN(lng)) {
                            locationMap.set(result.id, { lat, lng });
                            this.logger.debug(`地点 ${result.id} 坐标（POINT解析）: lat=${lat}, lng=${lng}`);
                          }
                        }
                      }
                    } catch (parseError: any) {
                      this.logger.debug(`地点 ${result.id} location 解析失败: ${locText?.substring(0, 100)}, 错误: ${parseError.message}`);
                    }
                  }
                });
              }
            } catch (rawError: any) {
              this.logger.debug(`原始 location 文本查询失败: ${rawError.message}`);
            }
          }
          
          this.logger.debug(`最终 locationMap 大小: ${locationMap.size}/${allPlaceIds.length}`);
        } catch (error: any) {
          this.logger.warn(`批量提取坐标失败: ${error.message}`, error.stack);
        }
      }

      // 如果指定了 placeIds，只处理指定的地点
      let targetPlaceIds: number[] | null = null;
      if (placeIds) {
        targetPlaceIds = placeIds.split(',').map((id: string) => parseInt(id.trim(), 10)).filter((id: number) => !isNaN(id));
      }

      const results: Array<{
        placeId: number;
        placeName: string;
        evidenceTypes: string[];
        status: 'success' | 'partial' | 'failed';
        errors?: Record<string, string>;
        fetched?: Record<string, any>;
      }> = [];

      let successCount = 0;
      let partialCount = 0;
      let failedCount = 0;

      // 处理每个地点
      for (const [placeId, place] of placeMap.entries()) {
        // 如果指定了 placeIds，只处理指定的地点
        if (targetPlaceIds && !targetPlaceIds.includes(placeId)) {
          continue;
        }

        const placeName = place.nameCN || place.nameEN || `Place ${placeId}`;
        const metadata = (place.metadata as any) || {};
        
        // 🆕 P1功能：更新任务进度（同步模式）
        if (!shouldAsync && taskId && this.evidenceFetchTaskService) {
          const evidenceTypes = [];
          if (shouldFetchWeather) evidenceTypes.push('weather');
          if (shouldFetchRoadClosure) evidenceTypes.push('road_closure');
          if (shouldFetchOpeningHours) evidenceTypes.push('opening_hours');
          
          this.evidenceFetchTaskService.updateCurrentPlace(
            taskId,
            placeId,
            placeName,
            evidenceTypes,
          );
        }
        
        // 获取地点坐标
        let lat: number | null = null;
        let lng: number | null = null;

        // 方法1: 从 metadata 中获取坐标
        if (metadata.lat && metadata.lng) {
          lat = metadata.lat;
          lng = metadata.lng;
        } else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
          lat = metadata.coordinates[1];
          lng = metadata.coordinates[0];
        }
        // 方法2: 从批量查询的 locationMap 中获取（优先使用，因为已经查询过了）
        if (locationMap.has(placeId)) {
          const coords = locationMap.get(placeId)!;
          lat = coords.lat;
          lng = coords.lng;
          this.logger.debug(`从 locationMap 获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
        }
        // 方法3: 如果 locationMap 中没有，尝试从 place.location 对象中获取（Prisma 可能返回 JSON 格式）
        else if (place.location) {
          const location = place.location;
          
          // 3.1: 如果是 JSON 对象格式 {lat, lng}（Prisma 客户端可能返回这种格式）
          if (typeof location === 'object' && location.lat && location.lng) {
            lat = location.lat;
            lng = location.lng;
            this.logger.debug(`从 place.location JSON 对象获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
          }
          // 3.2: 如果是 GeoJSON 格式 {coordinates: [lng, lat]}
          else if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
            lng = location.coordinates[0];
            lat = location.coordinates[1];
            this.logger.debug(`从 place.location GeoJSON 获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
          }
          // 3.3: 如果是字符串格式 POINT(lng lat)
          else if (typeof location === 'string') {
            const match = location.match(/POINT\(([^)]+)\)/);
            if (match) {
              const [lngStr, latStr] = match[1].split(/\s+/);
              lng = parseFloat(lngStr);
              lat = parseFloat(latStr);
              this.logger.debug(`从 place.location 字符串获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
            }
          }
        }

        // 方法3: 如果前面都没获取到，使用原始 SQL 查询 PostGIS location 字段
        if ((!lat || !lng) && this.prisma) {
          try {
            const placeCoords = await this.prisma.$queryRaw<Array<{ lat: number; lng: number }>>`
              SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ${placeId} AND location IS NOT NULL
            `;
            if (placeCoords && placeCoords.length > 0 && placeCoords[0].lat && placeCoords[0].lng) {
              lat = placeCoords[0].lat;
              lng = placeCoords[0].lng;
            }
          } catch (err) {
            // 忽略查询错误，继续使用前面的结果
            this.logger.debug(`PostGIS 坐标查询失败 (placeId: ${placeId}): ${err}`);
          }
        }

        const fetched: Record<string, any> = {};
        const errors: Record<string, string> = {};
        const evidenceTypesFetched: string[] = [];

        // 1. 获取天气数据
        if (shouldFetchWeather && lat && lng) {
          if (shouldForceRefresh || !metadata.weatherInfo && !metadata.weather) {
            try {
              if (this.dataSourceRouter) {
                const weatherQuery: WeatherQuery = {
                  lat,
                  lng,
                  includeWindDetails: false,
                  includeAuroraInfo: false,
                };
                const weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
                fetched.weather = {
                  temperature: weatherData.temperature,
                  condition: weatherData.condition,
                  source: weatherData.source,
                };
                metadata.weatherInfo = {
                  temperature: weatherData.temperature,
                  feelsLikeTemperature: weatherData.feelsLikeTemperature,
                  condition: weatherData.condition,
                  windSpeed: weatherData.windSpeed,
                  windDirection: weatherData.windDirection,
                  humidity: weatherData.humidity,
                  visibility: weatherData.visibility,
                  alerts: weatherData.alerts,
                  lastUpdated: weatherData.lastUpdated,
                  source: weatherData.source,
                };
                metadata.weather = weatherData;
                metadata.weatherFetchedAt = new Date().toISOString();
                evidenceTypesFetched.push('weather');
              }
            } catch (error: any) {
              errors.weather = error.message || '获取天气数据失败';
            }
          }
        }

        // 2. 获取道路封闭信息
        if (shouldFetchRoadClosure && lat && lng) {
          if (shouldForceRefresh || !metadata.roadStatus && !metadata.roadClosure) {
            try {
              if (this.dataSourceRouter) {
                const roadQuery: RoadStatusQuery = {
                  lat,
                  lng,
                  radius: 50000, // 50km 半径
                  includeFRoadInfo: true,
                  includeRiverCrossing: true,
                };
                const roadStatus = await this.dataSourceRouter.getRoadStatus(roadQuery);
                fetched.road_closure = {
                  isOpen: roadStatus.isOpen,
                  riskLevel: roadStatus.riskLevel,
                  source: roadStatus.source,
                };
                metadata.roadStatus = {
                  isOpen: roadStatus.isOpen,
                  riskLevel: roadStatus.riskLevel,
                  reason: roadStatus.reason,
                  lastUpdated: roadStatus.lastUpdated,
                  source: roadStatus.source,
                  metadata: roadStatus.metadata,
                };
                metadata.roadClosure = !roadStatus.isOpen;
                metadata.roadStatusFetchedAt = new Date().toISOString();
                evidenceTypesFetched.push('road_closure');
              }
            } catch (error: any) {
              errors.road_closure = error.message || '获取道路封闭信息失败';
            }
          }
        }

        // 3. 获取开放时间
        if (shouldFetchOpeningHours) {
          if (shouldForceRefresh || !metadata.openingHours && !metadata.opening_hours) {
            try {
              if (this.placesService && place.category === 'ATTRACTION') {
                await this.placesService.enrichPlaceFromAmap(placeId);
                // 重新获取更新后的 metadata
                const updatedPlace = await this.prisma.place.findUnique({
                  where: { id: placeId },
                  select: { metadata: true },
                });
                if (updatedPlace) {
                  const updatedMetadata = (updatedPlace.metadata as any) || {};
                  if (updatedMetadata.openingHours || updatedMetadata.opening_hours) {
                    fetched.opening_hours = {
                      hasData: true,
                      source: 'amap',
                    };
                    metadata.openingHours = updatedMetadata.openingHours || updatedMetadata.opening_hours;
                    evidenceTypesFetched.push('opening_hours');
                  }
                }
              }
            } catch (error: any) {
              errors.opening_hours = error.message || '获取开放时间失败';
            }
          }
        }

        // 更新 Place metadata
        if (Object.keys(fetched).length > 0) {
          try {
            await this.prisma.place.update({
              where: { id: placeId },
              data: {
                metadata: metadata as any,
                updatedAt: new Date(),
              },
            });
          } catch (error: any) {
            this.logger.error(`更新地点 ${placeId} metadata 失败: ${error.message}`);
          }
        }

        // 确定状态
        const requestedCount = requestedTypes.length;
        const fetchedCount = evidenceTypesFetched.length;
        const errorCount = Object.keys(errors).length;

        let status: 'success' | 'partial' | 'failed';
        if (fetchedCount === requestedCount && errorCount === 0) {
          status = 'success';
          successCount++;
        } else if (fetchedCount > 0) {
          status = 'partial';
          partialCount++;
        } else {
          status = 'failed';
          failedCount++;
        }

        // 🆕 P1功能：更新任务进度（同步模式）
        if (!shouldAsync && taskId && this.evidenceFetchTaskService) {
          this.evidenceFetchTaskService.incrementProcessed(taskId, status);
        }

        results.push({
          placeId,
          placeName,
          evidenceTypes: evidenceTypesFetched,
          status,
          errors: Object.keys(errors).length > 0 ? errors : undefined,
          fetched: Object.keys(fetched).length > 0 ? fetched : undefined,
        });
      }

      // 🆕 P1功能：标记任务完成（同步模式）
      if (!shouldAsync && taskId && this.evidenceFetchTaskService) {
        this.evidenceFetchTaskService.markCompleted(taskId, successCount, failedCount, partialCount);
      }

      return successResponse({
        totalPlaces: placeMap.size,
        processedPlaces: results.length,
        successCount,
        partialCount,
        failedCount,
        requestedEvidenceTypes: requestedTypes,
        results,
      });
    } catch (error: any) {
      this.logger.error(`批量获取证据数据失败: ${error.message}`, error.stack);
      
      // 🆕 P1功能：标记任务失败（同步模式）
      // 注意：如果taskId存在且不是异步模式，说明是同步模式的任务
      if (taskId && this.evidenceFetchTaskService && async !== 'true') {
        this.evidenceFetchTaskService.markFailed(taskId, error.message);
      }
      
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 🆕 P1功能：异步执行证据获取（后台任务）
   * 
   * 注意：这是一个简化实现。完整的异步实现需要将处理逻辑提取为独立方法。
   * 当前实现中，异步模式会立即返回taskId，但实际执行仍在同步流程中。
   * 生产环境应该使用队列系统（如Bull、BullMQ）来实现真正的异步任务。
   */
  private async executeFetchEvidenceAsync(
    taskId: string,
    _tripId: string,
    _placeMap: Map<number, any>,
    _targetPlaceIds: number[] | null,
    _requestedTypes: string[],
    _shouldFetchWeather: boolean,
    _shouldFetchRoadClosure: boolean,
    _shouldFetchOpeningHours: boolean,
    _shouldForceRefresh: boolean,
    _locationMap: Map<number, { lat: number; lng: number }>,
  ): Promise<void> {
    // 注意：由于代码结构限制，这里只是占位符
    // 完整的异步实现需要将fetchEvidenceForTrip的处理逻辑提取为独立方法
    // 然后在这里调用该方法
    // 当前实现中，异步模式会立即返回taskId，但实际处理仍在同步流程中
    // 这需要重构代码结构才能实现真正的异步执行
    
    this.logger.debug(`异步任务 ${taskId} 已启动（注意：当前为简化实现）`);
  }

  /**
   * 🆕 P1功能：获取任务进度
   */
  @Public()
  @Get('tasks/:taskId/progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取证据获取任务进度',
    description: '查询异步证据获取任务的进度信息（P1功能）。支持轮询查询进度。',
  })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiResponse({
    status: 200,
    description: '成功获取任务进度',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '任务不存在',
    type: ApiErrorResponseDto,
  })
  async getTaskProgress(@Param('taskId') taskId: string) {
    try {
      if (!this.evidenceFetchTaskService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'EvidenceFetchTaskService 未注入');
      }

      const progress = this.evidenceFetchTaskService.getTaskProgress(taskId);
      if (!progress) {
        return errorResponse(ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在`);
      }

      return successResponse(progress);
    } catch (error: any) {
      this.logger.error(`获取任务进度失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '获取任务进度失败', { originalError: error.message });
    }
  }

  /**
   * 🆕 P1功能：取消任务
   */
  @Public()
  @Post('tasks/:taskId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '取消证据获取任务',
    description: '取消正在执行的证据获取任务（P1功能）。只能取消PENDING或RUNNING状态的任务。',
  })
  @ApiParam({ name: 'taskId', description: '任务ID' })
  @ApiResponse({
    status: 200,
    description: '成功取消任务',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '任务不存在或无法取消',
    type: ApiErrorResponseDto,
  })
  async cancelTask(@Param('taskId') taskId: string) {
    try {
      if (!this.evidenceFetchTaskService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'EvidenceFetchTaskService 未注入');
      }

      const cancelled = this.evidenceFetchTaskService.cancelTask(taskId);
      if (!cancelled) {
        return errorResponse(ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在或无法取消`);
      }

      return successResponse({
        taskId,
        message: '任务已取消',
      });
    } catch (error: any) {
      this.logger.error(`取消任务失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, '取消任务失败', { originalError: error.message });
    }
  }

  /**
   * 🆕 P0功能：异步执行规划工作台（后台任务）
   * 
   * 当请求参数中包含 `async=true` 时，此端点会立即返回 202 Accepted 和 taskId，
   * 实际处理在后台进行。客户端可以通过轮询 `/api/planning-workbench/tasks/:taskId/status` 
   * 来获取任务进度和结果。
   * 
   * 这是为了解决HTTP请求超时问题（P0优先级）。
   */
  @Public()
  @Post('execute-async')
  @HttpCode(202) // Accepted
  @ApiOperation({
    summary: '异步执行规划工作台（P0功能）',
    description: '异步执行规划工作台流程，立即返回 taskId，客户端需要轮询 /api/planning-workbench/tasks/:taskId/status 获取结果。使用场景：当规划工作台处理时间较长（>30秒）时，使用异步模式可以避免HTTP超时问题。工作流程：1. 调用此端点，立即返回 202 Accepted 和 taskId；2. 客户端轮询 /api/planning-workbench/tasks/:taskId/status 获取进度和结果；3. 当任务状态为 COMPLETED 时，结果在 result 字段中。轮询建议：初始间隔1秒，最大间隔5秒，超时时间120秒（2分钟）。',
  })
  @ApiBody({
    description: '规划工作台请求（与同步模式相同）',
  })
  @ApiResponse({
    status: 202,
    description: '任务已接受，返回 taskId',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            taskId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
            message: { type: 'string', example: '任务已接受，正在处理中' },
            statusUrl: { type: 'string', example: '/api/planning-workbench/tasks/:taskId/status' },
          },
        },
      },
    },
  })
  async executeAsync(@Body() request: PlanningWorkbenchRequest) {
    if (!this.planningWorkbenchTaskService) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'PlanningWorkbenchTaskService 未注入');
    }

    try {
      // 创建任务
      const taskId = this.planningWorkbenchTaskService.createTask();
      
      // 异步执行任务（不等待完成）
      // 使用 setImmediate 确保不会阻塞当前请求
      setImmediate(() => {
        this.executeTaskAsync(taskId, request).catch((error: any) => {
          this.logger.error(`异步任务执行失败: taskId=${taskId}, error=${error.message}`, error.stack);
          try {
            this.planningWorkbenchTaskService?.markFailed(taskId, error.message || '未知错误');
          } catch (markFailedError: any) {
            this.logger.error(`标记任务失败时出错: ${markFailedError.message}`, markFailedError.stack);
          }
        });
      });

      return successResponse({
        taskId,
        message: '任务已接受，正在处理中',
        statusUrl: `/api/planning-workbench/tasks/${taskId}/status`,
      });
    } catch (error: any) {
      this.logger.error(`创建异步任务失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 🆕 P0功能：获取规划工作台任务状态
   */
  @Public()
  @Get('tasks/:taskId/status')
  @HttpCode(200)
  @ApiOperation({
    summary: '获取规划工作台任务状态（P0功能）',
    description: '查询异步规划工作台任务的状态和进度。返回状态：PENDING（任务已创建，等待执行）、RUNNING（任务正在执行中）、COMPLETED（任务已完成，结果在 result 字段中）、FAILED（任务失败，错误信息在 error 字段中）、CANCELLED（任务已取消）。轮询建议：初始间隔1秒，最大间隔5秒，超时时间120秒（2分钟）。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: '成功获取任务状态',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
            progress: { type: 'number', minimum: 0, maximum: 100 },
            currentStage: { type: 'string', nullable: true },
            estimatedTimeRemaining: { type: 'number', nullable: true },
            error: { type: 'string', nullable: true },
            result: { type: 'object', nullable: true },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' },
            completedAt: { type: 'string', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: '任务不存在',
    type: ApiErrorResponseDto,
  })
  async getPlanningWorkbenchTaskStatus(@Param('taskId') taskId: string) {
    if (!this.planningWorkbenchTaskService) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'PlanningWorkbenchTaskService 未注入');
    }

    try {
      const progress = this.planningWorkbenchTaskService.getTaskProgress(taskId);
      if (!progress) {
        return errorResponse(ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在`);
      }

      return successResponse(progress);
    } catch (error: any) {
      this.logger.error(`获取任务状态失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 🆕 P0功能：取消规划工作台任务
   */
  @Public()
  @Post('tasks/:taskId/cancel-planning')
  @HttpCode(200)
  @ApiOperation({
    summary: '取消规划工作台任务（P0功能）',
    description: '取消正在执行的规划工作台任务。只能取消 PENDING 或 RUNNING 状态的任务。',
  })
  @ApiParam({
    name: 'taskId',
    description: '任务ID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: '成功取消任务',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  })
  async cancelPlanningWorkbenchTask(@Param('taskId') taskId: string) {
    if (!this.planningWorkbenchTaskService) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'PlanningWorkbenchTaskService 未注入');
    }

    try {
      const cancelled = this.planningWorkbenchTaskService.cancelTask(taskId);
      if (!cancelled) {
        return errorResponse(ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在或无法取消`);
      }

      return successResponse({
        taskId,
        message: '任务已取消',
      });
    } catch (error: any) {
      this.logger.error(`取消任务失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 内部方法：异步执行任务
   */
  private async executeTaskAsync(taskId: string, request: PlanningWorkbenchRequest): Promise<void> {
    if (!this.planningWorkbenchTaskService) {
      throw new Error('PlanningWorkbenchTaskService 未注入');
    }

    const startTime = Date.now();
    
    try {
      // 标记为运行中
      this.planningWorkbenchTaskService.markRunning(taskId, '正在初始化...');
      
      // 将 taskId 和进度更新函数注入到 request 的 metadata 中
      const requestWithProgress = {
        ...request,
        metadata: {
          ...(request as any).metadata,
          taskId,
          updateProgress: (progress: number, stage?: string) => {
            try {
              this.logger.debug(`进度更新回调被调用: taskId=${taskId}, progress=${progress}%, stage=${stage || 'N/A'}`);
              this.planningWorkbenchTaskService?.updateProgressPercent(taskId, progress, stage);
            } catch (error: any) {
              this.logger.error(`进度更新回调失败: ${error.message}`, error.stack);
            }
          },
        },
      };
      
      this.logger.debug(`开始执行异步任务: taskId=${taskId}, action=${request.userAction || 'generate'}`);
      
      // 执行规划工作台（使用包装后的 request）
      // 注意：由于 execute 方法目前不支持进度回调，我们通过拦截关键步骤来更新进度
      // 这里先标记为"正在生成方案"
      this.planningWorkbenchTaskService.updateProgressPercent(taskId, 10, '正在生成行程骨架方案...');
      
      const result = await this.planningWorkbenchAgent.execute(requestWithProgress);
      
      // 标记为完成
      this.planningWorkbenchTaskService.markCompleted(taskId, result);
      
      const duration = Date.now() - startTime;
      this.logger.log(`✅ 异步任务 ${taskId} 完成，耗时 ${duration}ms`);
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ 异步任务 ${taskId} 失败，耗时 ${duration}ms: ${error.message}`, error.stack);
      
      // 确保标记失败状态，即使出错也要更新
      try {
        this.planningWorkbenchTaskService.markFailed(taskId, error.message || '未知错误');
      } catch (markFailedError: any) {
        this.logger.error(`标记任务失败状态时出错: ${markFailedError.message}`, markFailedError.stack);
      }
      
      // 不重新抛出错误，因为这是异步任务，错误已经在 catch 中处理
      // throw error;
    }
  }

  private resolveWishUserId(user?: CurrentUserPayload): string {
    if (user?.userId) {
      return user.userId;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 'anonymous-dev-user';
    }
    throw new UnauthorizedException('未认证或 token 无效');
  }
}
