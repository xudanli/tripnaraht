// src/transport/services/smart-routes.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { GoogleRoutesService } from './google-routes.service';
import { AmapRoutesService } from './amap-routes.service';
import { LocationDetectorService } from './location-detector.service';
import { TransportOption } from '../interfaces/transport.interface';

/**
 * 智能路线服务
 * 
 * 根据地理位置自动选择合适的地图 API：
 * - 国内：使用高德地图 API
 * - 海外：使用 Google Routes API
 */
@Injectable()
export class SmartRoutesService {
  private readonly logger = new Logger(SmartRoutesService.name);

  constructor(
    private googleRoutesService: GoogleRoutesService,
    private amapRoutesService: AmapRoutesService,
    private locationDetector: LocationDetectorService
  ) {}

  /**
   * 智能查询路线
   * 
   * 根据起点和终点的地理位置，自动选择合适的地图 API
   * 
   * @param fromLat 起点纬度
   * @param fromLng 起点经度
   * @param toLat 终点纬度
   * @param toLng 终点经度
   * @param travelMode 交通模式
   * @param preferences 偏好设置
   * @returns 交通选项列表
   */
  async getRoutes(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    travelMode: 'TRANSIT' | 'WALKING' | 'DRIVING' = 'TRANSIT',
    preferences?: {
      lessWalking?: boolean;
      avoidHighways?: boolean;
      avoidTolls?: boolean;
    }
  ): Promise<TransportOption[]> {
    // 判断是否都在中国境内
    const bothInChina = this.locationDetector.areBothInChina(
      fromLat,
      fromLng,
      toLat,
      toLng
    );

    // 判断是否都在海外
    const bothOverseas = this.locationDetector.areBothOverseas(
      fromLat,
      fromLng,
      toLat,
      toLng
    );

    // 跨区域路线（一个在中国，一个在海外）
    if (!bothInChina && !bothOverseas) {
      this.logger.warn(
        `跨区域路线（中国↔海外），使用 Google Routes API`
      );
      return this.googleRoutesService.getRoutes(
        fromLat,
        fromLng,
        toLat,
        toLng,
        travelMode,
        preferences
      );
    }

    // 国内路线：使用高德地图
    if (bothInChina) {
      this.logger.debug('使用高德地图 API（国内路线）');
      
      // 转换交通模式格式（高德使用小写）
      const amapMode = this.convertTravelModeToAmap(travelMode);
      
      const options = await this.amapRoutesService.getRoutes(
        fromLat,
        fromLng,
        toLat,
        toLng,
        amapMode,
        preferences
      );

      // 如果高德 API 失败，降级使用 Google Routes API
      if (options.length === 0) {
        this.logger.warn('高德地图 API 无结果，降级使用 Google Routes API');
        return this.googleRoutesService.getRoutes(
          fromLat,
          fromLng,
          toLat,
          toLng,
          travelMode,
          preferences
        );
      }

      return options;
    }

    // 海外路线：使用 Google Routes API
    this.logger.debug('使用 Google Routes API（海外路线）');
    return this.googleRoutesService.getRoutes(
      fromLat,
      fromLng,
      toLat,
      toLng,
      travelMode,
      preferences
    );
  }

  /**
   * 转换交通模式格式
   * 
   * Google Routes API 使用大写：TRANSIT, WALKING, DRIVING
   * 高德地图 API 使用小写：transit, walking, driving
   */
  private convertTravelModeToAmap(
    mode: 'TRANSIT' | 'WALKING' | 'DRIVING'
  ): 'transit' | 'walking' | 'driving' {
    switch (mode) {
      case 'TRANSIT':
        return 'transit';
      case 'WALKING':
        return 'walking';
      case 'DRIVING':
        return 'driving';
      default:
        return 'transit';
    }
  }
}
