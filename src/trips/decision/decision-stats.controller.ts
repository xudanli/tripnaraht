// src/trips/decision/decision-stats.controller.ts
/**
 * Decision Stats Controller（决策统计控制器）
 * 
 * 提供决策统计 API 端点，供前端/Dashboard 使用
 */

import { Controller, Get, Query, Param } from '@nestjs/common';
import { DecisionStatsService } from './services/decision-stats.service';
import { HeuristicDietService } from './services/heuristic-diet.service';

@Controller('decision-stats')
export class DecisionStatsController {
  constructor(
    private readonly decisionStats: DecisionStatsService,
    private readonly heuristicDiet: HeuristicDietService,
  ) {}

  /**
   * 按国家统计决策分布
   * 
   * GET /decision-stats/by-country?countryCode=IS&startDate=2024-01-01&endDate=2024-12-31
   */
  @Get('by-country')
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
  @Get('by-route')
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
  @Get('by-persona')
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
  @Get('reality-driven-ratio')
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
  @Get('heuristic-hotspots')
  async getHeuristicHotspots(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.decisionStats.getHeuristicHotspots(limitNum);
  }

  /**
   * 生成 HEURISTIC 减肥计划
   * 
   * GET /decision-stats/heuristic-diet-plan
   */
  @Get('heuristic-diet-plan')
  async getHeuristicDietPlan() {
    return this.heuristicDiet.generateDietPlan();
  }
}

