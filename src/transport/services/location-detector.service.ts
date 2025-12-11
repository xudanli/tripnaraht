// src/transport/services/location-detector.service.ts
import { Injectable } from '@nestjs/common';

/**
 * 地理位置检测服务
 * 
 * 用于判断坐标是否在中国境内，以选择合适的路线规划 API
 */
@Injectable()
export class LocationDetectorService {
  /**
   * 判断坐标是否在中国境内
   * 
   * 使用简化的边界框判断（快速但不完全精确）
   * 精确判断可以使用更复杂的多边形算法
   * 
   * @param lat 纬度
   * @param lng 经度
   * @returns 是否在中国境内
   */
  isInChina(lat: number, lng: number): boolean {
    // 中国大致边界框（包含港澳台）
    // 纬度范围：18°N - 54°N
    // 经度范围：73°E - 135°E
    const chinaBounds = {
      minLat: 18.0,
      maxLat: 54.0,
      minLng: 73.0,
      maxLng: 135.0,
    };

    // 基本边界检查
    if (
      lat >= chinaBounds.minLat &&
      lat <= chinaBounds.maxLat &&
      lng >= chinaBounds.minLng &&
      lng <= chinaBounds.maxLng
    ) {
      // 排除一些明显不在中国的区域
      // 例如：蒙古、俄罗斯远东、日本、韩国等
      
      // 排除蒙古（大致范围）
      if (lng > 87 && lng < 120 && lat > 41 && lat < 52) {
        // 进一步检查是否在蒙古境内
        // 蒙古大致范围：41°N-52°N, 87°E-120°E
        // 但中国北部边界复杂，这里简化处理
        // 如果坐标更靠近中国边界，判断为在中国
        const distanceToChinaCenter = Math.sqrt(
          Math.pow(lat - 35, 2) + Math.pow(lng - 105, 2)
        );
        const distanceToMongoliaCenter = Math.sqrt(
          Math.pow(lat - 46, 2) + Math.pow(lng - 105, 2)
        );
        return distanceToChinaCenter < distanceToMongoliaCenter;
      }

      // 排除日本（大致范围）
      if (lng > 129 && lng < 146 && lat > 24 && lat < 46) {
        return false;
      }

      // 排除韩国（大致范围）
      if (lng > 124 && lng < 132 && lat > 33 && lat < 39) {
        return false;
      }

      // 排除俄罗斯远东（大致范围）
      if (lng > 135 && lat > 50) {
        return false;
      }

      return true;
    }

    return false;
  }

  /**
   * 判断两个坐标是否都在中国境内
   */
  areBothInChina(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): boolean {
    return (
      this.isInChina(fromLat, fromLng) && this.isInChina(toLat, toLng)
    );
  }

  /**
   * 判断两个坐标是否都在海外
   */
  areBothOverseas(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): boolean {
    return (
      !this.isInChina(fromLat, fromLng) && !this.isInChina(toLat, toLng)
    );
  }
}
