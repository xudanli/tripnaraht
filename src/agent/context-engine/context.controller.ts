// src/agent/context-engine/context.controller.ts
/**
 * Context Controller
 * 
 * 提供 Context 相关的 HTTP API 接口
 */

import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery } from '@nestjs/swagger';
import { ContextEngineerService } from './services/context-engineer.service';
import { ContextMetricsService } from './services/context-metrics.service';
import { ContextPrometheusMetricsService } from './services/context-prometheus-metrics.service';
import { ContextPerformanceAnalysisService } from './services/context-performance-analysis.service';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { SKILLS_REGISTRY_TOKEN } from '../../skills/services/skills-registry.token';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { ApiErrorResponseDto } from '../../common/dto/api-response.dto';
import { Public } from '../../auth/decorators/public.decorator';
import {
  BuildContextPackageDto,
  BuildContextPackageResponseDto,
  CompressContextDto,
  CompressContextResponseDto,
  ProjectStateDto,
  ProjectStateResponseDto,
  WriteBackDto,
  GetMetricsQueryDto,
  GetMetricsResponseDto,
} from './dto/context.dto';
import {
  GetContextPackagesQueryDto,
  ContextPackageListResponseDto,
  ContextPackageDetailResponseDto,
  GetContextMetricsQueryDto,
  ContextMetricsResponseDto,
  GetContextAnalyticsQueryDto,
  ContextAnalyticsResponseDto,
} from './dto/admin-context.dto';
import { Inject, Optional, Param } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

@ApiTags('context')
@Controller('context')
export class ContextController {
  private readonly logger = new Logger(ContextController.name);

  constructor(
    private readonly contextEngineer: ContextEngineerService,
    @Optional() private readonly metricsService?: ContextMetricsService,
    @Optional() private readonly prometheusMetrics?: ContextPrometheusMetricsService,
    @Optional() private readonly performanceAnalysis?: ContextPerformanceAnalysisService,
    @Inject(SKILLS_REGISTRY_TOKEN) @Optional() private readonly skillsRegistry?: SkillsRegistryService,
  ) {}

