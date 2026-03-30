// src/trips/decision/controllers/fitness-analytics.controller.ts
/**
 * Fitness Analytics Controller（体能数据分析 API）
 * 
 * Phase 2 API 端点：
 * - 趋势分析
 * - 异常检测
 * - 体能报告
 * - A/B 测试
 * - 校准管理
 * - 可穿戴设备集成
 * 
 * @since 2026-02 Phase 2
 */

import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import { Public } from '../../../auth/decorators/public.decorator';

import { FitnessAnalyticsService } from '../services/fitness-analytics.service';
import { FitnessABTestingService } from '../services/fitness-ab-testing.service';
import { CalibrationSchedulerService } from '../services/calibration-scheduler.service';
import { WearableIntegrationService } from '../services/wearable-integration.service';

import {
  TrendAnalysisQueryDto,
  TrendAnalysisResponseDto,
  AnomalyDetectionResponseDto,
  FitnessReportQueryDto,
  FitnessReportResponseDto,
  TimelineQueryDto,
  TimelineEventDto,
  ExperimentResultsResponseDto,
  ExperimentConfigDto,
  WearableConnectionDto,
  WearableSyncRequestDto,
  WearableActivityDto,
  WearableFitnessEstimateDto,
  CalibrationResultDto,
  CalibrationStatsDto,
} from '../dto/fitness-analytics.dto';

@ApiTags('Fitness Analytics (Phase 2)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/fitness/analytics')
export class FitnessAnalyticsController {
  constructor(
    private readonly analyticsService: FitnessAnalyticsService,
    private readonly abTestingService: FitnessABTestingService,
    private readonly calibrationService: CalibrationSchedulerService,
    private readonly wearableService: WearableIntegrationService,
  ) {}

  // ==================== 趋势分析 ====================

