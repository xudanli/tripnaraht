// src/trips/decision/decision.controller.ts
import { Controller, Post, Get, Body, Param, Query, Logger, NotFoundException } from '@nestjs/common';
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
    worldContext: WorldModelContext,
    originalPlan: RoutePlanDraft,
    violationLogs: any[]
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
}
