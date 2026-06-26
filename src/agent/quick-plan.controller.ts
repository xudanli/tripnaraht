/**
 * 快速规划控制器
 * 提供单次澄清 + 预览行程的接口
 */

import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { QuickPlanService, QuickPlanRequest, QuickPlanResponse, ConfirmPlanRequest, ConfirmPlanResponse } from './services/quick-plan.service';

@Controller('agent/quick-plan')
export class QuickPlanController {
  constructor(private readonly quickPlanService: QuickPlanService) {}

  /**
   * 快速规划：单次澄清 + 预览行程
   * POST /agent/quick-plan
   */
  @Post()
  async quickPlan(@Body() request: QuickPlanRequest): Promise<QuickPlanResponse> {
    return this.quickPlanService.quickPlan(request);
  }

  /**
   * 确认并生成最终行程
   * POST /agent/quick-plan/confirm
   */
  @Post('confirm')
  async confirmPlan(@Body() request: ConfirmPlanRequest): Promise<ConfirmPlanResponse> {
    return this.quickPlanService.confirmPlan(request);
  }

  /**
   * 获取LLM性能指标（监控用）
   * GET /agent/quick-plan/metrics
   */
  @Get('metrics')
  async getMetrics() {
    // 这里可以集成LLMTraceService的指标
    return {
      message: 'Metrics endpoint - integrate with LLMTraceService',
    };
  }
}
