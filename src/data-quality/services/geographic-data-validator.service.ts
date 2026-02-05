// src/data-quality/services/geographic-data-validator.service.ts

import { Injectable, Logger } from '@nestjs/common';

/**
 * 地理数据验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

/**
 * 地理数据验证器服务
 * 
 * 提供地理数据特有的验证功能：
 * - 坐标验证（WGS84格式、坐标范围）
 * - 空间范围验证（确保数据覆盖目标国家/区域）
 * - 坐标系统一致性验证（WGS84统一性）
 * - 空间拓扑关系验证
 */
@Injectable()
export class GeographicDataValidatorService {
  private readonly logger = new Logger(GeographicDataValidatorService.name);

  /**
   * 验证坐标（WGS84格式、坐标范围）
   * 
   * @param lat 纬度
   * @param lng 经度
   * @returns 验证结果
   */
  validateCoordinates(lat: number, lng: number): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // 检查是否为数字
    if (typeof lat !== 'number' || isNaN(lat)) {
      errors.push({
        field: 'lat',
        message: `纬度必须是数字，当前值: ${lat}`,
      });
      return { valid: false, errors, warnings };
    }

    if (typeof lng !== 'number' || isNaN(lng)) {
      errors.push({
        field: 'lng',
        message: `经度必须是数字，当前值: ${lng}`,
      });
      return { valid: false, errors, warnings };
    }

    // 纬度范围检查（-90 到 90）
    if (lat < -90 || lat > 90) {
      errors.push({
        field: 'lat',
        message: `纬度超出范围: ${lat}，有效范围: -90 到 90`,
      });
    }

    // 经度范围检查（-180 到 180）
    if (lng < -180 || lng > 180) {
      errors.push({
        field: 'lng',
        message: `经度超出范围: ${lng}，有效范围: -180 到 180`,
      });
    }

    // 坐标精度检查（至少小数点后4位）
    const latPrecision = this.getDecimalPlaces(lat);
    const lngPrecision = this.getDecimalPlaces(lng);
    
    if (latPrecision < 4) {
      warnings.push({
        field: 'lat',
        message: `纬度精度不足: ${latPrecision} 位小数，建议至少4位（约11米精度）`,
      });
    }
    
