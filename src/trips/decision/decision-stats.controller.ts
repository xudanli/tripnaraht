// src/trips/decision/decision-stats.controller.ts
/**
 * Decision Stats Controller（决策统计控制器）
 * 
 * 提供决策统计 API 端点，供前端/Dashboard 使用
 */

import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { DecisionStatsService } from './services/decision-stats.service';
import { HeuristicDietService } from './services/heuristic-diet.service';
import { DecisionLogClusteringService } from './evaluation/decision-log-clustering.service';
import { ApiSuccessResponseDto } from '../../common/dto/api-response.dto';
import { Public } from '../../auth/decorators/public.decorator';

@ApiTags('decision')
@Controller('decision-stats')
export class DecisionStatsController {
  constructor(
    private readonly decisionStats: DecisionStatsService,
    private readonly heuristicDiet: HeuristicDietService,
    private readonly clusteringService: DecisionLogClusteringService,
  ) {}

  /**
   * 按国家统计决策分布
   * 
   * GET /decision-stats/by-country?countryCode=IS&startDate=2024-01-01&endDate=2024-12-31
   */
  @Public()
  @Get('by-country')
  @ApiOperation({
    summary: '按国家统计决策分布',
    description: '获取指定国家在指定时间范围内的决策统计分布数据',
  })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码（如 IS）' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiResponse({ status: 200, description: '成功返回统计结果', type: ApiSuccessResponseDto })
  async getStatsByCountry(
    @Query('countryCode') countryCode?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.decisionStats.getStatsByCountry(countryCode, start, end);
  }

