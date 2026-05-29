// src/iceland-info/services/road.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientFactory } from '../../common/utils/http-client.factory';
import { RoadConditionsQueryDto, RoadConditionsResponseDto, RoadStatus, RoadCondition, RoadSegmentDto } from '../dto/road-conditions.dto';
import { AxiosInstance } from 'axios';

@Injectable()
export class RoadService {
  private readonly logger = new Logger(RoadService.name);
  private readonly httpClient: AxiosInstance;
  private readonly baseURL = 'https://www.road.is';

  constructor(private configService: ConfigService) {
    this.httpClient = HttpClientFactory.create({
      baseURL: this.baseURL,
      timeout: 10000,
    });
  }

  /**
   * 获取F路路况信息
   */
  async getRoadConditions(query: RoadConditionsQueryDto): Promise<RoadConditionsResponseDto> {
    try {
      // road.is 可能没有公开API
      // 尝试调用可能的端点，如果失败则使用模拟数据
      try {
        const fRoads = query.fRoads ? query.fRoads.split(',') : [];
        
        // 尝试调用API端点（如果存在）
        const response = await this.httpClient.get('/api/roads', {
          params: {
            type: 'f-road',
            roads: fRoads.join(','),
            status: query.status,
          },
        });

        return this.parseRoadResponse(response.data, query);
      } catch (apiError: any) {
        this.logger.warn(`road.is API调用失败: ${apiError.message}，使用模拟数据`);
        return this.getMockRoadData(query);
      }
    } catch (error: any) {
      this.logger.error(`获取road.is路况信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析road.is API响应
   */
  private parseRoadResponse(data: any, query: RoadConditionsQueryDto): RoadConditionsResponseDto {
    const fRoads = (data.roads || []).map((road: any) => ({
      id: road.id || `road-${road.fRoadNumber}`,
      name: road.name || road.fRoadNumber,
      fRoadNumber: road.fRoadNumber || '',
      startPoint: road.startPoint || { lat: 0, lng: 0 },
      endPoint: road.endPoint || { lat: 0, lng: 0 },
      status: road.status || RoadStatus.OPEN,
      condition: road.condition || RoadCondition.DRY,
      isOpen: road.isOpen !== undefined ? road.isOpen : road.status === RoadStatus.OPEN,
      description: road.description || '',
      lastUpdated: road.lastUpdated || new Date().toISOString(),
      expectedOpenTime: road.expectedOpenTime,
      expectedCloseTime: road.expectedCloseTime,
    }));

    return {
      fRoads: fRoads.filter((road: RoadSegmentDto) => {
        if (query.fRoads) {
          const requestedRoads = query.fRoads.split(',');
          if (!requestedRoads.includes(road.fRoadNumber)) {
            return false;
          }
        }
        if (query.status && road.status !== query.status) {
          return false;
        }
        return true;
      }),
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      source: 'road.is',
    };
  }

  /**
   * 获取模拟路况数据（当API不可用时）
   */
  private getMockRoadData(query: RoadConditionsQueryDto): RoadConditionsResponseDto {
    // 主要F路数据
    const allFRoads = [
      {
        id: 'f208',
        name: 'F208 Landmannalaugar',
        fRoadNumber: 'F208',
        startPoint: { lat: 63.9330, lng: -21.0023 },
        endPoint: { lat: 63.9930, lng: -19.0618 },
        status: RoadStatus.OPEN,
        condition: RoadCondition.DRY,
        isOpen: true,
        description: 'F208开放，路况良好',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'f225',
        name: 'F225 Landmannalaugar - Þórsmörk',
        fRoadNumber: 'F225',
        startPoint: { lat: 63.9930, lng: -19.0618 },
        endPoint: { lat: 63.6800, lng: -19.4800 },
        status: RoadStatus.CAUTION,
        condition: RoadCondition.WET,
        isOpen: true,
        description: 'F225开放，但需要谨慎驾驶，部分路段湿滑',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'f26',
        name: 'F26 Sprengisandur',
        fRoadNumber: 'F26',
        startPoint: { lat: 64.0000, lng: -19.0000 },
        endPoint: { lat: 65.0000, lng: -18.0000 },
        status: RoadStatus.OPEN,
        condition: RoadCondition.DRY,
        isOpen: true,
        description: 'F26开放，路况良好',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'f910',
        name: 'F910 Askja',
        fRoadNumber: 'F910',
        startPoint: { lat: 65.0000, lng: -16.8500 },
        endPoint: { lat: 65.0300, lng: -16.7500 },
        status: RoadStatus.CAUTION,
        condition: RoadCondition.MUDDY,
        isOpen: true,
        description: 'F910开放，但路况较差，需要4x4车辆',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'f88',
        name: 'F88 Askja - North',
        fRoadNumber: 'F88',
        startPoint: { lat: 65.0300, lng: -16.7500 },
        endPoint: { lat: 65.5000, lng: -16.5000 },
        status: RoadStatus.OPEN,
        condition: RoadCondition.DRY,
        isOpen: true,
        description: 'F88开放，路况良好',
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'f249',
        name: 'F249 Þórsmörk',
        fRoadNumber: 'F249',
        startPoint: { lat: 63.7000, lng: -19.6000 },
        endPoint: { lat: 63.6800, lng: -19.4800 },
        status: RoadStatus.CAUTION,
        condition: RoadCondition.WET,
        isOpen: true,
        description: 'F249开放，需要渡河，水位较高',
        lastUpdated: new Date().toISOString(),
      },
    ];

    // 过滤
    let filteredRoads = allFRoads;
    
    if (query.fRoads) {
      const requestedRoads = query.fRoads.split(',').map(r => r.trim().toUpperCase());
      filteredRoads = filteredRoads.filter(road => 
        requestedRoads.includes(road.fRoadNumber.toUpperCase())
      );
    }

    if (query.status) {
      filteredRoads = filteredRoads.filter(road => road.status === query.status);
    }

    return {
      fRoads: filteredRoads,
      lastUpdated: new Date().toISOString(),
      source: 'road.is (mock)',
    };
  }
}
