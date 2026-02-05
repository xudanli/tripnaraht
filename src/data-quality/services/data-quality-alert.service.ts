// src/data-quality/services/data-quality-alert.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 创建告警DTO
 */
export interface CreateAlertDto {
  monitorId?: string;
  geographicMonitorId?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  alertType: string;
  message: string;
  details?: any;
}

/**
 * 数据质量告警服务
 * 
 * 功能：
 * - 创建告警记录
 * - 发送告警通知（邮件、钉钉、企业微信）
 * - 处理告警（标记已处理）
 */
@Injectable()
export class DataQualityAlertService {
  private readonly logger = new Logger(DataQualityAlertService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建告警
   */
  async createAlert(dto: CreateAlertDto): Promise<void> {
    try {
      // 检查是否已有相同类型的未处理告警（避免重复告警）
      const existingAlert = await this.prisma.dataQualityAlert.findFirst({
        where: {
          monitorId: dto.monitorId || undefined,
          geographicMonitorId: dto.geographicMonitorId || undefined,
          alertType: dto.alertType,
          status: 'PENDING',
          createdAt: {
            gte: new Date(Date.now() - 60 * 60 * 1000), // 1小时内
          },
        },
      });

      if (existingAlert) {
        this.logger.debug(`告警已存在，跳过创建: ${dto.alertType}`);
        return;
      }

      // 创建告警记录
      const alert = await this.prisma.dataQualityAlert.create({
        data: {
          monitorId: dto.monitorId,
          geographicMonitorId: dto.geographicMonitorId,
          severity: dto.severity,
          alertType: dto.alertType,
          message: dto.message,
          details: dto.details || {},
          status: 'PENDING',
        },
      });

      this.logger.warn(`创建告警: ${dto.alertType} - ${dto.message}`);

      // 发送通知（异步，不阻塞）
      this.sendNotification(alert.id, dto).catch(error => {
        this.logger.error(`发送告警通知失败: ${error.message}`, error.stack);
      });
    } catch (error: any) {
      this.logger.error(`创建告警失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 发送告警通知
   */
  private async sendNotification(
    alertId: string,
    dto: CreateAlertDto
  ): Promise<void> {
    // TODO: 实现通知发送逻辑
    // 1. 邮件通知（SMTP）
    // 2. 钉钉通知（Webhook）
    // 3. 企业微信通知（Webhook）

    this.logger.log(`发送告警通知: ${dto.alertType} - ${dto.message}`);

    // 简化版：只记录日志
    // 实际应该调用通知服务
  }

  /**
   * 处理告警（标记已处理）
   */
  async acknowledgeAlert(
    alertId: string,
    acknowledgedBy: string
  ): Promise<void> {
    await this.prisma.dataQualityAlert.update({
      where: { id: alertId },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedBy,
        acknowledgedAt: new Date(),
      },
    });

    this.logger.log(`告警已处理: ${alertId} by ${acknowledgedBy}`);
  }

  /**
   * 解决告警（标记已解决）
   */
  async resolveAlert(alertId: string): Promise<void> {
    await this.prisma.dataQualityAlert.update({
      where: { id: alertId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    this.logger.log(`告警已解决: ${alertId}`);
  }

  /**
   * 获取未处理的告警列表
   */
  async getPendingAlerts(limit: number = 100) {
    return this.prisma.dataQualityAlert.findMany({
      where: {
        status: 'PENDING',
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      include: {
        monitor: true,
        geographicMonitor: true,
      },
    });
  }

  /**
   * 检查数据过期（扩展功能）
   */
  async checkDataExpiry(): Promise<void> {
    const { EXPIRY_RULES, isDataExpired } = await import('../config/data-expiry-rules.config');

    // 1. 检查标准数据源过期
    const monitors = await this.prisma.dataQualityMonitor.findMany({
      select: {
        id: true,
        dataSource: true,
        dataType: true,
        countryCode: true,
        lastUpdated: true,
      },
    });

    for (const monitor of monitors) {
      const rule = EXPIRY_RULES[monitor.dataType as keyof typeof EXPIRY_RULES];
      if (rule && typeof rule === 'object' && 'expiryDays' in rule) {
        const expiryDays = (rule as any).expiryDays;
        if (expiryDays && isDataExpired(monitor.lastUpdated, expiryDays)) {
          await this.createAlert({
            monitorId: monitor.id,
            severity: 'HIGH',
            alertType: 'DATA_EXPIRED',
            message: `数据已过期: ${monitor.dataSource} (${monitor.dataType})，超过 ${expiryDays} 天未更新`,
            details: {
              dataSource: monitor.dataSource,
              dataType: monitor.dataType,
              lastUpdated: monitor.lastUpdated,
              expiryDays,
            },
          });
        }
      }
    }

    // 2. 检查地理数据源过期
    const geographicMonitors = await this.prisma.geographicDataQualityMonitor.findMany({
      select: {
        id: true,
        dataSource: true,
        dataType: true,
        countryCode: true,
        lastUpdated: true,
        coverageRate: true,
      },
    });

    for (const monitor of geographicMonitors) {
      const featuresRule = EXPIRY_RULES.GEOGRAPHIC_FEATURES as Record<string, any>;
      const rule = featuresRule[monitor.dataType];

      if (rule && rule.expiryDays) {
        if (isDataExpired(monitor.lastUpdated, rule.expiryDays)) {
          await this.createAlert({
            geographicMonitorId: monitor.id,
            severity: 'MEDIUM',
            alertType: 'GEOGRAPHIC_DATA_EXPIRED',
            message: `地理数据已过期: ${monitor.dataSource} (${monitor.dataType})，超过 ${rule.expiryDays} 天未更新`,
            details: {
              dataSource: monitor.dataSource,
              dataType: monitor.dataType,
              lastUpdated: monitor.lastUpdated,
              expiryDays: rule.expiryDays,
            },
          });
        }
      } else if (monitor.dataType === 'DEM') {
        // DEM数据：检查完整性而不是过期时间
        const demRule = EXPIRY_RULES.DEM as any;
        if (demRule.checkIntegrity && monitor.coverageRate !== null && monitor.coverageRate < 0.8) {
          await this.createAlert({
            geographicMonitorId: monitor.id,
            severity: 'CRITICAL',
            alertType: 'DEM_DATA_INTEGRITY_LOW',
            message: `DEM数据完整性不足: ${monitor.dataSource}，覆盖率: ${(monitor.coverageRate * 100).toFixed(1)}%`,
            details: {
              dataSource: monitor.dataSource,
              dataType: monitor.dataType,
              coverageRate: monitor.coverageRate,
            },
          });
        }
      }
    }
  }
}
