/**
 * 实时道路状态服务
 * 
 * 负责获取和管理实时道路状态数据，包括：
 * - 集成道路状态API（官方 + 用户报告）
 * - 存储到 realtime_road_status 表
 * - 提供道路状态查询接口
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RoadStatusUpdate } from '../interfaces/unified-world-model.interface';
import { HttpClientFactory } from '../../../common/utils/http-client.factory';
import { AxiosInstance } from 'axios';
import { GoogleMapsDirectService } from '../../../mcp/google-maps-direct.service';
import { CountryConfigService } from './country-config.service';

@Injectable()
export class RealtimeRoadStatusService {
  private readonly logger = new Logger(RealtimeRoadStatusService.name);
  private readonly httpClient: AxiosInstance;

  constructor(
    private prisma: PrismaService,
    @Optional() private configService?: ConfigService,
    @Optional() private googleMapsDirectService?: GoogleMapsDirectService,
    @Optional() private countryConfigService?: CountryConfigService,
  ) {
    // 创建HTTP客户端（Road.is API）
    this.httpClient = HttpClientFactory.create({
      baseURL: 'https://www.road.is',
      timeout: 10000,
    });

    // 禁用代理
    this.httpClient.defaults.proxy = false;
  }

  /**
   * 获取道路状态（按roadId）
   */
  async getRoadStatus(roadId: string): Promise<RoadStatusUpdate | null> {
    this.logger.log(`[RealtimeRoadStatus] 获取道路状态: roadId=${roadId}`);

    try {
      // 1. 先从数据库查询（最近15分钟内的状态）
      const recentStatus = await this.getRecentStatusFromDB(roadId);
      
      if (recentStatus) {
        this.logger.debug(`[RealtimeRoadStatus] 从数据库获取到状态: ${recentStatus.currentStatus}`);
        return recentStatus;
      }

      // 2. 如果数据库没有，从API获取
      const apiStatus = await this.fetchStatusFromAPI(roadId);
      
      // 3. 存储到数据库
      if (apiStatus) {
        await this.saveStatusToDB(apiStatus);
      }

      return apiStatus;
    } catch (error: any) {
      this.logger.error(
        `[RealtimeRoadStatus] 获取道路状态失败: ${error.message}`,
        error.stack,
      );
      // 降级策略：返回null
      return null;
    }
  }

  /**
   * 从数据库获取最近的状态
   */
  private async getRecentStatusFromDB(roadId: string): Promise<RoadStatusUpdate | null> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const results = await this.prisma.$queryRawUnsafe(`
      SELECT * FROM realtime_road_status
      WHERE road_id = $1::varchar
        AND last_update >= $2::timestamp
      ORDER BY last_update DESC
      LIMIT 1
    `, roadId, fifteenMinutesAgo) as any[];

    if (results.length === 0) {
      return null;
    }

    const status = results[0];
    return {
      roadId: status.road_id,
      currentStatus: status.current_status as RoadStatusUpdate['currentStatus'],
      lastUpdate: status.last_update,
      source: status.source as RoadStatusUpdate['source'],
      confidence: status.confidence || 1.0,
    };
  }

  /**
   * 从API获取状态
   * 
   * 支持多种道路类型：
   * - 冰岛F路：F208, F26等（使用Road.is API）
   * - 冰岛其他道路：1号公路等（使用Road.is API扩展）
   * - 其他国家道路：使用Google Traffic API
   */
  private async fetchStatusFromAPI(roadId: string): Promise<RoadStatusUpdate | null> {
    // 检查是否是冰岛道路（F路或其他道路）
    const isIcelandFRoad = /^F\d+$/i.test(roadId);
    const isIcelandRoad = /^(F\d+|Route\s*\d+|Road\s*\d+|\d+)$/i.test(roadId);
    
    // 冰岛道路（F路或其他道路）
    if (isIcelandRoad) {
      // 优先使用Road.is API（支持F路和其他道路）
      return await this.fetchFromRoadIsAPI(roadId, isIcelandFRoad);
    }
    
    // 非冰岛道路，使用Google Traffic API
    if (this.googleMapsDirectService?.isServiceAvailable()) {
      try {
        // 获取道路位置（如果有countryCode）
        const location: { lat: number; lng: number } | null = null;
        
        // 尝试从roadId提取位置信息，或使用国家中心坐标
        // 这里简化处理：如果有countryConfigService，使用国家中心坐标
        if (this.countryConfigService) {
          // 尝试从roadId提取国家代码（如果roadId包含国家信息）
          // 否则需要从外部传入countryCode
          // 暂时返回null，需要调用方提供location
        }
        
        // 如果无法获取location，返回null
        if (!location) {
          this.logger.debug(
            `[RealtimeRoadStatus] 非冰岛道路，需要location信息才能查询Google Traffic API`,
          );
          return null;
        }
        
        const trafficStatus = await this.googleMapsDirectService!.getTrafficStatus({
          roadId,
          location: location!,
        });
        
        if (trafficStatus) {
          return {
            roadId,
            currentStatus: this.mapGoogleTrafficStatus(trafficStatus.status),
            lastUpdate: new Date(),
            source: 'google_traffic_api',
            confidence: trafficStatus.confidence,
          };
        }
      } catch (error: any) {
        this.logger.warn(
          `[RealtimeRoadStatus] Google Traffic API调用失败: ${error.message}`,
        );
      }
    }
    
    // 如果Google Traffic API不可用，返回null
    this.logger.debug(`[RealtimeRoadStatus] 非冰岛道路，无可用API，返回null`);
    return null;
  }

  /**
   * 从Road.is API获取道路状态（支持F路和其他冰岛道路）
   * 
   * @param roadId 道路ID（如F208, Route1, Road1等）
   * @param isFRoad 是否是F路
   */
  private async fetchFromRoadIsAPI(
    roadId: string,
    isFRoad: boolean,
  ): Promise<RoadStatusUpdate | null> {
    try {
      // 标准化roadId格式
      const normalizedRoadId = roadId.toUpperCase();
      
      // 调用Road.is API（尝试多个端点）
      let data: any = null;
      
      // 方法1: 尝试DATEX II API（优先用于F路）
      if (isFRoad) {
        try {
          const datexResponse = await this.httpClient.get('/api/datex2/roadconditions', {
            params: {
              road: normalizedRoadId,
            },
          });
          data = datexResponse.data;
          this.logger.debug(`[RealtimeRoadStatus] 使用DATEX II API获取到数据: ${normalizedRoadId}`);
        } catch (datexError: any) {
          // 如果DATEX II不可用，尝试标准API
          const errorMsg = datexError.message || '';
          if (
            errorMsg.includes('EAI_AGAIN') ||
            errorMsg.includes('ENOTFOUND') ||
            errorMsg.includes('ECONNREFUSED') ||
            errorMsg.includes('timeout')
          ) {
            // 网络错误，快速失败
            this.logger.warn(`[RealtimeRoadStatus] 网络错误，无法连接到road.is: ${errorMsg}`);
            return null;
          }
          this.logger.debug(`[RealtimeRoadStatus] DATEX II API不可用，尝试标准API`);
        }
      }

      // 方法2: 尝试标准API（支持所有道路类型）
      if (!data) {
        try {
          // 对于非F路，尝试不同的参数格式
          const roadParam = isFRoad 
            ? normalizedRoadId 
            : normalizedRoadId.replace(/^(ROUTE|ROAD)\s*/i, ''); // 移除Route/Road前缀
          
          const response = await this.httpClient.get('/api/roadconditions', {
            params: {
              road: roadParam,
            },
          });
          data = response.data;
          this.logger.debug(`[RealtimeRoadStatus] 使用标准API获取到数据: ${roadParam}`);
        } catch (apiError: any) {
          const errorMsg = apiError.message || '';
          if (
            errorMsg.includes('EAI_AGAIN') ||
            errorMsg.includes('ENOTFOUND') ||
            errorMsg.includes('ECONNREFUSED') ||
            errorMsg.includes('timeout')
          ) {
            this.logger.warn(`[RealtimeRoadStatus] 网络错误，无法连接到road.is: ${errorMsg}`);
            return null;
          }
          // API可能不存在或需要认证，返回null
          this.logger.debug(`[RealtimeRoadStatus] Road.is API调用失败: ${errorMsg}`);
          return null;
        }
      }

      // 解析API响应
      if (data) {
        const parsedStatus = this.parseRoadIsResponse(data, normalizedRoadId);
        if (parsedStatus) {
          this.logger.debug(
            `[RealtimeRoadStatus] 成功获取道路状态: ${normalizedRoadId} -> ${parsedStatus.currentStatus}`,
          );
          return parsedStatus;
        }
      }

      return null;
    } catch (error: any) {
      this.logger.error(
        `[RealtimeRoadStatus] Road.is API调用失败: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  /**
   * 映射Google Traffic状态到RoadStatusUpdate状态
   */
  private mapGoogleTrafficStatus(
    status: 'OPEN' | 'CLOSED' | 'CONDITIONAL' | 'SLOW' | 'MODERATE',
  ): RoadStatusUpdate['currentStatus'] {
    const statusMap: Record<string, RoadStatusUpdate['currentStatus']> = {
      OPEN: 'OPEN',
      CLOSED: 'CLOSED',
      CONDITIONAL: 'CONDITIONAL',
      SLOW: 'CONDITIONAL', // 慢速视为条件性开放
      MODERATE: 'OPEN', // 中等速度视为开放
    };
    
    return statusMap[status] || 'OPEN';
  }

  /**
   * 解析Road.is API响应
   */
  private parseRoadIsResponse(data: any, roadId: string): RoadStatusUpdate | null {
    try {
      // 根据Road.is API的实际响应格式解析
      // 注意：实际格式可能因API版本而异
      let status: RoadStatusUpdate['currentStatus'] = 'OPEN';
      const confidence = 0.8;

      // 尝试从不同可能的响应格式中提取状态
      if (data.status) {
        const statusStr = String(data.status).toLowerCase();
        if (statusStr.includes('closed') || statusStr.includes('impassable')) {
          status = 'CLOSED';
        } else if (statusStr.includes('caution') || statusStr.includes('conditional')) {
          status = 'CONDITIONAL';
        } else {
          status = 'OPEN';
        }
      } else if (data.condition) {
        const conditionStr = String(data.condition).toLowerCase();
        if (conditionStr.includes('closed')) {
          status = 'CLOSED';
        } else if (conditionStr.includes('caution')) {
          status = 'CONDITIONAL';
        }
      }

      return {
        roadId: roadId.toUpperCase(),
        currentStatus: status,
        lastUpdate: new Date(),
        source: 'road_is_api',
        confidence: confidence,
        metadata: {
          rawData: data,
        },
      };
    } catch (error: any) {
      this.logger.warn(`[RealtimeRoadStatus] 解析API响应失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 保存状态到数据库
   */
  private async saveStatusToDB(status: RoadStatusUpdate): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      INSERT INTO realtime_road_status (
        road_id,
        current_status,
        last_update,
        source,
        confidence,
        metadata,
        created_at,
        updated_at
      ) VALUES (
        $1::varchar,
        $2::varchar,
        $3::timestamp,
        $4::varchar,
        $5::double precision,
        $6::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (road_id) DO UPDATE SET
        current_status = $2::varchar,
        last_update = $3::timestamp,
        source = $4::varchar,
        confidence = $5::double precision,
        updated_at = NOW()
    `,
      status.roadId,
      status.currentStatus,
      status.lastUpdate,
      status.source,
      status.confidence,
      JSON.stringify({}),
    );
  }

  /**
   * 用户报告道路状态
   */
  async reportRoadStatus(
    roadId: string,
    status: 'OPEN' | 'CLOSED' | 'CONDITIONAL',
    userId: string,
    _metadata?: any,
  ): Promise<void> {
    this.logger.log(
      `[RealtimeRoadStatus] 用户报告道路状态: roadId=${roadId}, status=${status}, userId=${userId}`,
    );

    try {
      const roadStatusUpdate: RoadStatusUpdate = {
        roadId,
        currentStatus: status,
        lastUpdate: new Date(),
        source: 'user_report',
        confidence: 0.7, // 用户报告的置信度较低
      };

      await this.saveStatusToDB(roadStatusUpdate);
      this.logger.log(`[RealtimeRoadStatus] 用户报告已保存: roadId=${roadId}`);
    } catch (error: any) {
      this.logger.error(
        `[RealtimeRoadStatus] 保存用户报告失败: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 更新道路状态（定时任务调用）
   */
  async updateRoadStatus(roadIds: string[]): Promise<void> {
    this.logger.log(`[RealtimeRoadStatus] 更新道路状态: roadIds=${roadIds.join(', ')}`);

    for (const roadId of roadIds) {
      try {
        const status = await this.fetchStatusFromAPI(roadId);
        if (status) {
          await this.saveStatusToDB(status);
          this.logger.log(`[RealtimeRoadStatus] 已更新状态: roadId=${roadId}`);
        }
      } catch (error: any) {
        this.logger.error(
          `[RealtimeRoadStatus] 更新状态失败: roadId=${roadId}, error=${error.message}`,
        );
        // 继续处理下一个道路
      }
    }
  }
}
