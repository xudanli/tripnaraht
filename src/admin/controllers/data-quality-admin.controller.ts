// src/admin/controllers/data-quality-admin.controller.ts

import { Controller, Post, Body, Get, Param, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiResponse } from '@nestjs/swagger';
import { GeographicDataValidatorService, ValidationResult } from '../../data-quality/services/geographic-data-validator.service';
import { GeographicDataAssessmentService } from '../../data-quality/services/geographic-data-assessment.service';
import { DataQualityMonitoringService } from '../../data-quality/services/data-quality-monitoring.service';
import { GeographicDataQualityMonitoringService } from '../../data-quality/services/geographic-data-quality-monitoring.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../auth/decorators/public.decorator';

/**
 * 上传物理现实数据DTO
 */
export class UploadPhysicalRealityDataDto {
  countryCode: string;
  dataType: 'road-status' | 'ferry-schedules' | 'weather-windows';
  data: any; // JSON数据
}

/**
 * 数据质量管理控制器
 * 
 * 提供数据质量相关的管理接口：
 * - 上传物理现实数据（带地理数据验证）
 * - 验证地理数据
 * - 获取验证结果
 */
@ApiTags('Admin - Data Quality')
@Controller('admin/data-quality')
@Public() // 临时开放测试，生产环境应移除并添加认证
export class DataQualityAdminController {
  private readonly logger = new Logger(DataQualityAdminController.name);

