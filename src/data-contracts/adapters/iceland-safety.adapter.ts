// src/data-contracts/adapters/iceland-safety.adapter.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IcelandSafetyAlert } from '../interfaces/iceland-specific.interface';
import { BaseAdapter } from './base.adapter';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 冰岛安全适配器
 * 
 * 接入 SafeTravel.is API（冰岛搜救队官方平台）
 * 提供针对游客的安全警告
 * 
 * API 文档: https://safetravel.is/
 */
@Injectable()
export class IcelandSafetyAdapter extends BaseAdapter {
  constructor(private configService: ConfigService) {
    super(IcelandSafetyAdapter.name, {
      baseURL: 'https://safetravel.is',
      timeout: 15000,
    });
  }

  /**
   * 获取安全警报列表
   */
  async getSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]> {
    return this.safeRequest(
      async () => {
        const params: any = {};
        if (lat !== undefined && lng !== undefined) {
          params.lat = lat;
          params.lng = lng;
        }

        const response = await this.httpClient.get('/api/alerts', { params });
        return this.mapToSafetyAlerts(response.data);
      },
      '获取冰岛安全警报失败',
      []
    );
  }

  /**
   * 获取特定类型的安全警报
   */
  async getSafetyAlertsByType(
    type: 'weather' | 'road' | 'volcano' | 'glacier' | 'geothermal' | 'general',
    lat?: number,
    lng?: number
  ): Promise<IcelandSafetyAlert[]> {
    const allAlerts = await this.getSafetyAlerts(lat, lng);
    return allAlerts.filter(alert => alert.type === type);
  }

  /**
   * 获取关键安全警报（warning 或 critical）
   */
  async getCriticalSafetyAlerts(lat?: number, lng?: number): Promise<IcelandSafetyAlert[]> {
    const allAlerts = await this.getSafetyAlerts(lat, lng);
    return allAlerts.filter(alert => 
      alert.severity === 'warning' || alert.severity === 'critical'
    );
  }

  /**
   * 将 SafeTravel.is API 响应映射为标准格式
   */
  private mapToSafetyAlerts(data: any): IcelandSafetyAlert[] {
    const alerts: IcelandSafetyAlert[] = [];

    if (!data || !Array.isArray(data)) {
      return alerts;
    }

    for (const item of data) {
      alerts.push({
        id: item.id || item.alertId || String(Date.now()),
        type: this.mapAlertType(item.type || item.category),
        severity: this.mapSeverity(item.severity || item.level),
        title: item.title || item.headline,
        description: item.description || item.text || item.message,
        affectedAreas: this.mapAffectedAreas(item.affectedAreas || item.areas),
        effectiveTime: item.effectiveTime ? new Date(item.effectiveTime) : new Date(),
        expiryTime: item.expiryTime ? new Date(item.expiryTime) : undefined,
        source: 'safetravel',
        metadata: {
          rawData: item,
        },
      });
    }

    return alerts;
  }

  /**
   * 映射警报类型
   */
  private mapAlertType(type: string): 'weather' | 'road' | 'volcano' | 'glacier' | 'geothermal' | 'general' {
    const typeMap: Record<string, 'weather' | 'road' | 'volcano' | 'glacier' | 'geothermal' | 'general'> = {
      'weather': 'weather',
      'road': 'road',
      'volcano': 'volcano',
      'volcanic': 'volcano',
      'glacier': 'glacier',
      'geothermal': 'geothermal',
      'hot-spring': 'geothermal',
      'general': 'general',
    };

    return typeMap[type?.toLowerCase()] || 'general';
  }

  /**
   * 映射严重程度
   */
  private mapSeverity(severity: string): 'info' | 'warning' | 'critical' {
    return AdapterMapper.mapSeverity(severity, {
      'danger': 'critical',
    });
  }

  /**
   * 映射影响区域
   */
  private mapAffectedAreas(areas: any): Array<{ name: string; coordinates?: { lat: number; lng: number } }> {
    if (!areas) {
      return [];
    }

    if (Array.isArray(areas)) {
      return areas.map((area: any) => ({
        name: area.name || area,
        coordinates: area.coordinates || (area.lat && area.lng ? { lat: area.lat, lng: area.lng } : undefined),
      }));
    }

    return [];
  }
}

