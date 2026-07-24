// src/trips/decision/decision.controller.ts
import { Controller, Post, Get, Body, Param, Query, Logger, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiQuery } from '@nestjs/swagger';
import { TripDecisionEngineService } from './trip-decision-engine.service';
import { StrategyOrchestratorService } from './services/strategy-orchestrator.service';
import { WorldModelContext, RoutePlanDraft } from './shared/world-model.types';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { Public } from '../../auth/decorators/public.decorator';
import { DecisionLogStorageService } from './services/decision-log-storage.service';
import { DecisionStatsService } from './services/decision-stats.service';
import { DecisionLogClusteringService } from './evaluation/decision-log-clustering.service';
import { AdminDecisionLogListQueryDto, AdminDecisionStatsQueryDto } from './dto/admin-decision.dto';
import { AdminDecisionLogFactAppendDto } from './dto/admin-quality-fact.dto';
import { ConstraintConflictResolver } from './constraints/constraint-conflict-resolver.service';
import { ConstraintEngineService } from './constraints/constraint-engine.service';
import { DailyUtilityCalculatorService } from './optimization/daily-utility';
import { PlanModificationLogService } from './services/plan-modification-log.service';
import { PlanModificationEventDto } from './dto/plan-modification.dto';
import { MultiPlanGenerator } from './services/multi-plan-generator.service';
import { DetectConflictsRequestDto, GenerateMultiplePlansRequestDto } from './dto/constraint-dsl.dto';
import { TripWorldState } from './world-model';
import { TripPlan } from './plan-model';
import { FeedbackCollectorService } from './feedback/feedback-collector.service';
import { QualityAssessorService } from './feedback/quality-assessor.service';
import { MemoryUpdaterService } from './feedback/memory-updater.service';
import {
  PlanVariantFeedbackDto,
  ConflictFeedbackDto,
  DecisionQualityFeedbackDto,
  BatchFeedbackDto,
  FeedbackStatsQueryDto,
} from './dto/feedback.dto';
import { mergeTriggeredAssertions, normalizeHardRuleSnapshot } from './shared/hard-rule-snapshot.types';
import { assessDrift } from './shared/drift-assessment.util';
import { applyPrismaTripIdToWorldState } from '../execution-closure-persistence/apply-prisma-trip-id-to-world-state';

@ApiTags('decision')
@Controller('decision')
export class DecisionController {
  private readonly logger = new Logger(DecisionController.name);

  constructor(
    private readonly decisionEngine: TripDecisionEngineService,
    private readonly strategyOrchestrator: StrategyOrchestratorService,
    private readonly decisionLogStorage: DecisionLogStorageService,
    private readonly decisionStats: DecisionStatsService,
    private readonly clusteringService: DecisionLogClusteringService,
    @Optional() private readonly conflictResolver?: ConstraintConflictResolver,
    @Optional() private readonly constraintEngine?: ConstraintEngineService,
    @Optional() private readonly dailyUtilityCalculator?: DailyUtilityCalculatorService,
    @Optional() private readonly planModificationLog?: PlanModificationLogService,
    @Optional() private readonly multiPlanGenerator?: MultiPlanGenerator,
    @Optional() private readonly feedbackCollector?: FeedbackCollectorService,
    @Optional() private readonly qualityAssessor?: QualityAssessorService,
    @Optional() private readonly memoryUpdater?: MemoryUpdaterService,
  ) {}

