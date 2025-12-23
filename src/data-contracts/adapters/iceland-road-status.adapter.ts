// src/data-contracts/adapters/iceland-road-status.adapter.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoadStatusAdapter } from './road-status.adapter.interface';
import { RoadStatus, RoadStatusQuery, ExtendedRoadStatus } from '../interfaces/road-status.interface';
import { FRoadInfo, RiverCrossingInfo } from '../interfaces/iceland-specific.interface';
import { BaseAdapter } from './base.adapter';
import { AdapterMapper } from '../../common/utils/adapter-mapper.util';

/**
 * 冰岛路况适配器
 * 
 * 接入 Road.is DATEX II API（冰岛官方路况数据源）
 * 提供实时路况、天气警报、F-Road 状态等信息
 * 
 * API 文档: 
 * - DATEX II: https://www.road.is/travel-info/road-conditions-and-weather/road-conditions-api/
 * - 官方 API: https://www.road.is/api/
 */
@Injectable()
export class IcelandRoadStatusAdapter extends BaseAdapter implements RoadStatusAdapter {
  private readonly baseUrl = 'https://www.road.is';
  private readonly datexUrl = 'https://www.road.is/travel-info/road-conditions-and-weather/road-conditions-api/';

  constructor(private configService: ConfigService) {
    super(IcelandRoadStatusAdapter.name, {
      baseURL: 'https://www.road.is',
      timeout: 15000,
    });
  }

  async getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus> {
    try {
      // 尝试多种 API 端点
      let data: any = null;
      
      // 方法 1: 尝试 DATEX II API（如果可用）
      try {
        const datexResponse = await this.httpClient.get('/api/datex2/roadconditions', {
          params: {
            lat: query.lat,
            lon: query.lng,
            radius: query.radius || 50000,
          },
        });
        data = datexResponse.data;
        this.logger.debug('使用 DATEX II API');
      } catch (datexError) {
        // 如果 DATEX II 不可用，尝试标准 API
        this.logger.debug('DATEX II API 不可用，尝试标准 API');
      }
      
      // 方法 2: 使用标准 Road.is API
      if (!data) {
        const response = await this.httpClient.get('/api/roadconditions', {
          params: {
            lat: query.lat,
            lon: query.lng,
            radius: query.radius || 50000,
          },
        });
        data = response.data;
      }
      
      // 转换为标准格式
      const status = await this.mapToRoadStatus(data, query);
      
      // 如果需要 F-Road 信息
      if (query.includeFRoadInfo) {
        const fRoadInfo = await this.getFRoadInfo(query);
        if (fRoadInfo) {
          (status as ExtendedRoadStatus).fRoadInfo = fRoadInfo;
        }
      }
      
      // 如果需要河流渡口信息
      if (query.includeRiverCrossing) {
        const riverCrossingInfo = await this.getRiverCrossingInfo(query);
        if (riverCrossingInfo) {
          (status as ExtendedRoadStatus).riverCrossingInfo = riverCrossingInfo;
        }
      }
      
      return status;
    } catch (error) {
      this.logger.error(`获取冰岛路况失败: ${AdapterMapper.extractErrorMessage(error)}`);
      
      // 如果 API 调用失败，返回保守的警告状态
      return AdapterMapper.createDefaultErrorResponse<RoadStatus>(
        'road.is',
        error,
        {
          isOpen: true, // 假设开放，但标记为需要检查
          riskLevel: 2, // 中等风险（因为无法获取实时数据）
          reason: '无法获取实时路况数据，建议查询官方 Road.is 网站',
          metadata: {
            note: 'API 调用失败，返回保守估计',
          },
        }
      );
    }
  }