  /**
   * 按路线方向统计决策分布
   * 
   * GET /decision-stats/by-route?routeDirectionId=iceland_highlands_froad
   */
  @Public()
  @Get('by-route')
  @ApiOperation({
    summary: '按路线方向统计决策分布',
    description: '获取指定路线方向在指定时间范围内的决策统计分布数据',
  })
  @ApiQuery({ name: 'routeDirectionId', required: false, description: '路线方向 ID' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiResponse({ status: 200, description: '成功返回统计结果', type: ApiSuccessResponseDto })
  async getStatsByRouteDirection(
    @Query('routeDirectionId') routeDirectionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.decisionStats.getStatsByRouteDirection(routeDirectionId, start, end);
  }

  /**
   * 按 Persona 统计触发频次
   * 
   * GET /decision-stats/by-persona
   */
  @Public()
  @Get('by-persona')
  @ApiOperation({
    summary: '按 Persona 统计触发频次',
    description: '获取三人格（Abu/Dr.Dre/Neptune）在指定时间范围内的触发频次统计',
  })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiResponse({ status: 200, description: '成功返回统计结果', type: ApiSuccessResponseDto })
  async getPersonaTriggerStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.decisionStats.getPersonaTriggerStats(start, end);
  }

  /**
   * 获取硬现实驱动比例
   * 
   * GET /decision-stats/reality-driven-ratio?countryCode=IS
   */
  @Public()
  @Get('reality-driven-ratio')
  @ApiOperation({
    summary: '获取硬现实驱动比例',
    description: '计算基于物理现实建模的决策比例（而非启发式）',
  })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiQuery({ name: 'routeDirectionId', required: false, description: '路线方向 ID' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiResponse({ status: 200, description: '成功返回比例数据', type: ApiSuccessResponseDto })
  async getRealityDrivenRatio(
    @Query('countryCode') countryCode?: string,
    @Query('routeDirectionId') routeDirectionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const ratio = await this.decisionStats.getRealityDrivenRatio(
      countryCode,
      routeDirectionId,
      start,
      end
    );
    return {
      ratio,
      percentage: (ratio * 100).toFixed(1) + '%',
      message: `我们 ${(ratio * 100).toFixed(1)}% 的关键决策来自物理现实建模，而不是启发式。`,
    };
  }

  /**
   * 获取 HEURISTIC 决策热点
   * 
   * GET /decision-stats/heuristic-hotspots?limit=10
   */
  @Public()
  @Get('heuristic-hotspots')
  @ApiOperation({
    summary: '获取 HEURISTIC 决策热点',
    description: '获取启发式决策的热点区域（需要优化的地方）',
  })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量限制', type: Number })
  @ApiResponse({ status: 200, description: '成功返回热点数据', type: ApiSuccessResponseDto })
  async getHeuristicHotspots(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.decisionStats.getHeuristicHotspots(limitNum);
  }

  /**
   * 生成 HEURISTIC 减肥计划
   * 
   * GET /decision-stats/heuristic-diet-plan
   */
  @Public()
  @Get('heuristic-diet-plan')
  @ApiOperation({
    summary: '生成 HEURISTIC 减肥计划',
    description: '生成减少启发式决策的优化计划',
  })
  @ApiResponse({ status: 200, description: '成功返回减肥计划', type: ApiSuccessResponseDto })
  async getHeuristicDietPlan() {
    return this.heuristicDiet.generateDietPlan();
  }

  /**
   * 分析最常见的拒绝原因
   * 
   * GET /decision-stats/rejection-reasons?countryCode=IS&limit=10
   */
  @Public()
  @Get('rejection-reasons')
  @ApiOperation({
    summary: '分析最常见的拒绝原因',
    description: '使用聚类分析最常见的行程拒绝原因',
  })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiQuery({ name: 'routeDirectionId', required: false, description: '路线方向 ID' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量限制', type: Number })
  @ApiResponse({ status: 200, description: '成功返回拒绝原因分析', type: ApiSuccessResponseDto })
  async getRejectionReasons(
    @Query('countryCode') countryCode?: string,
    @Query('routeDirectionId') routeDirectionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    return this.clusteringService.analyzeRejectionReasons({
      countryCode,
      routeDirectionId,
      startDate: start,
      endDate: end,
      limit: limitNum,
    });
  }

  /**
   * 分析最常见的替换原因
   * 
   * GET /decision-stats/replacement-reasons?countryCode=IS&limit=10
   */
  @Public()
  @Get('replacement-reasons')
  @ApiOperation({
    summary: '分析最常见的替换原因',
    description: '使用聚类分析最常见的行程替换原因',
  })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiQuery({ name: 'routeDirectionId', required: false, description: '路线方向 ID' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'limit', required: false, description: '返回数量限制', type: Number })
  @ApiResponse({ status: 200, description: '成功返回替换原因分析', type: ApiSuccessResponseDto })
  async getReplacementReasons(
    @Query('countryCode') countryCode?: string,
    @Query('routeDirectionId') routeDirectionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    return this.clusteringService.analyzeReplacementReasons({
      countryCode,
      routeDirectionId,
      startDate: start,
      endDate: end,
      limit: limitNum,
    });
  }

  /**
   * 生成决策质量报告
   * 
   * GET /decision-stats/quality-report?countryCode=IS&startDate=2024-01-01&endDate=2024-12-31
   */
  @Public()
  @Get('quality-report')
  @ApiOperation({
    summary: '生成决策质量报告',
    description: '生成综合的决策质量分析报告，包含拒绝率、替换率、现实驱动比例等指标',
  })
  @ApiQuery({ name: 'countryCode', required: false, description: '国家代码' })
  @ApiQuery({ name: 'routeDirectionId', required: false, description: '路线方向 ID' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期（YYYY-MM-DD）' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期（YYYY-MM-DD）' })
  @ApiResponse({ status: 200, description: '成功返回质量报告', type: ApiSuccessResponseDto })
  async getQualityReport(
    @Query('countryCode') countryCode?: string,
    @Query('routeDirectionId') routeDirectionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.clusteringService.generateQualityReport({
      countryCode,
      routeDirectionId,
      startDate: start,
      endDate: end,
    });
  }
}

