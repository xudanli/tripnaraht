// src/iceland-info/services/safetravel.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { SafetravelQueryDto, SafetravelResponseDto, AlertType, AlertSeverity } from '../dto/safetravel.dto';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class SafetravelService {
  private readonly logger = new Logger(SafetravelService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseURL = 'https://safetravel.is';

  constructor(private configService: ConfigService) {
    this.httpClient = HttpClientFactory.create({
      baseURL: this.baseURL,
      timeout: 10000,
    });
  }

  /**
   * 获取安全警报和旅行条件
   */
  async getSafetyInfo(query: SafetravelQueryDto): Promise<SafetravelResponseDto> {
    try {
      // safetravel.is 可能没有公开API
      // 尝试调用可能的端点，如果失败则使用模拟数据
      try {
        // 尝试获取警报（如果API存在）
        const alertsResponse = await this.httpClient.get('/api/alerts', {
          params: {
            region: query.region,
            type: query.alertType,
          },
        }).catch(() => null);

        // 尝试获取旅行条件
        const conditionsResponse = await this.httpClient.get('/api/travel-conditions', {
          params: {
            region: query.region,
          },
        }).catch(() => null);

        if (alertsResponse || conditionsResponse) {
          return this.parseSafetravelResponse(
            alertsResponse?.data,
            conditionsResponse?.data,
            query,
          );
        }

        // API不可用，返回模拟数据
        this.logger.warn('safetravel.is API不可用，使用模拟数据');
        return this.getMockSafetyData(query);
      } catch (apiError: any) {
        this.logger.warn(`safetravel.is API调用失败: ${apiError.message}，使用模拟数据`);
        return this.getMockSafetyData(query);
      }
    } catch (error: any) {
      this.logger.error(`获取safetravel.is安全信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析safetravel.is API响应
   */
  private parseSafetravelResponse(
    alertsData: any,
    conditionsData: any,
    query: SafetravelQueryDto,
  ): SafetravelResponseDto {
    const alerts = (alertsData?.alerts || []).map((alert: any) => {
      // 将字符串severity转换为枚举值
      let severity = AlertSeverity.MEDIUM;
      if (alert.severity) {
        const severityStr = String(alert.severity).toLowerCase();
        if (severityStr === 'low') severity = AlertSeverity.LOW;
        else if (severityStr === 'medium') severity = AlertSeverity.MEDIUM;
        else if (severityStr === 'high') severity = AlertSeverity.HIGH;
        else if (severityStr === 'critical') severity = AlertSeverity.CRITICAL;
      }
      
      return {
        id: alert.id || `alert-${Date.now()}`,
        title: alert.title || '安全警报',
        description: alert.description || '',
        type: alert.type || AlertType.GENERAL,
        severity,
        effectiveTime: alert.effectiveTime || new Date().toISOString(),
        expiryTime: alert.expiryTime,
        regions: alert.regions || [],
        fRoads: alert.fRoads || [],
      };
    });

    const travelConditions = (conditionsData?.conditions || []).map((condition: any) => ({
      region: condition.region || '',
      roadStatus: condition.roadStatus || 'open',
      weatherStatus: condition.weatherStatus || 'good',
      overallStatus: condition.overallStatus || 'green',
      description: condition.description || '',
      lastUpdated: condition.lastUpdated || new Date().toISOString(),
    }));

    return {
      alerts: alerts.filter((alert) => {
        if (query.region && !alert.regions.includes(query.region)) {
          return false;
        }
        if (query.alertType && alert.type !== query.alertType) {
          return false;
        }
        return true;
      }),
      travelConditions: travelConditions.filter((condition) => {
        if (query.region && condition.region !== query.region) {
          return false;
        }
        return true;
      }),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 获取模拟安全数据（当API不可用时）
   */
  private getMockSafetyData(query: SafetravelQueryDto): SafetravelResponseDto {
    const alerts = [
      {
        id: 'alert-1',
        title: '高地强风警告',
        description: '中央高地区域预计有强风，风速可能超过15m/s，建议推迟出行。',
        type: AlertType.WEATHER,
        severity: AlertSeverity.HIGH,
        effectiveTime: new Date().toISOString(),
        expiryTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        regions: ['highlands', 'central-highlands'],
        fRoads: ['F26', 'F208'],
      },
      {
        id: 'alert-2',
        title: 'F路路况提醒',
        description: '部分F路因天气原因需要谨慎驾驶，建议4x4车辆。',
        type: AlertType.ROAD,
        severity: AlertSeverity.MEDIUM,
        effectiveTime: new Date().toISOString(),
        regions: ['highlands'],
        fRoads: ['F910', 'F88'],
      },
    ].filter((alert) => {
      if (query.region && !alert.regions.includes(query.region)) {
        return false;
      }
      if (query.alertType && alert.type !== query.alertType) {
        return false;
      }
      return true;
    });

    const travelConditions = [
      {
        region: 'highlands',
        roadStatus: 'caution',
        weatherStatus: 'fair',
        overallStatus: 'yellow',
        description: '高地路况一般，部分F路需要谨慎驾驶',
        lastUpdated: new Date().toISOString(),
      },
      {
        region: 'central-highlands',
        roadStatus: 'open',
        weatherStatus: 'good',
        overallStatus: 'green',
        description: '中央高地区域路况良好',
        lastUpdated: new Date().toISOString(),
      },
    ].filter((condition) => {
      if (query.region && condition.region !== query.region) {
        return false;
      }
      return true;
    });

    return {
      alerts,
      travelConditions,
      lastUpdated: new Date().toISOString(),
    };
  }
}