  @Get('trend')
  @ApiOperation({ summary: '获取用户体能趋势', description: '分析当前用户体能变化趋势（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: TrendAnalysisResponseDto })
  @ApiResponse({ status: 401, description: '未认证' })
  async getTrend(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: TrendAnalysisQueryDto,
  ): Promise<TrendAnalysisResponseDto> {
    const result = await this.analyticsService.analyzeTrend(user.userId, query.periodDays);
    return {
      trend: result.trend,
      confidence: result.confidence,
      slope: result.slope,
      periodDays: result.periodDays,
      dataPoints: result.dataPoints,
      summary: result.summary,
      summaryZh: result.summaryZh,
    };
  }

  // ==================== 异常检测 ====================

  @Get('anomalies')
  @ApiOperation({ summary: '检测体能异常', description: '检测当前用户体能数据中的异常模式（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: AnomalyDetectionResponseDto })
  @ApiResponse({ status: 401, description: '未认证' })
  async detectAnomalies(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AnomalyDetectionResponseDto> {
    return this.analyticsService.detectAnomalies(user.userId);
  }

  // ==================== 体能报告 ====================

  @Get('report')
  @ApiOperation({ summary: '生成体能报告', description: '生成当前用户综合体能分析报告（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: FitnessReportResponseDto })
  @ApiResponse({ status: 401, description: '未认证' })
  async generateReport(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FitnessReportQueryDto,
  ): Promise<FitnessReportResponseDto> {
    return this.analyticsService.generateReport(user.userId, query.periodDays);
  }

  // ==================== 时间线 ====================

  @Get('timeline')
  @ApiOperation({ summary: '获取体能时间线', description: '获取当前用户体能事件时间线（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: [TimelineEventDto] })
  @ApiResponse({ status: 401, description: '未认证' })
  async getTimeline(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: TimelineQueryDto,
  ): Promise<TimelineEventDto[]> {
    return this.analyticsService.getFitnessTimeline(user.userId, query.limit);
  }

  // ==================== A/B 测试（管理接口，需认证） ====================

  @Get('experiments')
  @ApiOperation({ summary: '获取所有实验', description: '获取所有 A/B 测试实验配置' })
  @ApiResponse({ status: 200, type: [ExperimentConfigDto] })
  @ApiResponse({ status: 401, description: '未认证' })
  getAllExperiments(): ExperimentConfigDto[] {
    return this.abTestingService.getAllExperiments().map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      status: e.status,
      trafficPercent: e.trafficPercent,
      startDate: e.startDate,
    }));
  }

  @Get('experiments/:experimentId/results')
  @ApiOperation({ summary: '获取实验结果', description: '获取指定实验的统计结果' })
  @ApiParam({ name: 'experimentId', description: '实验ID' })
  @ApiResponse({ status: 200, type: ExperimentResultsResponseDto })
  @ApiResponse({ status: 401, description: '未认证' })
  async getExperimentResults(
    @Param('experimentId') experimentId: string,
  ): Promise<ExperimentResultsResponseDto> {
    return this.abTestingService.getExperimentResults(experimentId);
  }

  @Post('experiments/:experimentId/status')
  @ApiOperation({ summary: '更新实验状态', description: '更新实验运行状态' })
  @ApiParam({ name: 'experimentId', description: '实验ID' })
  @ApiQuery({ name: 'status', enum: ['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'] })
  @ApiResponse({ status: 401, description: '未认证' })
  updateExperimentStatus(
    @Param('experimentId') experimentId: string,
    @Query('status') status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED',
  ): { success: boolean } {
    this.abTestingService.updateExperimentStatus(experimentId, status);
    return { success: true };
  }

  // ==================== 校准管理 ====================

  @Get('calibration/stats')
  @ApiOperation({ summary: '获取校准统计', description: '获取校准任务运行统计' })
  @ApiResponse({ status: 200, type: CalibrationStatsDto })
  @ApiResponse({ status: 401, description: '未认证' })
  getCalibrationStats(): CalibrationStatsDto | { message: string } {
    const stats = this.calibrationService.getCalibrationStats();
    return stats || { message: '暂无校准统计数据' };
  }

  @Post('calibration/run')
  @ApiOperation({ summary: '手动运行校准', description: '手动触发校准周期（管理员功能）' })
  @ApiResponse({ status: 200, type: [CalibrationResultDto] })
  @ApiResponse({ status: 401, description: '未认证' })
  async runCalibrationCycle(): Promise<CalibrationResultDto[]> {
    return this.calibrationService.runCalibrationCycle();
  }

  @Post('calibration/me')
  @ApiOperation({ summary: '校准当前用户', description: '手动校准当前用户的体能模型（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: CalibrationResultDto })
  @ApiResponse({ status: 401, description: '未认证' })
  async calibrateCurrentUser(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<CalibrationResultDto | { message: string }> {
    const result = await this.calibrationService.triggerManualCalibration(user.userId);
    return result || { message: '无需校准或校准失败' };
  }

  // ==================== 可穿戴设备集成 ====================

  @Get('wearable/connections')
  @ApiOperation({ summary: '获取设备连接状态', description: '获取当前用户连接的可穿戴设备列表（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: [WearableConnectionDto] })
  @ApiResponse({ status: 401, description: '未认证' })
  async getWearableConnections(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<WearableConnectionDto[]> {
    return this.wearableService.getUserConnections(user.userId);
  }

  @Get('wearable/strava/auth')
  @ApiOperation({ summary: '获取 Strava 授权链接', description: '生成 Strava OAuth 授权 URL（userId从JWT获取）' })
  @ApiResponse({ status: 401, description: '未认证' })
  getStravaAuthUrl(
    @CurrentUser() user: CurrentUserPayload,
  ): { authUrl: string } {
    return { authUrl: this.wearableService.getStravaAuthUrl(user.userId) };
  }

  @Public()
  @Get('wearable/strava/callback')
  @ApiOperation({ summary: 'Strava OAuth 回调', description: '处理 Strava OAuth 回调（公开接口，由Strava调用）' })
  async handleStravaCallback(
    @Query('code') code: string,
    @Query('state') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.wearableService.handleStravaCallback(code, userId);
      res.redirect('/settings/wearables?connected=strava');
    } catch (error: any) {
      res.redirect(`/settings/wearables?error=${encodeURIComponent(error.message)}`);
    }
  }

  @Post('wearable/strava/sync')
  @ApiOperation({ summary: '同步 Strava 数据', description: '从 Strava 同步当前用户的活动数据（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: [WearableActivityDto] })
  @ApiResponse({ status: 401, description: '未认证' })
  async syncStravaActivities(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: WearableSyncRequestDto,
  ): Promise<WearableActivityDto[]> {
    const activities = await this.wearableService.syncStravaActivities(user.userId, body);
    return activities.map(a => ({
      id: a.id,
      provider: a.provider,
      name: a.name,
      type: a.type,
      startDate: a.startDate,
      distanceM: a.distanceM,
      elevationGainM: a.elevationGainM,
      movingTimeSeconds: a.movingTimeSeconds,
      avgHeartRate: a.avgHeartRate,
    }));
  }

  @Get('wearable/estimate')
  @ApiOperation({ summary: '基于可穿戴数据评估体能', description: '使用可穿戴设备数据评估当前用户体能（userId从JWT获取）' })
  @ApiResponse({ status: 200, type: WearableFitnessEstimateDto })
  @ApiResponse({ status: 401, description: '未认证' })
  async estimateFitnessFromWearables(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<WearableFitnessEstimateDto | { message: string }> {
    const estimate = await this.wearableService.estimateFitnessFromWearables(user.userId);
    return estimate || { message: '活动数据不足，无法评估体能' };
  }
}