    if (lngPrecision < 4) {
      warnings.push({
        field: 'lng',
        message: `经度精度不足: ${lngPrecision} 位小数，建议至少4位（约11米精度）`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证空间范围（确保数据覆盖目标国家/区域）
   * 
   * @param coordinates 坐标列表
   * @param targetCountryCode 目标国家代码（ISO 3166-1 alpha-2）
   * @returns 验证结果
   */
  validateSpatialRange(
    coordinates: Array<{ lat: number; lng: number }>,
    targetCountryCode: string
  ): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    if (coordinates.length === 0) {
      errors.push({
        field: 'coordinates',
        message: '坐标列表为空',
      });
      return { valid: false, errors, warnings };
    }

    // 获取目标国家的边界
    const countryBounds = this.getCountryBounds(targetCountryCode);
    
    if (!countryBounds) {
      warnings.push({
        field: 'targetCountryCode',
        message: `未知国家代码: ${targetCountryCode}，无法验证空间范围`,
      });
      return { valid: true, errors, warnings };
    }

    // 检查所有坐标是否在目标国家范围内
    const outOfBounds: Array<{ lat: number; lng: number; index: number }> = [];
    
    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      
      // 先验证坐标格式
      const coordValidation = this.validateCoordinates(coord.lat, coord.lng);
      if (!coordValidation.valid) {
        errors.push({
          field: `coordinates[${i}]`,
          message: `坐标格式无效: ${coordValidation.errors.map(e => e.message).join(', ')}`,
        });
        continue;
      }
      
      // 检查是否在目标国家范围内
      if (
        coord.lat < countryBounds.minLat ||
        coord.lat > countryBounds.maxLat ||
        coord.lng < countryBounds.minLng ||
        coord.lng > countryBounds.maxLng
      ) {
        outOfBounds.push({ ...coord, index: i });
      }
    }

    if (outOfBounds.length > 0) {
      warnings.push({
        field: 'coordinates',
        message: `${outOfBounds.length} 个坐标超出 ${targetCountryCode} 边界范围。示例: (${outOfBounds[0].lat}, ${outOfBounds[0].lng})`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证坐标系统一致性（WGS84）
   * 
   * @param data 包含坐标的数据数组
   * @returns 验证结果
   */
  validateCoordinateSystemConsistency(
    data: Array<{ lat: number; lng: number }>
  ): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    if (data.length === 0) {
      warnings.push({
        field: 'data',
        message: '数据为空，无法验证坐标系统一致性',
      });
      return { valid: true, errors, warnings };
    }

    // WGS84坐标范围检查（所有坐标都应该在WGS84范围内）
    let invalidCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const coord = data[i];
      const coordValidation = this.validateCoordinates(coord.lat, coord.lng);
      
      if (!coordValidation.valid) {
        invalidCount++;
        if (invalidCount <= 5) { // 只记录前5个错误，避免输出过多
          errors.push({
            field: `data[${i}]`,
            message: `坐标不符合WGS84格式: ${coordValidation.errors.map(e => e.message).join(', ')}`,
          });
        }
      }
    }
    
    if (invalidCount > 5) {
      errors.push({
        field: 'data',
        message: `还有 ${invalidCount - 5} 个坐标不符合WGS84格式`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 验证空间拓扑关系（简化版）
   * 
   * @param features 地理特征数组
   * @returns 验证结果
   */
  validateSpatialTopology(
    features: Array<{ type: string; geometry: any }>
  ): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    if (features.length === 0) {
      warnings.push({
        field: 'features',
        message: '地理特征列表为空',
      });
      return { valid: true, errors, warnings };
    }

    // 简化版：检查几何数据格式
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      
      if (!feature.geometry) {
        errors.push({
          field: `features[${i}].geometry`,
          message: '几何数据缺失',
        });
        continue;
      }

      // 检查几何类型
      const validTypes = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon'];
      if (!validTypes.includes(feature.geometry.type)) {
        warnings.push({
          field: `features[${i}].geometry.type`,
          message: `未知几何类型: ${feature.geometry.type}，支持的类型: ${validTypes.join(', ')}`,
        });
      }
      
      // 检查坐标数据
      if (feature.geometry.coordinates && Array.isArray(feature.geometry.coordinates)) {
        // 简化版：检查坐标是否为数字数组
        const coords = feature.geometry.coordinates;
        if (coords.length > 0 && typeof coords[0] === 'number') {
          // Point类型
          const coordValidation = this.validateCoordinates(coords[1], coords[0]); // GeoJSON格式：[lng, lat]
          if (!coordValidation.valid) {
            errors.push({
              field: `features[${i}].geometry.coordinates`,
              message: `坐标无效: ${coordValidation.errors.map(e => e.message).join(', ')}`,
            });
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 批量验证坐标
   * 
   * @param coordinates 坐标数组
   * @returns 验证结果
   */
  validateCoordinatesBatch(
    coordinates: Array<{ lat: number; lng: number }>
  ): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    for (let i = 0; i < coordinates.length; i++) {
      const coord = coordinates[i];
      const result = this.validateCoordinates(coord.lat, coord.lng);
      
      if (!result.valid) {
        result.errors.forEach(err => {
          errors.push({
            field: `coordinates[${i}].${err.field}`,
            message: err.message,
          });
        });
      }
      
      result.warnings.forEach(warn => {
        warnings.push({
          field: `coordinates[${i}].${warn.field}`,
          message: warn.message,
        });
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 从物理现实数据中提取坐标
   * 
   * @param data 物理现实数据（道路状态、渡轮时刻表、天气窗口）
   * @returns 坐标数组
   */
  extractCoordinatesFromPhysicalRealityData(data: any): Array<{ lat: number; lng: number }> {
    const coordinates: Array<{ lat: number; lng: number }> = [];

    // 道路状态数据格式: { segments: [{ start: { lat, lng }, end: { lat, lng } }] }
    if (data.segments && Array.isArray(data.segments)) {
      data.segments.forEach((segment: any) => {
        if (segment.start) {
          coordinates.push({ lat: segment.start.lat, lng: segment.start.lng });
        }
        if (segment.end) {
          coordinates.push({ lat: segment.end.lat, lng: segment.end.lng });
        }
      });
    }

    // 渡轮时刻表数据格式: { routes: [{ origin: { lat, lng }, destination: { lat, lng } }] }
    if (data.routes && Array.isArray(data.routes)) {
      data.routes.forEach((route: any) => {
        if (route.origin) {
          coordinates.push({ lat: route.origin.lat, lng: route.origin.lng });
        }
        if (route.destination) {
          coordinates.push({ lat: route.destination.lat, lng: route.destination.lng });
        }
      });
    }

    // 天气窗口数据格式: { regions: [{ center: { lat, lng } }] }
    if (data.regions && Array.isArray(data.regions)) {
      data.regions.forEach((region: any) => {
        if (region.center) {
          coordinates.push({ lat: region.center.lat, lng: region.center.lng });
        }
      });
    }

    return coordinates;
  }

  // ========== 辅助方法 ==========

  /**
   * 获取小数位数
   */
  private getDecimalPlaces(num: number): number {
    if (Math.floor(num) === num) return 0;
    const str = num.toString();
    if (str.indexOf('.') !== -1 && str.indexOf('e-') === -1) {
      return str.split('.')[1].length;
    } else if (str.indexOf('e-') !== -1) {
      const parts = str.split('e-');
      return parseInt(parts[1], 10) + (parts[0].split('.')[1] || '').length;
    }
    return 0;
  }

  /**
   * 获取国家边界（简化版，实际应该从geo_country表查询）
   */
  private getCountryBounds(countryCode: string): {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  } | null {
    const bounds: Record<string, {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    }> = {
      CH: { minLat: 45.8, maxLat: 47.8, minLng: 5.9, maxLng: 10.5 },
      NO: { minLat: 57.9, maxLat: 71.2, minLng: 4.5, maxLng: 31.3 },
      PE: { minLat: -18.3, maxLat: -0.0, minLng: -81.3, maxLng: -68.7 },
      IS: { minLat: 63.3, maxLat: 66.6, minLng: -24.5, maxLng: -13.5 },
      GL: { minLat: 59.8, maxLat: 83.6, minLng: -73.0, maxLng: -12.2 },
      FO: { minLat: 61.4, maxLat: 62.4, minLng: -7.7, maxLng: -6.3 },
      NZ: { minLat: -47.3, maxLat: -34.4, minLng: 166.4, maxLng: 178.6 },
      SJ: { minLat: 74.0, maxLat: 81.0, minLng: 10.0, maxLng: 35.0 },
      AR: { minLat: -55.1, maxLat: -21.8, minLng: -73.6, maxLng: -53.6 },
      // 可以添加更多国家
    };
    
    return bounds[countryCode] || null;
  }
}