  constructor(
    private readonly geographicDataValidator: GeographicDataValidatorService,
    private readonly geographicDataAssessment: GeographicDataAssessmentService,
    private readonly dataQualityMonitoring: DataQualityMonitoringService,
    private readonly geographicDataQualityMonitoring: GeographicDataQualityMonitoringService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 上传物理现实数据（带地理数据验证）
   */
  @Post('physical-reality/upload')
  @ApiOperation({ summary: '上传物理现实数据（道路状态、渡轮时刻表、天气窗口）' })
  @ApiBody({ type: UploadPhysicalRealityDataDto })
  @ApiResponse({ status: 200, description: '上传成功' })
  @ApiResponse({ status: 400, description: '验证失败' })
  async uploadPhysicalRealityData(
    @Body() dto: UploadPhysicalRealityDataDto,
  ) {
    this.logger.log(`上传物理现实数据: ${dto.countryCode} - ${dto.dataType}`);

    // 1. 从数据中提取坐标
    const coordinates = this.geographicDataValidator.extractCoordinatesFromPhysicalRealityData(dto.data);

    if (coordinates.length === 0) {
      throw new BadRequestException('数据中未找到坐标信息');
    }

    // 2. 验证坐标格式
    const coordValidation = this.geographicDataValidator.validateCoordinatesBatch(coordinates);
    if (!coordValidation.valid) {
      this.logger.warn(`坐标验证失败: ${JSON.stringify(coordValidation.errors)}`);
      return {
        success: false,
        validationResult: {
          valid: false,
          errors: coordValidation.errors,
          warnings: coordValidation.warnings,
        },
        message: '坐标格式验证失败',
      };
    }

    // 3. 验证空间范围
    const spatialRangeValidation = this.geographicDataValidator.validateSpatialRange(
      coordinates,
      dto.countryCode
    );

    // 4. 验证坐标系统一致性
    const coordSystemValidation = this.geographicDataValidator.validateCoordinateSystemConsistency(
      coordinates
    );

    // 5. 合并验证结果
    const allErrors = [
      ...coordValidation.errors,
      ...spatialRangeValidation.errors,
      ...coordSystemValidation.errors,
    ];

    const allWarnings = [
      ...coordValidation.warnings,
      ...spatialRangeValidation.warnings,
      ...coordSystemValidation.warnings,
    ];

    if (allErrors.length > 0) {
      this.logger.warn(`地理数据验证失败: ${JSON.stringify(allErrors)}`);
      return {
        success: false,
        validationResult: {
          valid: false,
          errors: allErrors,
          warnings: allWarnings,
        },
        message: '地理数据验证失败',
      };
    }

    // 6. 如果验证通过，返回成功（实际应该继续索引数据）
    this.logger.log(`地理数据验证通过: ${coordinates.length} 个坐标`);

    return {
      success: true,
      validationResult: {
        valid: true,
        errors: [],
        warnings: allWarnings,
      },
      message: '地理数据验证通过',
      coordinatesCount: coordinates.length,
      // TODO: 继续索引数据到PostGIS
    };
  }

  /**
   * 验证地理数据坐标
   */
  @Post('validate/coordinates')
  @ApiOperation({ summary: '验证地理数据坐标' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        coordinates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
          },
        },
        countryCode: { type: 'string' },
      },
    },
  })
  async validateCoordinates(
    @Body() body: { coordinates: Array<{ lat: number; lng: number }>; countryCode?: string },
  ) {
    const { coordinates, countryCode } = body;

    if (!coordinates || !Array.isArray(coordinates)) {
      throw new BadRequestException('coordinates必须是数组');
    }

    // 1. 验证坐标格式
    const coordValidation = this.geographicDataValidator.validateCoordinatesBatch(coordinates);

    // 2. 如果提供了国家代码，验证空间范围
    let spatialRangeValidation: ValidationResult | null = null;
    if (countryCode) {
      spatialRangeValidation = this.geographicDataValidator.validateSpatialRange(
        coordinates,
        countryCode
      );
    }

    // 3. 验证坐标系统一致性
    const coordSystemValidation = this.geographicDataValidator.validateCoordinateSystemConsistency(
      coordinates
    );

    // 4. 合并结果
    const allErrors = [
      ...coordValidation.errors,
      ...(spatialRangeValidation?.errors || []),
      ...coordSystemValidation.errors,
    ];

    const allWarnings = [
      ...coordValidation.warnings,
      ...(spatialRangeValidation?.warnings || []),
      ...coordSystemValidation.warnings,
    ];

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      coordinatesCount: coordinates.length,
    };
  }

  /**
   * 获取数据质量监控仪表板
   */
  @Get('dashboard')
  @ApiOperation({ summary: '获取数据质量监控仪表板' })
  @ApiResponse({ status: 200, description: '监控仪表板数据' })
  async getDashboard() {
    // 1. 获取所有监控记录
    const monitors = await this.prisma.dataQualityMonitor.findMany({
      orderBy: {
        overallScore: 'asc',
      },
      take: 100,
    });

    // 2. 获取未处理告警
    const pendingAlerts = await this.prisma.dataQualityAlert.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        monitor: true,
      },
    });

    // 3. 计算统计信息
    const totalMonitors = monitors.length;
    const healthyCount = monitors.filter(m => m.status === 'HEALTHY').length;
    const warningCount = monitors.filter(m => m.status === 'WARNING').length;
    const criticalCount = monitors.filter(m => m.status === 'CRITICAL').length;
    const avgOverallScore =
      monitors.length > 0
        ? monitors.reduce((sum, m) => sum + m.overallScore, 0) / monitors.length
        : 1.0;

    return {
      summary: {
        totalMonitors,
        healthyCount,
        warningCount,
        criticalCount,
        avgOverallScore,
        pendingAlertsCount: pendingAlerts.length,
      },
      monitors: monitors.map(m => ({
        id: m.id,
        dataSource: m.dataSource,
        dataType: m.dataType,
        countryCode: m.countryCode,
        overallScore: m.overallScore,
        status: m.status,
        lastUpdated: m.lastUpdated,
        lastVerified: m.lastVerified,
      })),
      alerts: pendingAlerts.map(a => ({
        id: a.id,
        severity: a.severity,
        alertType: a.alertType,
        message: a.message,
        createdAt: a.createdAt,
        monitor: a.monitor ? {
          dataSource: a.monitor.dataSource,
          dataType: a.monitor.dataType,
        } : null,
      })),
    };
  }

  /**
   * 获取地理数据质量监控仪表板
   */
  @Get('geographic/dashboard')
  @ApiOperation({ summary: '获取地理数据质量监控仪表板' })
  @ApiResponse({ status: 200, description: '地理数据监控仪表板数据' })
  async getGeographicDashboard() {
    // 1. 获取所有地理数据监控记录
    const monitors = await this.prisma.geographicDataQualityMonitor.findMany({
      orderBy: {
        overallScore: 'asc',
      },
      take: 100,
    });

    // 2. 获取未处理告警
    const pendingAlerts = await this.prisma.dataQualityAlert.findMany({
      where: {
        status: 'PENDING',
        geographicMonitorId: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
      include: {
        geographicMonitor: true,
      },
    });

    // 3. 计算统计信息
    const totalMonitors = monitors.length;
    const healthyCount = monitors.filter(m => m.status === 'HEALTHY').length;
    const warningCount = monitors.filter(m => m.status === 'WARNING').length;
    const criticalCount = monitors.filter(m => m.status === 'CRITICAL').length;
    const avgOverallScore =
      monitors.length > 0
        ? monitors.reduce((sum, m) => sum + m.overallScore, 0) / monitors.length
        : 1.0;

    // 4. 计算平均查询性能
    const monitorsWithLatency = monitors.filter(m => m.queryLatencyP95 !== null);
    const avgQueryLatencyP95 =
      monitorsWithLatency.length > 0
        ? monitorsWithLatency.reduce((sum, m) => sum + (m.queryLatencyP95 || 0), 0) /
          monitorsWithLatency.length
        : 0;

    return {
      summary: {
        totalMonitors,
        healthyCount,
        warningCount,
        criticalCount,
        avgOverallScore,
        avgQueryLatencyP95,
        pendingAlertsCount: pendingAlerts.length,
      },
      monitors: monitors.map(m => ({
        id: m.id,
        dataSource: m.dataSource,
        dataType: m.dataType,
        countryCode: m.countryCode,
        overallScore: m.overallScore,
        coverageRate: m.coverageRate,
        spatialAccuracy: m.spatialAccuracy,
        spatialCompleteness: m.spatialCompleteness,
        queryLatencyP95: m.queryLatencyP95,
        querySuccessRate: m.querySuccessRate,
        status: m.status,
        lastUpdated: m.lastUpdated,
        lastVerified: m.lastVerified,
      })),
      alerts: pendingAlerts.map(a => ({
        id: a.id,
        severity: a.severity,
        alertType: a.alertType,
        message: a.message,
        createdAt: a.createdAt,
        geographicMonitor: a.geographicMonitor
          ? {
              dataSource: a.geographicMonitor.dataSource,
              dataType: a.geographicMonitor.dataType,
            }
          : null,
      })),
    };
  }

  /**
   * 评估指定国家的地理数据质量
   */
  @Get('geographic/assess/:countryCode')
  @ApiOperation({ summary: '评估指定国家的地理数据质量' })
  @ApiParam({ name: 'countryCode', description: '国家代码（ISO 3166-1 alpha-2）' })
  @ApiResponse({ status: 200, description: '地理数据评估结果' })
  async assessGeographicData(@Param('countryCode') countryCode: string) {
    const assessment = await this.geographicDataAssessment.assessCountryGeographicData(
      countryCode.toUpperCase()
    );

    return {
      countryCode: assessment.countryCode,
      demAssessment: {
        coverageRate: assessment.demAssessment.coverageRate,
        resolution: assessment.demAssessment.resolution,
        querySuccessRate: assessment.demAssessment.querySuccessRate,
        queryLatency: assessment.demAssessment.queryLatency,
        missingRegions: assessment.demAssessment.missingRegions,
      },
      geographicFeaturesAssessment: {
        rivers: {
          coverageRate: assessment.geographicFeaturesAssessment.rivers.coverageRate,
          featureCount: assessment.geographicFeaturesAssessment.rivers.featureCount,
          missingRegions: assessment.geographicFeaturesAssessment.rivers.missingRegions,
        },
        mountains: {
          coverageRate: assessment.geographicFeaturesAssessment.mountains.coverageRate,
          featureCount: assessment.geographicFeaturesAssessment.mountains.featureCount,
          missingRegions: assessment.geographicFeaturesAssessment.mountains.missingRegions,
        },
        roads: {
          coverageRate: assessment.geographicFeaturesAssessment.roads.coverageRate,
          featureCount: assessment.geographicFeaturesAssessment.roads.featureCount,
          missingRegions: assessment.geographicFeaturesAssessment.roads.missingRegions,
        },
        coastlines: {
          coverageRate: assessment.geographicFeaturesAssessment.coastlines.coverageRate,
          featureCount: assessment.geographicFeaturesAssessment.coastlines.featureCount,
          missingRegions: assessment.geographicFeaturesAssessment.coastlines.missingRegions,
        },
        ports: {
          coverageRate: assessment.geographicFeaturesAssessment.ports.coverageRate,
          featureCount: assessment.geographicFeaturesAssessment.ports.featureCount,
          missingRegions: assessment.geographicFeaturesAssessment.ports.missingRegions,
        },
        railways: {
          coverageRate: assessment.geographicFeaturesAssessment.railways.coverageRate,
          featureCount: assessment.geographicFeaturesAssessment.railways.featureCount,
          missingRegions: assessment.geographicFeaturesAssessment.railways.missingRegions,
        },
      },
      recommendations: assessment.recommendations,
    };
  }
}