  async getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]> {
    if (!query.segments || query.segments.length === 0) {
      return [await this.getRoadStatus(query)];
    }

    // 批量查询路段路况
    const statuses: RoadStatus[] = [];
    for (const segment of query.segments) {
      const segmentQuery: RoadStatusQuery = {
        lat: segment.from.lat,
        lng: segment.from.lng,
        segments: [{ from: segment.from, to: segment.to }],
      };
      const status = await this.getRoadStatus(segmentQuery);
      statuses.push(status);
    }

    return statuses;
  }

  getSupportedCountries(): string[] {
    return ['IS']; // 仅支持冰岛
  }

  getPriority(): number {
    return 10; // 冰岛特定适配器优先级高
  }

  getName(): string {
    return 'Iceland Road.is';
  }

  /**
   * 将 Road.is API 响应映射为标准 RoadStatus 格式
   * 
   * DATEX II 格式参考：
   * - road_closure: 封路信息
   * - slippery: 路面湿滑
   * - snow_depth: 积雪深度（厘米）
   * - wind_gusts: 瞬时强风（米/秒）
   */
  private async mapToRoadStatus(data: any, query: RoadStatusQuery): Promise<RoadStatus> {
    let isOpen = true;
    let riskLevel: 0 | 1 | 2 | 3 = 0;
    let reason: string | undefined;
    const reasons: string[] = [];
    const extendedStatus: ExtendedRoadStatus = {
      isOpen: true,
      riskLevel: 0,
      lastUpdated: new Date(),
      source: 'road.is',
      metadata: {
        rawData: data,
        query: query,
      },
    };

    // DATEX II 格式处理
    if (data.situationRecords) {
      for (const record of data.situationRecords) {
        // 检查封路
        if (record.roadClosure || record.roadClosed) {
          isOpen = false;
          riskLevel = 3;
          reasons.push(`路段封闭: ${record.roadName || '未知路段'}`);
        }
        
        // 检查路面湿滑
        if (record.slippery) {
          riskLevel = Math.max(riskLevel, 2) as 0 | 1 | 2 | 3;
          reasons.push('路面湿滑');
          extendedStatus.metadata = { ...extendedStatus.metadata, isSlippery: true };
        }
        
        // 检查积雪深度
        if (record.snowDepth !== undefined && record.snowDepth > 0) {
          extendedStatus.snowDepth = record.snowDepth;
          if (record.snowDepth > 20) { // 超过 20cm 视为高风险
            riskLevel = Math.max(riskLevel, 3) as 0 | 1 | 2 | 3;
            reasons.push(`积雪深度: ${record.snowDepth}cm`);
          } else if (record.snowDepth > 10) {
            riskLevel = Math.max(riskLevel, 2) as 0 | 1 | 2 | 3;
            reasons.push(`积雪深度: ${record.snowDepth}cm`);
          }
        }
        
        // 检查瞬时强风
        if (record.windGusts !== undefined && record.windGusts > 0) {
          extendedStatus.windGusts = record.windGusts;
          if (record.windGusts > 25) { // 超过 25 m/s 视为高风险
            riskLevel = Math.max(riskLevel, 3) as 0 | 1 | 2 | 3;
            reasons.push(`瞬时强风: ${record.windGusts} m/s`);
          } else if (record.windGusts > 15) {
            riskLevel = Math.max(riskLevel, 2) as 0 | 1 | 2 | 3;
            reasons.push(`瞬时强风: ${record.windGusts} m/s`);
          }
        }
      }
    }
    
    // 标准 API 格式处理（兼容旧格式）
    if (data.closedRoads && data.closedRoads.length > 0) {
      isOpen = false;
      riskLevel = 3;
      reasons.push(`路段封闭: ${data.closedRoads.map((r: any) => r.name || r.roadNumber).join(', ')}`);
    }
    
    if (data.alerts && data.alerts.length > 0) {
      const criticalAlerts = data.alerts.filter((a: any) => 
        a.severity === 'critical' || a.severity === 'warning'
      );
      if (criticalAlerts.length > 0) {
        riskLevel = Math.max(riskLevel, criticalAlerts.some((a: any) => a.severity === 'critical') ? 3 : 2) as 0 | 1 | 2 | 3;
        reasons.push(`天气警报: ${criticalAlerts.map((a: any) => a.title).join(', ')}`);
      }
    }
    
    if (data.fRoads && data.fRoads.length > 0) {
      const closedFRoads = data.fRoads.filter((r: any) => !r.isOpen);
      if (closedFRoads.length > 0) {
        riskLevel = Math.max(riskLevel, 2) as 0 | 1 | 2 | 3;
        reasons.push(`F-Road 封闭: ${closedFRoads.map((r: any) => r.name || r.roadNumber).join(', ')}`);
      }
    }

    extendedStatus.isOpen = isOpen;
    extendedStatus.riskLevel = riskLevel;
    extendedStatus.reason = reasons.length > 0 ? reasons.join('; ') : undefined;

    return extendedStatus;
  }

  /**
   * 获取 F-Road 信息
   */
  private async getFRoadInfo(query: RoadStatusQuery): Promise<FRoadInfo | null> {
    return this.safeRequestOrNull(async () => {
      // 尝试从 Road.is API 获取 F-Road 信息
      const response = await this.httpClient.get('/api/froads', {
        params: {
          lat: query.lat,
          lon: query.lng,
          radius: query.radius || 50000,
        },
      });
      
      const fRoadData = response.data;
      if (!fRoadData || fRoadData.length === 0) {
        return null;
      }
      
      // 找到最近的 F-Road
      const nearestFRoad = fRoadData[0];
      
      return {
        roadNumber: nearestFRoad.roadNumber || nearestFRoad.name,
        isFRoad: true,
        status: nearestFRoad.isOpen ? 'open' : 'closed',
        restrictionReason: nearestFRoad.restrictionReason,
        requires4WD: nearestFRoad.requires4WD !== false, // 默认需要 4WD
        difficultyLevel: nearestFRoad.difficultyLevel || 3,
        snowDepth: nearestFRoad.snowDepth,
        isSlippery: nearestFRoad.isSlippery,
        lastUpdated: new Date(nearestFRoad.lastUpdated || Date.now()),
      };
    }, '获取 F-Road 信息失败');
  }

  /**
   * 获取河流渡口信息
   */
  private async getRiverCrossingInfo(query: RoadStatusQuery): Promise<RiverCrossingInfo | null> {
    // 结合 DEM 高程和 OSM 水系图层
    // 这里简化实现，实际应该查询数据库或调用地理服务
    
    // TODO: 实现真实的河流渡口查询
    // 1. 查询 OSM 水系数据
    // 2. 查询 DEM 高程数据
    // 3. 结合降水记录判断水位
    
    return null;
  }
}

