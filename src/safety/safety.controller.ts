// src/safety/safety.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { GeopoliticalRiskService } from './services/geopolitical-risk.service';
import { SafetyNotificationService } from './services/safety-notification.service';
import {
  GeopoliticalRiskLevel,
  RiskType,
  SafetyAssessmentRequestDto,
  CountrySafetyAssessmentDto,
  SafetyAlertDto,
  TripSafetyImpactDto,
  SafetyNotificationPreferencesDto,
} from './dto/geopolitical-risk.dto';

/**
 * 安全预警控制器
 * 
 * 提供地缘政治风险评估、安全警报管理、行程安全影响评估等API
 */
@ApiTags('Safety')
@Controller('safety')
export class SafetyController {
  constructor(
    private readonly riskService: GeopoliticalRiskService,
    private readonly notificationService: SafetyNotificationService,
  ) {}

  // ==================== 风险评估 API ====================

  @Get('assessment/:countryCode')
  @ApiOperation({
    summary: '获取国家安全评估',
    description: '获取指定国家的综合安全评估，包括风险等级、活跃警告和警报',
  })
  @ApiParam({ name: 'countryCode', description: 'ISO 3166-1 alpha-2 国家代码', example: 'IR' })
  @ApiResponse({
    status: 200,
    description: '国家安全评估',
    type: CountrySafetyAssessmentDto,
  })
  async getCountryAssessment(
    @Param('countryCode') countryCode: string,
  ): Promise<CountrySafetyAssessmentDto> {
    return this.riskService.getCountrySafetyAssessment(countryCode);
  }