  /**
   * 构建 Context Package
   */
  @Public()
  @Post('build')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '构建 Context Package',
    description: `
根据 tripId、phase、agent、userQuery 构建 Context Package。

**功能**：
- 自动调用相关 skills（countryPack.getBlocks, plan.selectSlices 等）
- 处理 Token 预算和压缩
- 支持缓存（Redis + 内存缓存）

**返回**：
- contextPackage: 完整的 Context Package（包含 blocks、tokens、metadata 等）
    `.trim(),
  })
  @ApiBody({ type: BuildContextPackageDto })
  @ApiResponse({
    status: 200,
    description: '成功返回 Context Package',
    type: BuildContextPackageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async build(@Body() dto: BuildContextPackageDto) {
    try {
      const contextPackage = await this.contextEngineer.build(
        {
          tripId: dto.tripId,
          phase: dto.phase,
          agent: dto.agent,
          userQuery: dto.userQuery,
          tokenBudget: dto.tokenBudget,
          includePrivate: dto.includePrivate,
          requiredTopics: dto.requiredTopics,
          excludeTopics: dto.excludeTopics,
          includeApiDocs: dto.includeApiDocs,
          apiDocCategories: dto.apiDocCategories,
        },
        dto.useCache !== false, // 默认使用缓存
      );

      return successResponse({
        contextPackage,
      });
    } catch (error: any) {
      this.logger.error(`构建 Context Package 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 压缩 Context
   */
  @Public()
  @Post('compress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '压缩 Context Package',
    description: `
压缩 Context Package 中的 blocks，使其符合 Token 预算。

**压缩策略**：
- aggressive: 只保留硬门槛和关键决策点
- conservative: 尽量保留，只做摘要
- balanced: 保留关键内容，摘要其他（默认）

**压缩目标**：
- 硬门槛（Abu 拒绝的条件、道路/天气/体能门槛）
- 关键决策点（为什么选 A 不选 B）
- 失败尝试（哪些方案被否了 + 原因）
    `.trim(),
  })
  @ApiBody({ type: CompressContextDto })
  @ApiResponse({
    status: 200,
    description: '成功返回压缩后的 blocks',
    type: CompressContextResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async compress(@Body() dto: CompressContextDto) {
    try {
      // 通过 Skills Registry 调用 context.compress skill
      if (!this.skillsRegistry) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Skills Registry 未注入');
      }

      const compressSkill = this.skillsRegistry.getSkill('context.compress');
      if (!compressSkill) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'context.compress skill 未注册');
      }

      const result = await compressSkill.execute({
        blocks: dto.blocks,
        tokenBudget: dto.tokenBudget,
        strategy: dto.strategy || 'balanced',
        preserveKeys: dto.preserveKeys,
      });

      return successResponse({
        compressedBlocks: result.compressedBlocks,
        stats: result.stats,
      });
    } catch (error: any) {
      this.logger.error(`压缩 Context 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 投影状态
   */
  @Public()
  @Post('project-state')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '投影状态为 Public/Private',
    description: `
将全量 State（TripState 或 LangGraphState）投影为 Public/Private 两部分。

**Public 状态**：可进 prompt 的摘要信息
**Private 状态**：绝不进 prompt 的完整状态和原始数据

**用途**：
- LangGraph 节点中使用，确保 prompt 只包含必要信息
- 保护用户隐私和内部计算细节
    `.trim(),
  })
  @ApiBody({ type: ProjectStateDto })
  @ApiResponse({
    status: 200,
    description: '成功返回状态投影',
    type: ProjectStateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async projectState(@Body() dto: ProjectStateDto) {
    try {
      const projection = await this.contextEngineer.projectState(dto.state, {
        includeFullState: dto.includeFullState,
        decisionLogLimit: dto.decisionLogLimit,
        rejectionLogLimit: dto.rejectionLogLimit,
        tokenBudget: dto.tokenBudget,
      });

      return successResponse({
        projection,
      });
    } catch (error: any) {
      this.logger.error(`投影状态失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 写入回写
   */
  @Public()
  @Post('write-back')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '写入回写（Write Back）',
    description: `
保存节点的 scratchpad、decisionLogDelta、artifactsRefs。

**用途**：
- LangGraph 节点结束时调用
- 保存中间结果和决策日志增量
- 存储 artifacts 引用
    `.trim(),
  })
  @ApiBody({ type: WriteBackDto })
  @ApiResponse({
    status: 200,
    description: '写入成功',
  })
  @ApiResponse({
    status: 400,
    description: '请求参数错误',
    type: ApiErrorResponseDto,
  })
  async writeBack(@Body() dto: WriteBackDto) {
    try {
      await this.contextEngineer.writeBack(
        dto.tripRunId,
        dto.attemptNumber,
        dto.scratchpad,
        dto.decisionLogDelta,
        dto.artifactsRefs,
        dto.tripId || dto.phase
          ? { tripId: dto.tripId, phase: dto.phase as import('./interfaces/trip-task-memory.interface').TripTaskPhase | undefined }
          : undefined,
      );

      return successResponse({
        message: 'Write back 成功',
      });
    } catch (error: any) {
      this.logger.error(`Write back 失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  // ==================== 后台管理接口 ====================
  
  // 注意：admin 路由必须放在普通路由之前，避免路由冲突

  /**
   * Context 指标统计（后台管理）
   */
  @Public()
  @Get('admin/metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Context 指标统计（后台管理）',
    description: `
获取 Context 使用情况的统计指标，用于后台管理系统展示。

**功能**：
- 总体统计（总构建次数、平均 Token、缓存命中率等）
- 按 Agent 分类统计
- 按 Phase 分类统计
- 支持时间范围筛选
    `.trim(),
  })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'phase', required: false, type: String })
  @ApiQuery({ name: 'agent', required: false, type: String })
  @ApiQuery({ name: 'startTime', required: false, type: String })
  @ApiQuery({ name: 'endTime', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回指标统计',
    type: ContextMetricsResponseDto,
  })
  async getAdminMetrics(@Query() query: GetContextMetricsQueryDto) {
    try {
      if (!this.metricsService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Context Metrics Service 未注入');
      }

      const summary = await this.metricsService.getMetricsSummary({
        tripId: query.tripId,
        phase: query.phase,
        agent: query.agent,
        startTime: query.startTime,
        endTime: query.endTime,
      });

      const byAgent = this.metricsService.getStatsByAgent({
        startTime: query.startTime,
        endTime: query.endTime,
      });

      const byPhase = this.metricsService.getStatsByPhase({
        startTime: query.startTime,
        endTime: query.endTime,
      });

      return successResponse({
        summary,
        byAgent,
        byPhase,
      });
    } catch (error: any) {
      this.logger.error(`获取指标统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * Context Package 列表（后台管理）
   */
  @Public()
  @Get('admin/packages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Context Package 列表（后台管理）',
    description: `
获取历史构建的 Context Package 列表，支持分页、筛选、搜索。

**功能**：
- 分页列表
- 按 tripId、phase、agent 筛选
- 按时间范围筛选
- 搜索功能（userQuery、tripId）
    `.trim(),
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tripId', required: false, type: String })
  @ApiQuery({ name: 'phase', required: false, type: String })
  @ApiQuery({ name: 'agent', required: false, type: String })
  @ApiQuery({ name: 'startTime', required: false, type: String })
  @ApiQuery({ name: 'endTime', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: '成功返回 Context Package 列表',
    type: ContextPackageListResponseDto,
  })
  async getAdminPackages(@Query() query: GetContextPackagesQueryDto) {
    try {
      const result = this.contextEngineer.getPackages({
        page: query.page,
        limit: query.limit,
        tripId: query.tripId,
        phase: query.phase,
        agent: query.agent,
        startTime: query.startTime,
        endTime: query.endTime,
        search: query.search,
      });

      // 转换为列表项格式
      const packages = result.packages.map((pkg) => ({
        id: pkg.id,
        tripId: pkg.tripId,
        phase: pkg.phase,
        agent: pkg.agent,
        userQuery: pkg.userQuery,
        blocksCount: pkg.blocks.length,
        totalTokens: pkg.totalTokens,
        tokenBudget: pkg.tokenBudget,
        compressed: pkg.compressed,
        createdAt: pkg.createdAt,
      }));

      return successResponse({
        packages,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    } catch (error: any) {
      this.logger.error(`获取 Context Package 列表失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * Context Package 详情（后台管理）
   */
  @Public()
  @Get('admin/packages/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Context Package 详情（后台管理）',
    description: `
获取特定 Context Package 的详细信息。

**功能**：
- 显示完整的 Context Package
- 显示所有 blocks 的详细信息
- 显示构建元数据
- 显示关联的性能指标
    `.trim(),
  })
  @ApiParam({ name: 'id', description: 'Context Package ID' })
  @ApiResponse({
    status: 200,
    description: '成功返回 Context Package 详情',
    type: ContextPackageDetailResponseDto,
  })
  async getAdminPackageDetail(@Param('id') id: string) {
    try {
      const pkg = this.contextEngineer.getPackageById(id);
      if (!pkg) {
        return errorResponse(ErrorCode.NOT_FOUND, `Context Package ${id} 不存在`);
      }

      // 获取关联的指标记录
      let metrics;
      if (this.metricsService && pkg.tripId) {
        const allMetrics = this.metricsService.getAllMetrics({ tripId: pkg.tripId });
        // 找到最接近的指标记录（按时间）
        metrics = allMetrics
          .filter((m) => m.phase === pkg.phase && m.agent === pkg.agent)
          .sort((a, b) => {
            const timeDiffA = Math.abs(new Date(a.timestamp).getTime() - new Date(pkg.createdAt).getTime());
            const timeDiffB = Math.abs(new Date(b.timestamp).getTime() - new Date(pkg.createdAt).getTime());
            return timeDiffA - timeDiffB;
          })[0];
      }

      return successResponse({
        package: pkg,
        metrics,
      });
    } catch (error: any) {
      this.logger.error(`获取 Context Package 详情失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * Context 分析报告（后台管理）
   */
  @Public()
  @Get('admin/analytics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Context 分析报告（后台管理）',
    description: `
生成 Context 使用分析报告，用于深入了解 Context 的使用情况。

**功能**：
- Token 使用趋势
- 缓存命中率趋势
- 压缩率分析
- 质量分布分析
- Top Block Types
- 性能瓶颈分析
    `.trim(),
  })
  @ApiQuery({ name: 'startTime', required: false, type: String })
  @ApiQuery({ name: 'endTime', required: false, type: String })
  @ApiQuery({ name: 'granularity', required: false, enum: ['hour', 'day', 'week', 'month'] })
  @ApiResponse({
    status: 200,
    description: '成功返回分析报告',
    type: ContextAnalyticsResponseDto,
  })
  async getAdminAnalytics(@Query() query: GetContextAnalyticsQueryDto) {
    try {
      if (!this.metricsService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Context Metrics Service 未注入');
      }

      const records = this.metricsService.getAllMetrics({
        startTime: query.startTime,
        endTime: query.endTime,
      });

      if (records.length === 0) {
        return successResponse({
          tokenUsageTrend: [],
          cacheHitRateTrend: [],
          compressionAnalysis: {
            avgCompressionRate: 0,
            compressionRateDistribution: [],
          },
          qualityAnalysis: {
            distribution: { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0 },
            trend: [],
          },
          topBlockTypes: [],
          performanceBottlenecks: [],
        });
      }

      // 1. Token 使用趋势
      const granularity = query.granularity || 'day';
      const tokenUsageTrend = this.calculateTokenUsageTrend(records, granularity);

      // 2. 缓存命中率趋势
      const cacheHitRateTrend = this.calculateCacheHitRateTrend(records, granularity);

      // 3. 压缩率分析
      const compressionAnalysis = this.calculateCompressionAnalysis(records);

      // 4. 质量分布分析
      const qualityAnalysis = this.calculateQualityAnalysis(records, granularity);

      // 5. Top Block Types
      const topBlockTypes = this.calculateTopBlockTypes(records);

      // 6. 性能瓶颈分析
      const performanceBottlenecks = this.calculatePerformanceBottlenecks(records);

      return successResponse({
        tokenUsageTrend,
        cacheHitRateTrend,
        compressionAnalysis,
        qualityAnalysis,
        topBlockTypes,
        performanceBottlenecks,
      });
    } catch (error: any) {
      this.logger.error(`获取分析报告失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * 计算 Token 使用趋势
   */
  private calculateTokenUsageTrend(
    records: any[],
    granularity: 'hour' | 'day' | 'week' | 'month',
  ): Array<{ timestamp: string; avgTokens: number; maxTokens: number; minTokens: number; count: number }> {
    const grouped = this.groupByTime(records, granularity, (r) => r.tokens.total);
    return grouped.map((group) => ({
      timestamp: group.timestamp,
      avgTokens: Math.round(group.values.reduce((sum, v) => sum + v, 0) / group.values.length),
      maxTokens: Math.max(...group.values),
      minTokens: Math.min(...group.values),
      count: group.values.length,
    }));
  }

  /**
   * 计算缓存命中率趋势
   */
  private calculateCacheHitRateTrend(
    records: any[],
    granularity: 'hour' | 'day' | 'week' | 'month',
  ): Array<{ timestamp: string; cacheHitRate: number; count: number }> {
    const grouped = this.groupByTime(records, granularity, (r) => (r.performance.cacheHit ? 1 : 0));
    return grouped.map((group) => ({
      timestamp: group.timestamp,
      cacheHitRate: group.values.reduce((sum: number, v: number) => sum + v, 0) / group.values.length,
      count: group.values.length,
    }));
  }

  /**
   * 计算压缩率分析
   */
  private calculateCompressionAnalysis(records: any[]): {
    avgCompressionRate: number;
    compressionRateDistribution: Array<{ range: string; count: number }>;
  } {
    const compressionRates = records
      .filter((r) => r.blocks.compressionRate !== undefined)
      .map((r) => r.blocks.compressionRate || 0);

    const avgCompressionRate =
      compressionRates.length > 0
        ? compressionRates.reduce((sum, r) => sum + r, 0) / compressionRates.length
        : 0;

    // 分布：0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
    const ranges = [
      { range: '0-20%', min: 0, max: 0.2 },
      { range: '20-40%', min: 0.2, max: 0.4 },
      { range: '40-60%', min: 0.4, max: 0.6 },
      { range: '60-80%', min: 0.6, max: 0.8 },
      { range: '80-100%', min: 0.8, max: 1.0 },
    ];

    const distribution = ranges.map((r) => ({
      range: r.range,
      count: compressionRates.filter((rate) => rate >= r.min && rate < r.max).length,
    }));

    return {
      avgCompressionRate: Math.round(avgCompressionRate * 100) / 100,
      compressionRateDistribution: distribution,
    };
  }

  /**
   * 计算质量分布分析
   */
  private calculateQualityAnalysis(
    records: any[],
    granularity: 'hour' | 'day' | 'week' | 'month',
  ): {
    distribution: Record<string, number>;
    trend: Array<{ timestamp: string; excellent: number; good: number; fair: number; poor: number }>;
  } {
    const distribution = {
      EXCELLENT: records.filter((r) => r.quality.quality === 'EXCELLENT').length,
      GOOD: records.filter((r) => r.quality.quality === 'GOOD').length,
      FAIR: records.filter((r) => r.quality.quality === 'FAIR').length,
      POOR: records.filter((r) => r.quality.quality === 'POOR').length,
    };

    // 趋势
    const trend = this.groupByTime(records, granularity, (r) => r.quality.quality).map((group) => {
      const qualityCounts = { EXCELLENT: 0, GOOD: 0, FAIR: 0, POOR: 0 };
      group.values.forEach((quality) => {
        if (qualityCounts[quality as keyof typeof qualityCounts] !== undefined) {
          qualityCounts[quality as keyof typeof qualityCounts]++;
        }
      });
      return {
        timestamp: group.timestamp,
        excellent: qualityCounts.EXCELLENT,
        good: qualityCounts.GOOD,
        fair: qualityCounts.FAIR,
        poor: qualityCounts.POOR,
      };
    });

    return { distribution, trend };
  }

  /**
   * 计算 Top Block Types
   */
  private calculateTopBlockTypes(records: any[]): Array<{ type: string; count: number; avgTokens: number }> {
    const blockTypeStats: Record<string, { count: number; tokens: number[] }> = {};

    for (const record of records) {
      for (const [type, count] of Object.entries(record.blockTypeDistribution)) {
        if (!blockTypeStats[type]) {
          blockTypeStats[type] = { count: 0, tokens: [] };
        }
        blockTypeStats[type].count += Number(count) || 0;
        // 估算每个 block 的平均 tokens（简化计算）
        if (record.blocks.total > 0) {
          blockTypeStats[type].tokens.push(record.tokens.total / record.blocks.total);
        }
      }
    }

    return Object.entries(blockTypeStats)
      .map(([type, stats]) => ({
        type,
        count: stats.count,
        avgTokens: Math.round(
          stats.tokens.reduce((sum, t) => sum + t, 0) / stats.tokens.length,
        ),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * 计算性能瓶颈
   */
  private calculatePerformanceBottlenecks(records: any[]): Array<{
    agent: string;
    phase: string;
    avgBuildTimeMs: number;
    count: number;
  }> {
    const bottlenecks: Record<string, { buildTimes: number[]; count: number }> = {};

    for (const record of records) {
      const key = `${record.agent}:${record.phase}`;
      if (!bottlenecks[key]) {
        bottlenecks[key] = { buildTimes: [], count: 0 };
      }
      bottlenecks[key].buildTimes.push(record.performance.buildTimeMs);
      bottlenecks[key].count++;
    }

    return Object.entries(bottlenecks)
      .map(([key, stats]) => {
        const [agent, phase] = key.split(':');
        return {
          agent,
          phase,
          avgBuildTimeMs: Math.round(
            stats.buildTimes.reduce((sum, t) => sum + t, 0) / stats.buildTimes.length,
          ),
          count: stats.count,
        };
      })
      .sort((a, b) => b.avgBuildTimeMs - a.avgBuildTimeMs)
      .slice(0, 10);
  }

  /**
   * 按时间分组
   */
  private groupByTime<T>(
    records: any[],
    granularity: 'hour' | 'day' | 'week' | 'month',
    valueExtractor: (record: any) => T,
  ): Array<{ timestamp: string; values: T[] }> {
    const groups: Record<string, T[]> = {};

    for (const record of records) {
      const date = new Date(record.timestamp);
      let key: string;

      switch (granularity) {
        case 'hour':
          key = date.toISOString().slice(0, 13) + ':00:00Z';
          break;
        case 'day':
          key = date.toISOString().slice(0, 10) + 'T00:00:00Z';
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().slice(0, 10) + 'T00:00:00Z';
          break;
        case 'month':
          key = date.toISOString().slice(0, 7) + '-01T00:00:00Z';
          break;
        default:
          key = date.toISOString().slice(0, 10) + 'T00:00:00Z';
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(valueExtractor(record));
    }

    return Object.entries(groups)
      .map(([timestamp, values]) => ({ timestamp, values }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * 获取 Context 指标（智能体系统接口）
   * 
   * 注意：此接口放在 admin 接口之后，避免路由冲突
   */
  @Public()
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '获取 Context 指标',
    description: `
获取 Context Package 的质量和性能指标。

**指标类型**：
- Token 使用、压缩率、命中率
- 块类型分布、优先级分布
- 缓存命中率、构建耗时
- 质量分布（EXCELLENT/GOOD/FAIR/POOR）

**查询参数**：
- tripId: 按 Trip ID 过滤
- phase: 按规划阶段过滤
- agent: 按 Agent 过滤
- startTime/endTime: 时间范围
- limit: 返回最近 N 条记录（用于 getRecent）
    `.trim(),
  })
  @ApiQuery({ type: GetMetricsQueryDto })
  @ApiResponse({
    status: 200,
    description: '成功返回指标',
    type: GetMetricsResponseDto,
  })
  async getMetrics(@Query() query: GetMetricsQueryDto) {
    try {
      if (!this.metricsService) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, 'Context Metrics Service 未注入');
      }

      // 如果指定了 limit，返回最近的记录
      if (query.limit) {
        const recent = this.metricsService.getRecentMetrics(query.tripId, query.limit);
        const summary = await this.metricsService.getMetricsSummary({
          tripId: query.tripId,
          phase: query.phase,
          agent: query.agent,
          startTime: query.startTime,
          endTime: query.endTime,
        });

        return successResponse({
          summary,
          recent,
        });
      }

      // 否则只返回摘要
      const summary = await this.metricsService.getMetricsSummary({
        tripId: query.tripId,
        phase: query.phase,
        agent: query.agent,
        startTime: query.startTime,
        endTime: query.endTime,
      });

      return successResponse({
        summary,
      });
    } catch (error: any) {
      this.logger.error(`获取指标失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * Phase 1.4 优化: Prometheus 指标端点
   */
  @Public()
  @Get('prometheus-metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prometheus 指标',
    description: '返回 Prometheus 格式的 Context Engine 指标数据',
  })
  @ApiResponse({
    status: 200,
    description: 'Prometheus 格式的指标数据',
    content: {
      'text/plain': {
        schema: {
          type: 'string',
        },
      },
    },
  })
  async getPrometheusMetrics(): Promise<string> {
    try {
      if (!this.prometheusMetrics) {
        return '# Context Prometheus Metrics\n# Service not available\n';
      }

      const metrics = await this.prometheusMetrics.getMetrics();
      return metrics;
    } catch (error: any) {
      this.logger.error(`获取 Prometheus 指标失败: ${error.message}`, error.stack);
      return `# Context Prometheus Metrics\n# Error: ${error.message}\n`;
    }
  }

  /**
   * Phase 4.3 优化: 性能分析报告端点
   */
  @Public()
  @Get('performance-report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '性能分析报告',
    description: '生成 Context Engine 性能分析报告',
  })
  @ApiQuery({ name: 'startTime', required: false, type: String, description: '开始时间 (ISO 8601)' })
  @ApiQuery({ name: 'endTime', required: false, type: String, description: '结束时间 (ISO 8601)' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'markdown'], description: '报告格式' })
  @ApiQuery({ name: 'includeLearning', required: false, type: Boolean, description: '包含 Context Learning 数据' })
  @ApiQuery({ name: 'includeBottlenecks', required: false, type: Boolean, description: '包含性能瓶颈分析' })
  @ApiResponse({
    status: 200,
    description: '性能分析报告',
  })
  async getPerformanceReport(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('format') format: 'json' | 'markdown' = 'json',
    @Query('includeLearning') includeLearning?: boolean,
    @Query('includeBottlenecks') includeBottlenecks?: boolean,
  ) {
    try {
      if (!this.performanceAnalysis) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, '性能分析服务不可用');
      }

      // 默认时间范围：最近 24 小时
      const end = endTime ? new Date(endTime) : new Date();
      const start = startTime ? new Date(startTime) : new Date(end.getTime() - 24 * 60 * 60 * 1000);

      const report = await this.performanceAnalysis.generateReport(
        { start, end },
        {
          includeLearning: includeLearning ?? true,
          includeBottlenecks: includeBottlenecks ?? true,
        },
      );

      if (format === 'markdown') {
        const markdown = await this.performanceAnalysis.exportReportAsMarkdown(report);
        return {
          format: 'markdown',
          content: markdown,
        };
      }

      return successResponse(report);
    } catch (error: any) {
      this.logger.error(`生成性能分析报告失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
    }
  }
}