  @Post('validate-safety')
  @ApiOperation({
    summary: '安全规则校验行程',
    description: '使用 Abu 策略校验行程中的物理安全违规项，识别危险区域并生成备选路线',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'plan'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        plan: { type: 'object', description: '路线计划草案' },
        worldContext: { type: 'object', description: '世界模型上下文' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '校验完成',
    type: ApiSuccessResponseDto,
  })
  async validateSafety(
    @Body() body: {
      tripId: string;
      plan: RoutePlanDraft;
      worldContext: WorldModelContext;
    }
  ) {
    try {
      // 参数验证
      if (!body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的参数');
      }
      if (!body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan 是必需的参数');
      }
      if (!body.plan.tripId && !body.tripId) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId 是必需的参数');
      }

      // 确保 plan 有 tripId
      const planWithTripId: RoutePlanDraft = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      };

      // 使用 StrategyOrchestrator 执行 Abu 校验
      const result = await this.strategyOrchestrator.run(body.worldContext, planWithTripId);

      if (!result.allowed) {
        // 生成备选路线建议
        const alternativeRoutes = await this.generateAlternativeRoutes(
          body.worldContext,
          planWithTripId,
          result.logs
        );

        return successResponse({
          allowed: false,
          violations: result.logs.filter(log => log.persona === 'ABU'),
          alternativeRoutes,
          message: '行程包含安全违规项，已生成备选路线',
        });
      }

      return successResponse({
        allowed: true,
        violations: [],
        message: '行程通过安全校验',
      });
    } catch (error: any) {
      this.logger.error(`安全校验失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('adjust-pacing')
  @ApiOperation({
    summary: '行程节奏智能调整',
    description: '使用 Dr.Dre 策略调整行程节奏，拆分密集活动并插入缓冲时间',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'plan', 'worldContext'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        plan: { type: 'object', description: '路线计划草案' },
        worldContext: { type: 'object', description: '世界模型上下文' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '节奏调整完成',
    type: ApiSuccessResponseDto,
  })
  async adjustPacing(
    @Body() body: {
      tripId: string;
      plan: RoutePlanDraft;
      worldContext: WorldModelContext;
    }
  ) {
    try {
      // 参数验证
      if (!body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的参数');
      }
      if (!body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan 是必需的参数');
      }
      if (!body.plan.tripId && !body.tripId) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId 是必需的参数');
      }

      // 确保 plan 有 tripId
      const planWithTripId: RoutePlanDraft = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      };

      // 使用 StrategyOrchestrator 执行 Dr.Dre 调整
      const result = await this.strategyOrchestrator.run(body.worldContext, planWithTripId);

      if (result.plan && result.finalAction === 'ADJUST') {
        return successResponse({
          success: true,
          adjustedPlan: result.plan,
          changes: result.logs.filter(log => log.persona === 'DR_DRE'),
          message: '行程节奏已自动调整，已拆分密集活动并插入缓冲时间',
        });
      }

      return successResponse({
        success: false,
        message: '行程节奏无需调整',
      });
    } catch (error: any) {
      this.logger.error(`节奏调整失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('replace-nodes')
  @ApiOperation({
    summary: '路线节点智能替换',
    description: '使用 Neptune 策略替换不可用的路线节点，保持路线哲学不变',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'plan', 'worldContext', 'unavailableNodes'],
      properties: {
        tripId: { type: 'string', description: '行程 ID' },
        plan: { type: 'object', description: '路线计划草案' },
        worldContext: { type: 'object', description: '世界模型上下文' },
        unavailableNodes: {
          type: 'array',
          description: '不可用的节点列表',
          items: {
            type: 'object',
            properties: {
              nodeId: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '节点替换完成',
    type: ApiSuccessResponseDto,
  })
  async replaceNodes(
    @Body() body: {
      tripId: string;
      plan: RoutePlanDraft;
      worldContext: WorldModelContext;
      unavailableNodes: Array<{ nodeId: string; reason: string }>;
    }
  ) {
    try {
      // 参数验证
      if (!body.worldContext) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'worldContext 是必需的参数');
      }
      if (!body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'plan 是必需的参数');
      }
      if (!body.plan.tripId && !body.tripId) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'tripId 是必需的参数');
      }
      if (!body.unavailableNodes || body.unavailableNodes.length === 0) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'unavailableNodes 是必需的参数');
      }

      // 确保 plan 有 tripId
      const planWithTripId: RoutePlanDraft = {
        ...body.plan,
        tripId: body.plan.tripId || body.tripId,
      };

      // 标记不可用节点（通过 metadata）
      const updatedPlan: RoutePlanDraft = {
        ...planWithTripId,
        segments: (planWithTripId.segments || []).map(segment => {
          const unavailable = body.unavailableNodes.find(u => u.nodeId === segment.segmentId);
          return unavailable
            ? {
                ...segment,
                metadata: {
                  ...segment.metadata,
                  status: 'UNAVAILABLE',
                  reason: unavailable.reason,
                },
              }
            : segment;
        }),
      };

      // 使用 StrategyOrchestrator 执行 Neptune 替换
      const result = await this.strategyOrchestrator.run(body.worldContext, updatedPlan);

      if (result.plan && result.finalAction === 'REPLACE') {
        return successResponse({
          success: true,
          replacedPlan: result.plan,
          replacements: result.logs.filter(log => log.persona === 'NEPTUNE'),
          message: '路线节点已自动替换，保持路线核心风格不变',
        });
      }