  @Post('assessment/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '批量获取多国安全评估',
    description: '批量获取多个国家的安全评估，可选择是否包含邻国风险',
  })
  @ApiBody({ type: SafetyAssessmentRequestDto })
  @ApiResponse({
    status: 200,
    description: '多国安全评估列表',
    type: [CountrySafetyAssessmentDto],
  })
  async getBatchAssessment(
    @Body() request: SafetyAssessmentRequestDto,
  ): Promise<CountrySafetyAssessmentDto[]> {
    return this.riskService.getMultipleCountryAssessments(
      request.countryCodes,
      request.includeAdjacentCountries,
    );
  }

  @Get('risk-level/:countryCode')
  @ApiOperation({
    summary: '获取国家风险等级',
    description: '快速获取指定国家的风险等级（1-5）',
  })
  @ApiParam({ name: 'countryCode', description: '国家代码', example: 'UA' })
  @ApiResponse({
    status: 200,
    description: '风险等级信息',
    schema: {
      type: 'object',
      properties: {
        countryCode: { type: 'string' },
        riskLevel: { type: 'number', enum: [1, 2, 3, 4, 5] },
        riskLevelText: { type: 'string' },
        assessedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  async getRiskLevel(
    @Param('countryCode') countryCode: string,
  ): Promise<{
    countryCode: string;
    riskLevel: GeopoliticalRiskLevel;
    riskLevelText: string;
    assessedAt: Date;
  }> {
    const assessment = await this.riskService.getCountrySafetyAssessment(countryCode);
    
    return {
      countryCode: assessment.countryCode,
      riskLevel: assessment.overallRiskLevel,
      riskLevelText: this.getRiskLevelText(assessment.overallRiskLevel),
      assessedAt: assessment.assessedAt,
    };
  }

  // ==================== 警报管理 API ====================

  @Get('alerts')
  @ApiOperation({
    summary: '获取所有活跃警报',
    description: '获取当前所有活跃的安全警报，按风险等级排序',
  })
  @ApiQuery({ name: 'minLevel', required: false, description: '最低风险等级筛选', enum: GeopoliticalRiskLevel })
  @ApiResponse({
    status: 200,
    description: '活跃警报列表',
    type: [SafetyAlertDto],
  })
  getActiveAlerts(
    @Query('minLevel') minLevel?: string,
  ): SafetyAlertDto[] {
    let alerts = this.riskService.getActiveAlerts();
    
    if (minLevel) {
      const minLevelNum = parseInt(minLevel, 10);
      alerts = alerts.filter(a => a.riskLevel >= minLevelNum);
    }
    
    return alerts;
  }

  @Get('alerts/country/:countryCode')
  @ApiOperation({
    summary: '获取指定国家的警报',
    description: '获取影响指定国家的所有活跃警报',
  })
  @ApiParam({ name: 'countryCode', description: '国家代码' })
  @ApiResponse({
    status: 200,
    description: '该国家相关的警报列表',
    type: [SafetyAlertDto],
  })
  getCountryAlerts(
    @Param('countryCode') countryCode: string,
  ): SafetyAlertDto[] {
    return this.riskService.getActiveAlertsForCountry(countryCode);
  }

  @Post('alerts/create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '创建安全警报',
    description: '手动创建新的安全警报（管理员功能）',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'title', 'summary', 'description', 'affectedCountries'],
      properties: {
        type: { type: 'string', enum: Object.values(RiskType) },
        title: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        affectedCountries: { type: 'array', items: { type: 'string' } },
        urgency: { type: 'string' },
        severity: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: '创建的警报',
    type: SafetyAlertDto,
  })
  createAlert(
    @Body() body: {
      type: RiskType;
      title: string;
      summary: string;
      description: string;
      affectedCountries: string[];
      urgency?: string;
      severity?: string;
    },
  ): SafetyAlertDto {
    return this.riskService.createAlert(body as any);
  }

  @Post('alerts/:alertId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '关闭警报',
    description: '将指定警报标记为不活跃（管理员功能）',
  })
  @ApiParam({ name: 'alertId', description: '警报ID' })
  @ApiResponse({
    status: 200,
    description: '操作结果',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  deactivateAlert(
    @Param('alertId') alertId: string,
  ): { success: boolean; message: string } {
    const result = this.riskService.deactivateAlert(alertId);
    return {
      success: result,
      message: result ? '警报已关闭' : '警报不存在或已关闭',
    };
  }

  // ==================== 行程安全评估 API ====================

  @Post('trip-impact')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '评估行程安全影响',
    description: '评估指定行程是否受到安全事件影响，并提供建议',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['tripId', 'destinations'],
      properties: {
        tripId: { type: 'string', description: '行程ID' },
        destinations: {
          type: 'array',
          items: { type: 'string' },
          description: '目的地国家代码列表',
        },
        travelDate: {
          type: 'string',
          format: 'date-time',
          description: '计划出行日期',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '行程安全影响评估',
    type: TripSafetyImpactDto,
  })
  async assessTripImpact(
    @Body() body: {
      tripId: string;
      destinations: string[];
      travelDate?: string;
    },
  ): Promise<TripSafetyImpactDto> {
    return this.riskService.assessTripSafetyImpact(
      body.tripId,
      body.destinations,
      body.travelDate ? new Date(body.travelDate) : undefined,
    );
  }

  // ==================== 模拟/测试 API ====================

  @Post('simulate/war')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '模拟战争场景',
    description: '用于测试预警系统的战争场景模拟（仅限开发/测试环境）',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['conflictParties', 'conflictZone', 'escalationLevel'],
      properties: {
        conflictParties: {
          type: 'array',
          items: { type: 'string' },
          description: '冲突各方国家代码',
          example: ['US', 'IL', 'IR'],
        },
        conflictZone: {
          type: 'string',
          description: '冲突区域',
          example: 'MIDDLE_EAST',
        },
        escalationLevel: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
          description: '冲突升级程度',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: '生成的模拟警报',
    type: SafetyAlertDto,
  })
  simulateWar(
    @Body() body: {
      conflictParties: string[];
      conflictZone: string;
      escalationLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    },
  ): SafetyAlertDto {
    return this.riskService.simulateWarScenario(body);
  }

  // ==================== 通知偏好 API ====================

  @Post('notification-preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '设置通知偏好',
    description: '设置用户的安全通知偏好',
  })
  @ApiBody({ type: SafetyNotificationPreferencesDto })
  @ApiResponse({
    status: 200,
    description: '设置成功',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  setNotificationPreferences(
    @Body() preferences: SafetyNotificationPreferencesDto,
  ): { success: boolean; message: string } {
    this.notificationService.setUserPreferences(preferences);
    return {
      success: true,
      message: '通知偏好已更新',
    };
  }

  @Get('notification-preferences/:userId')
  @ApiOperation({
    summary: '获取通知偏好',
    description: '获取用户的安全通知偏好设置',
  })
  @ApiParam({ name: 'userId', description: '用户ID' })
  @ApiResponse({
    status: 200,
    description: '用户通知偏好',
    type: SafetyNotificationPreferencesDto,
  })
  getNotificationPreferences(
    @Param('userId') userId: string,
  ): SafetyNotificationPreferencesDto | { message: string } {
    const preferences = this.notificationService.getUserPreferences(userId);
    if (!preferences) {
      return { message: '未找到该用户的通知偏好设置' };
    }
    return preferences;
  }

  // ==================== 辅助方法 ====================

  private getRiskLevelText(level: GeopoliticalRiskLevel): string {
    switch (level) {
      case GeopoliticalRiskLevel.SAFE:
        return 'Level 1 - 安全 (Exercise Normal Precautions)';
      case GeopoliticalRiskLevel.CAUTION:
        return 'Level 2 - 注意 (Exercise Increased Caution)';
      case GeopoliticalRiskLevel.HIGH_RISK:
        return 'Level 3 - 高风险 (Reconsider Travel)';
      case GeopoliticalRiskLevel.DANGEROUS:
        return 'Level 4 - 危险 (Do Not Travel)';
      case GeopoliticalRiskLevel.NO_GO:
        return 'Level 5 - 禁止 (Immediate Evacuation Recommended)';
      default:
        return 'Unknown';
    }
  }
}