      return successResponse({
        success: false,
        message: '无法找到合适的替换节点',
      });
    } catch (error: any) {
      this.logger.error(`节点替换失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 生成备选路线
   */
  private async generateAlternativeRoutes(
    _worldContext: WorldModelContext,
    _originalPlan: RoutePlanDraft,
    _violationLogs: any[]
  ): Promise<Array<{
    description: string;
    plan: RoutePlanDraft;
    reason: string;
  }>> {
    // TODO: 实现备选路线生成逻辑
    // 这里简化处理，实际应该调用 Neptune 策略生成绕开危险区域的路线
    return [];
  }

  // ==================== 后台管理接口 ====================

  @Public()
  @Get('admin/logs')
  @ApiOperation({
    summary: '获取决策日志列表（管理接口）',
    description: '获取决策日志列表，支持分页、筛选、排序。用于后台管理系统。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回决策日志列表（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminLogs(@Query() query: AdminDecisionLogListQueryDto) {
    try {
      const result = await this.decisionLogStorage.queryLogsPaginated({
        tripId: query.tripId,
        userId: query.userId,
        persona: query.persona,
        decisionSource: query.decisionSource,
        action: query.action,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`获取决策日志列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/logs/:id')
  @ApiOperation({
    summary: '获取决策日志详情（管理接口）',
    description: '获取单个决策日志的详细信息，包含所有关联数据。',
  })
  @ApiParam({ name: 'id', description: '决策日志ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回决策日志详情（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '决策日志不存在（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async getAdminLogDetail(@Param('id') id: string) {
    try {
      const log = await this.decisionLogStorage.getLogDetailById(id);
      if (!log) {
        return errorResponse(ErrorCode.NOT_FOUND, `决策日志 ${id} 不存在`);
      }
      return successResponse(log);
    } catch (error: any) {
      this.logger.error(`获取决策日志详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/logs/:id/qa-view')
  @ApiOperation({
    summary: 'Fact vs Reasoning QA view (Side-by-side)',
    description:
      'Left: metadata.assertions_triggered (hard facts). Right: explanation. Also returns raw metadata for audit.',
  })
  async getAdminLogQaView(@Param('id') id: string) {
    try {
      const log = await this.decisionLogStorage.getLogDetailById(id);
      if (!log) {
        return errorResponse(ErrorCode.NOT_FOUND, `决策日志 ${id} 不存在`);
      }
      const meta = (log.metadata && typeof log.metadata === 'object') ? log.metadata : {};
      const fact = normalizeHardRuleSnapshot(meta).assertions_triggered;
      return successResponse({
        id: log.id,
        tripId: log.tripId,
        persona: log.persona,
        action: log.action,
        timestamp: log.timestamp,
        fact,
        reasoning: { explanation: log.explanation, reasonCodes: log.reasonCodes },
        metadata: meta,
      });
    } catch (error: any) {
      this.logger.error(`获取决策日志 QA 视图失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/logs/:id/qa-pair')
  @ApiOperation({
    summary: 'QA Pair: Fact + Reasoning + drift_score',
    description:
      'Aggregates HardRuleFact (left) + explanation (right) and returns a heuristic drift_score for auto-sampling.',
  })
  async getAdminLogQaPair(@Param('id') id: string) {
    try {
      const log = await this.decisionLogStorage.getLogDetailById(id);
      if (!log) {
        return errorResponse(ErrorCode.NOT_FOUND, `决策日志 ${id} 不存在`);
      }
      const meta = (log.metadata && typeof log.metadata === 'object') ? log.metadata : {};
      const fact = normalizeHardRuleSnapshot(meta).assertions_triggered;
      const explanation = String(log.explanation ?? '');
      const assessed = assessDrift({ fact, explanation });

      return successResponse({
        id: log.id,
        tripId: log.tripId,
        persona: log.persona,
        action: log.action,
        timestamp: log.timestamp,
        fact,
        reasoning: { explanation, reasonCodes: log.reasonCodes },
        drift_score: assessed.drift_score,
        drift_label: assessed.drift_label,
        drift_signals: assessed.drift_signals,
        metadata: meta,
      });
    } catch (error: any) {
      this.logger.error(`获取决策日志 QA Pair 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('admin/logs/:id/facts')
  @ApiOperation({
    summary: 'Append/merge hard facts into DecisionLog.metadata.assertions_triggered',
    description:
      'This is the write path for Fact snapshots. Frontend can call after inspection or during orchestration to persist physics facts.',
  })
  async appendAdminLogFacts(@Param('id') id: string, @Body() body: AdminDecisionLogFactAppendDto) {
    try {
      const log = await this.decisionLogStorage.getLogDetailById(id);
      if (!log) {
        return errorResponse(ErrorCode.NOT_FOUND, `决策日志 ${id} 不存在`);
      }
      const meta = (log.metadata && typeof log.metadata === 'object') ? log.metadata : {};
      const merged = mergeTriggeredAssertions(meta, body.assertions_triggered as any);
      const updated = await this.decisionLogStorage.updateLogMetadata(id, merged as any);
      return successResponse({ id: updated?.metadata ? id : id, assertions_triggered: merged.assertions_triggered });
    } catch (error: any) {
      this.logger.error(`追加决策日志 Fact 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/stats')
  @ApiOperation({
    summary: '获取决策统计信息（管理接口）',
    description: '获取决策统计信息，包括按国家、路线方向、Persona等维度的统计。',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回决策统计（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminStats(@Query() query: AdminDecisionStatsQueryDto) {
    try {
      const startDate = query.startDate ? new Date(query.startDate) : undefined;
      const endDate = query.endDate ? new Date(query.endDate) : undefined;

      let stats;
      if (query.countryCode) {
        stats = await this.decisionStats.getStatsByCountry(
          query.countryCode,
          startDate,
          endDate,
        );
      } else if (query.routeDirectionId) {
        stats = await this.decisionStats.getStatsByRouteDirection(
          query.routeDirectionId,
          startDate,
          endDate,
        );
      } else {
        // 全局统计
        stats = await this.decisionStats.getStatsByCountry(
          undefined,
          startDate,
          endDate,
        );
      }

      // 获取 Persona 触发统计
      const personaStats = await this.decisionStats.getPersonaTriggerStats(
        startDate,
        endDate,
      );

      return successResponse({
        distribution: stats,
        personaStats,
        realityDrivenRatio: stats.realityDrivenRatio,
      });
    } catch (error: any) {
      this.logger.error(`获取决策统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('admin/analytics')
  @ApiOperation({
    summary: '获取决策分析报告（管理接口）',
    description: '获取决策质量分析报告，包括质量评分、HEURISTIC热点、拒绝原因分析等。',
  })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（ISO 8601）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（ISO 8601）' })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiResponse({
    status: 200,
    description: '成功返回决策分析报告（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  async getAdminAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('countryCode') countryCode?: string,
  ) {
    try {
      const start = startDate ? new Date(startDate) : undefined;
      const end = endDate ? new Date(endDate) : undefined;

      // 获取统计信息
      const stats = countryCode
        ? await this.decisionStats.getStatsByCountry(countryCode, start, end)
        : await this.decisionStats.getStatsByCountry(undefined, start, end);

      // 获取 HEURISTIC 热点
      const heuristicHotspots = await this.decisionStats.getHeuristicHotspots(10);

      // 获取 Persona 统计
      const personaStats = await this.decisionStats.getPersonaTriggerStats(start, end);

      // 计算质量评分
      const overallScore = stats.realityDrivenRatio * 0.6 + 
        (1 - stats.bySourcePercentage.HEURISTIC) * 0.4;

      // 分析拒绝原因（从日志中提取）
      const rejectionLogs = await this.decisionLogStorage.queryLogs({
        action: 'REJECT',
        startDate: start,
        endDate: end,
        countryCode,
        limit: 1000,
      });

      const rejectionReasons: Array<{ reason: string; count: number; percentage: number }> = [];
      const reasonMap = new Map<string, number>();
      
      rejectionLogs.forEach(log => {
        log.reasonCodes.forEach(code => {
          const count = reasonMap.get(code) || 0;
          reasonMap.set(code, count + 1);
        });
      });

      const totalRejections = rejectionLogs.length;
      reasonMap.forEach((count, reason) => {
        rejectionReasons.push({
          reason,
          count,
          percentage: totalRejections > 0 ? (count / totalRejections) * 100 : 0,
        });
      });

      rejectionReasons.sort((a, b) => b.count - a.count);

      // 分析替换原因
      const replacementLogs = await this.decisionLogStorage.queryLogs({
        action: 'REPLACE',
        startDate: start,
        endDate: end,
        countryCode,
        limit: 1000,
      });

      const replacementReasons: Array<{ reason: string; count: number; percentage: number }> = [];
      const replacementReasonMap = new Map<string, number>();
      
      replacementLogs.forEach(log => {
        log.reasonCodes.forEach(code => {
          const count = replacementReasonMap.get(code) || 0;
          replacementReasonMap.set(code, count + 1);
        });
      });

      const totalReplacements = replacementLogs.length;
      replacementReasonMap.forEach((count, reason) => {
        replacementReasons.push({
          reason,
          count,
          percentage: totalReplacements > 0 ? (count / totalReplacements) * 100 : 0,
        });
      });

      replacementReasons.sort((a, b) => b.count - a.count);

      return successResponse({
        qualityReport: {
          overallScore,
          realityDrivenRatio: stats.realityDrivenRatio,
          explanationQuality: 0.85, // TODO: 基于实际数据计算
          decisionConsistency: 0.82, // TODO: 基于实际数据计算
        },
        heuristicHotspots: heuristicHotspots.map(hotspot => ({
          countryCode: hotspot.countryCode,
          routeDirectionId: hotspot.routeDirectionId,
          heuristicRatio: hotspot.heuristicRatio,
          recommendation: hotspot.suggestions.join('; '),
        })),
        rejectionReasons: rejectionReasons.slice(0, 10),
        replacementReasons: replacementReasons.slice(0, 10),
        personaStats,
        distribution: stats,
      });
    } catch (error: any) {
      this.logger.error(`获取决策分析报告失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('admin/logs/export')
  @ApiOperation({
    summary: '导出决策日志（管理接口）',
    description: '导出决策日志数据，支持JSON和CSV格式。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
        filters: {
          type: 'object',
          properties: {
            tripId: { type: 'string' },
            userId: { type: 'string' },
            persona: { type: 'string' },
            decisionSource: { type: 'string' },
            action: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功导出决策日志',
  })
  async exportAdminLogs(@Body() body: { format?: 'json' | 'csv'; filters?: any }) {
    try {
      const format = body.format || 'json';
      const filters = body.filters || {};

      // 使用分页查询方法获取所有数据
      const where: any = {};
      if (filters.tripId) {
        where.tripId = filters.tripId;
      }
      if (filters.persona) {
        where.persona = filters.persona;
      }
      if (filters.decisionSource) {
        where.decisionSource = filters.decisionSource;
      }
      if (filters.action) {
        where.action = filters.action;
      }
      if (filters.startDate || filters.endDate) {
        where.timestamp = {};
        if (filters.startDate) {
          where.timestamp.gte = new Date(filters.startDate);
        }
        if (filters.endDate) {
          where.timestamp.lte = new Date(filters.endDate);
        }
      }

      // 查询完整日志数据
      const logs = await this.decisionLogStorage.queryRawLogs({
        tripId: filters.tripId,
        persona: filters.persona,
        decisionSource: filters.decisionSource,
        action: filters.action,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
        limit: 10000, // 最大导出10000条
      });

      if (format === 'csv') {
        // CSV 格式导出
        const csvHeaders = [
          'ID',
          'Trip ID',
          'Persona',
          'Action',
          'Decision Source',
          'Decision Stage',
          'Explanation',
          'Reason Codes',
          'Timestamp',
          'Country Code',
          'Route Direction ID',
        ];

        const csvRows = logs.map(log => [
          log.id,
          log.tripId || '',
          log.persona,
          log.action,
          log.decisionSource,
          (log as any).decisionStage || 'FINALIZE',
          log.explanation.replace(/"/g, '""'), // 转义双引号
          (log.reasonCodes || []).join('; '),
          log.timestamp.toISOString(),
          log.countryCode || '',
          log.routeDirectionId || '',
        ]);

        const csvContent = [
          csvHeaders.join(','),
          ...csvRows.map(row => row.map(cell => `"${String(cell)}"`).join(',')),
        ].join('\n');

        return {
          success: true,
          data: {
            format: 'csv',
            content: csvContent,
            filename: `decision-logs-${new Date().toISOString().split('T')[0]}.csv`,
          },
        };
      } else {
        // JSON 格式导出
        const jsonData = logs.map(log => ({
          id: log.id,
          tripId: log.tripId,
          persona: log.persona,
          action: log.action,
          decisionSource: log.decisionSource,
          decisionStage: (log as any).decisionStage || 'FINALIZE',
          explanation: log.explanation,
          reasonCodes: log.reasonCodes || [],
          evidenceRefs: log.evidenceRefs || [],
          timestamp: log.timestamp.toISOString(),
          countryCode: log.countryCode,
          routeDirectionId: log.routeDirectionId,
          metadata: log.metadata || {},
        }));

        return successResponse({
          format: 'json',
          data: jsonData,
          count: jsonData.length,
        });
      }
    } catch (error: any) {
      this.logger.error(`导出决策日志失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('detect-conflicts')
  @ApiOperation({
    summary: '检测约束冲突',
    description: '检测约束DSL中的冲突，生成权衡选项和修复建议',
  })
  @ApiBody({ type: DetectConflictsRequestDto })
  @ApiResponse({
    status: 200,
    description: '冲突检测完成',
    type: ApiSuccessResponseDto,
  })
  async detectConflicts(@Body() body: DetectConflictsRequestDto) {
    try {
      if (!this.conflictResolver) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'ConstraintConflictResolver 不可用');
      }

      // 🆕 修复：constraints 缺失时使用空对象，返回无冲突结果，避免前端在行程创建/澄清阶段报错
      // 场景：自然语言创建行程的澄清阶段尚无 plan/constraints，前端可能预请求冲突检测
      const constraints = body.constraints ?? {};

      const state: TripWorldState = { ...(body.state ?? {}) } as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);

      const conflictResult = await this.conflictResolver.detectAndExplainConflicts(
        constraints as any,
        body.plan || null,
        state
      );

      return successResponse({
        conflicts: conflictResult.conflicts,
        has_conflicts: conflictResult.has_conflicts,
        summary: {
          critical: conflictResult.critical_count,
          high: conflictResult.high_count,
          medium: conflictResult.medium_count,
          low: conflictResult.low_count,
        },
      });
    } catch (error: any) {
      this.logger.error(`冲突检测失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('check-constraints-with-explanation')
  @ApiOperation({
    summary: '检查约束并获取不可行性解释',
    description: '检查计划的约束违规情况，并提供详细的不可行性解释和修复建议',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['state', 'plan'],
      properties: {
        tripId: { type: 'string', description: 'Prisma Trip.id（可选，ECO 账本上下文）' },
        state: { type: 'object', description: '世界状态' },
        plan: { type: 'object', description: '行程计划' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '约束检查完成',
    type: ApiSuccessResponseDto,
  })
  async checkConstraintsWithExplanation(
    @Body() body: { state: TripWorldState; plan: TripPlan; tripId?: string }
  ) {
    try {
      // Phase 0: 优先使用 ConstraintEngineService.isFeasible 统一入口
      if (!this.constraintEngine) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'ConstraintEngineService 不可用');
      }

      if (!body.state || !body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state 和 plan 是必需的参数');
      }

      applyPrismaTripIdToWorldState(body.state, body.tripId);
      const result = await this.constraintEngine.isFeasible(body.state, body.plan);
      return successResponse({
        feasible: result.feasible,
        isValid: result.feasible,
        violations: result.violations,
        summary: result.rawCheckResult.summary,
        conflicts: result.rawCheckResult.conflicts,
        infeasibilityExplanation: result.infeasibilityExplanation,
        canonicalReport: result.canonicalReport,
        constraintShadowComparison: result.constraintShadowComparison,
      });
    } catch (error: any) {
      this.logger.error(`约束检查失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('compute-daily-utility')
  @ApiOperation({
    summary: '计算日级 ExpectedUtility',
    description: 'Phase 2 ExpectedUtility v1：ExperienceScore、CostEfficiency、TimeEfficiency、ComfortScore、SafetyScore + 三项惩罚',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['state', 'plan'],
      properties: {
        tripId: { type: 'string', description: 'Prisma Trip.id（可选，ECO 账本上下文）' },
        state: { type: 'object', description: 'TripWorldState' },
        plan: { type: 'object', description: 'TripPlan' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '计算完成', type: ApiSuccessResponseDto })
  async computeDailyUtility(@Body() body: { state: TripWorldState; plan: TripPlan; tripId?: string }) {
    try {
      if (!this.dailyUtilityCalculator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'DailyUtilityCalculator 不可用');
      }
      if (!body.state || !body.plan) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state 和 plan 是必需的参数');
      }
      applyPrismaTripIdToWorldState(body.state, body.tripId);
      const result = this.dailyUtilityCalculator.compute(body.plan, body.state);
      return successResponse(result);
    } catch (error: any) {
      this.logger.error(`DailyUtility 计算失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('log-plan-modification')
  @ApiOperation({
    summary: '记录用户修改行为',
    description: 'Phase 3：用于反向学习、用户修改热力图分析。前端在用户修改方案后调用',
  })
  @ApiBody({ type: PlanModificationEventDto })
  @ApiResponse({ status: 200, description: '记录完成', type: ApiSuccessResponseDto })
  async logPlanModification(@Body() body: PlanModificationEventDto) {
    try {
      if (!this.planModificationLog) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'PlanModificationLog 不可用');
      }
      if (!body.planId || !body.modificationType) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'planId 和 modificationType 是必需的');
      }
      await this.planModificationLog.logModification({
        planId: body.planId,
        tripId: body.tripId,
        modificationType: body.modificationType,
        affectedDate: body.affectedDate,
        affectedSlotId: body.affectedSlotId,
        beforeSummary: body.beforeSummary,
        afterSummary: body.afterSummary,
        context: body.context,
      });
      return successResponse({ logged: true });
    } catch (error: any) {
      this.logger.error(`用户修改日志记录失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('generate-multiple-plans')
  @ApiOperation({
    summary: '生成多个方案变体',
    description: '并行生成多个方案（保守、平衡、激进），每个方案包含评分和权衡分析',
  })
  @ApiBody({ type: GenerateMultiplePlansRequestDto })
  @ApiResponse({
    status: 200,
    description: '多方案生成完成',
    type: ApiSuccessResponseDto,
  })
  async generateMultiplePlans(@Body() body: GenerateMultiplePlansRequestDto) {
    try {
      if (!this.multiPlanGenerator) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'MultiPlanGenerator 不可用');
      }

      if (!body.state || !body.constraints) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, 'state 和 constraints 是必需的参数');
      }

      const state = body.state as TripWorldState;
      applyPrismaTripIdToWorldState(state, body.tripId);
      if (!(state.policies as { constraintDSL?: unknown } | undefined)?.constraintDSL && body.constraints) {
        state.policies = { ...(state.policies ?? {}), constraintDSL: body.constraints as any } as TripWorldState['policies'];
      }

      const { variants, log } = await this.decisionEngine.generateMultiplePlans(state);

      return successResponse({
        variants: variants.map(v => ({
          id: v.id,
          score: v.score,
          tradeoffs: v.tradeoffs,
          feasibility: v.feasibility,
          planSummary: {
            days: v.plan.days.length,
            totalActivities: v.plan.days.reduce(
              (sum, day) => sum + day.timeSlots.filter(s => s.type !== 'rest' && s.type !== 'transport').length,
              0
            ),
          },
        })),
        log: {
          runId: log.runId,
          explanation: log.explanation,
        },
      });
    } catch (error: any) {
      this.logger.error(`多方案生成失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('feedback/plan-variant')
  @ApiOperation({
    summary: '提交计划变体反馈',
    description: '收集用户对计划变体的反馈（选择、拒绝、修改等）',
  })
  @ApiBody({ type: PlanVariantFeedbackDto })
  @ApiResponse({
    status: 200,
    description: '反馈提交成功',
    type: ApiSuccessResponseDto,
  })
  async submitPlanVariantFeedback(@Body() dto: PlanVariantFeedbackDto) {
    try {
      if (!this.feedbackCollector) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
      }

      await this.feedbackCollector.collectPlanVariantFeedback({
        feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: dto.runId,
        variantId: dto.variantId,
        variantStrategy: dto.variantStrategy,
        userChoice: dto.userChoice,
        rating: dto.rating,
        reason: dto.reason,
        tripId: dto.tripId,
        userId: dto.userId,
        feedbackAt: new Date(),
      });

      return successResponse({ message: '反馈提交成功' });
    } catch (error: any) {
      this.logger.error(`提交计划变体反馈失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('feedback/conflict')
  @ApiOperation({
    summary: '提交约束冲突反馈',
    description: '收集用户对约束冲突解释和权衡选项的反馈',
  })
  @ApiBody({ type: ConflictFeedbackDto })
  @ApiResponse({
    status: 200,
    description: '反馈提交成功',
    type: ApiSuccessResponseDto,
  })
  async submitConflictFeedback(@Body() dto: ConflictFeedbackDto) {
    try {
      if (!this.feedbackCollector) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
      }

      await this.feedbackCollector.collectConflictFeedback({
        feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: dto.runId,
        conflictId: dto.conflictId,
        conflictType: dto.conflictType,
        understood: dto.understood,
        explanationClear: dto.explanationClear,
        tradeoffOptionsUseful: dto.tradeoffOptionsUseful,
        selectedTradeoffOption: dto.selectedTradeoffOption,
        tripId: dto.tripId,
        userId: dto.userId,
        feedbackAt: new Date(),
      });

      return successResponse({ message: '反馈提交成功' });
    } catch (error: any) {
      this.logger.error(`提交约束冲突反馈失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('feedback/decision-quality')
  @ApiOperation({
    summary: '提交决策质量反馈',
    description: '收集用户对整体决策质量的反馈',
  })
  @ApiBody({ type: DecisionQualityFeedbackDto })
  @ApiResponse({
    status: 200,
    description: '反馈提交成功',
    type: ApiSuccessResponseDto,
  })
  async submitDecisionQualityFeedback(@Body() dto: DecisionQualityFeedbackDto) {
    try {
      if (!this.feedbackCollector) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
      }

      await this.feedbackCollector.collectDecisionQualityFeedback({
        feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: dto.runId,
        overallSatisfaction: dto.overallSatisfaction,
        planQuality: dto.planQuality,
        conflictExplanationQuality: dto.conflictExplanationQuality,
        tradeoffOptionsQuality: dto.tradeoffOptionsQuality,
        decisionSpeed: dto.decisionSpeed,
        additionalFeedback: dto.additionalFeedback,
        tripId: dto.tripId,
        userId: dto.userId,
        feedbackAt: new Date(),
      });

      return successResponse({ message: '反馈提交成功' });
    } catch (error: any) {
      this.logger.error(`提交决策质量反馈失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Post('feedback/batch')
  @ApiOperation({
    summary: '批量提交反馈',
    description: '批量提交多种类型的反馈',
  })
  @ApiBody({ type: BatchFeedbackDto })
  @ApiResponse({
    status: 200,
    description: '反馈提交成功',
    type: ApiSuccessResponseDto,
  })
  async submitBatchFeedback(@Body() dto: BatchFeedbackDto) {
    try {
      if (!this.feedbackCollector) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
      }

      const planVariantFeedbacks = dto.planVariantFeedbacks?.map(f => ({
        feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: f.runId,
        variantId: f.variantId,
        variantStrategy: f.variantStrategy,
        userChoice: f.userChoice,
        rating: f.rating,
        reason: f.reason,
        tripId: f.tripId,
        userId: f.userId,
        feedbackAt: new Date(),
      }));

      const conflictFeedbacks = dto.conflictFeedbacks?.map(f => ({
        feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: f.runId,
        conflictId: f.conflictId,
        conflictType: f.conflictType,
        understood: f.understood,
        explanationClear: f.explanationClear,
        tradeoffOptionsUseful: f.tradeoffOptionsUseful,
        selectedTradeoffOption: f.selectedTradeoffOption,
        tripId: f.tripId,
        userId: f.userId,
        feedbackAt: new Date(),
      }));

      const decisionQualityFeedbacks = dto.decisionQualityFeedbacks?.map(f => ({
        feedbackId: `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        runId: f.runId,
        overallSatisfaction: f.overallSatisfaction,
        planQuality: f.planQuality,
        conflictExplanationQuality: f.conflictExplanationQuality,
        tradeoffOptionsQuality: f.tradeoffOptionsQuality,
        decisionSpeed: f.decisionSpeed,
        additionalFeedback: f.additionalFeedback,
        tripId: f.tripId,
        userId: f.userId,
        feedbackAt: new Date(),
      }));

      await this.feedbackCollector.collectBatchFeedback(
        planVariantFeedbacks,
        conflictFeedbacks,
        decisionQualityFeedbacks
      );

      return successResponse({ message: '批量反馈提交成功' });
    } catch (error: any) {
      this.logger.error(`批量提交反馈失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  @Public()
  @Get('feedback/stats')
  @ApiOperation({
    summary: '获取反馈统计',
    description: '获取用户反馈的统计信息',
  })
  @ApiResponse({
    status: 200,
    description: '反馈统计',
    type: ApiSuccessResponseDto,
  })
  async getFeedbackStats(@Query() query: FeedbackStatsQueryDto) {
    try {
      if (!this.feedbackCollector) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'FeedbackCollectorService 不可用');
      }

      const stats = await this.feedbackCollector.getFeedbackStats(
        query.userId,
        query.tripId,
        query.startDate ? new Date(query.startDate) : undefined,
        query.endDate ? new Date(query.endDate) : undefined
      );

      return successResponse(stats);
    } catch (error: any) {
      this.logger.error(`获取反馈统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
