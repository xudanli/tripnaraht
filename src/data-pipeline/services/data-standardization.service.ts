// src/data-pipeline/services/data-standardization.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { CleanedData, StandardizedData } from '../interfaces/data-pipeline.interface';

/**
 * 数据标准化服务
 * 
 * 提供数据标准化功能：
 * - 统一时间格式
 * - 统一地理坐标系
 * - 统一单位
 */
@Injectable()
export class DataStandardizationService {
  private readonly logger = new Logger(DataStandardizationService.name);

  /**
   * 标准化数据
   */
  async standardizeData(cleanedData: CleanedData): Promise<StandardizedData> {
    this.logger.log('Starting data standardization process');

    const data = cleanedData.formatStandardized;

    // 统一时间格式
    const timeFormat = await this.unifyTimeFormat(data);

    // 统一地理坐标系
    const coordinateSystem = await this.unifyCoordinateSystem(timeFormat);

    // 统一单位
    const units = await this.unifyUnits(coordinateSystem);

    // 生成标准化报告
    const standardizationReport = this.generateStandardizationReport(
      cleanedData,
      timeFormat,
      coordinateSystem,
      units,
    );

    return {
      timeFormat,
      coordinateSystem,
      units,
      standardizationReport,
    };
  }

  /**
   * 统一时间格式
   */
  private async unifyTimeFormat(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const standardized: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (this.isTimeField(key)) {
        if (typeof value === 'string') {
          try {
            // 尝试解析为 ISO 8601 格式
            standardized[key] = new Date(value).toISOString();
          } catch {
            standardized[key] = value;
          }
        } else if (value instanceof Date) {
          standardized[key] = value.toISOString();
        } else {
          standardized[key] = value;
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // 递归处理嵌套对象
        standardized[key] = await this.unifyTimeFormat(value);
      } else {
        standardized[key] = value;
      }
    }

    return standardized;
  }

  /**
   * 统一地理坐标系
   */
  private async unifyCoordinateSystem(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const standardized: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (this.isCoordinateField(key)) {
        // 确保坐标值在合理范围内
        if (typeof value === 'number') {
          if (key === 'latitude' || key === 'lat') {
            standardized[key] = Math.max(-90, Math.min(90, value));
          } else if (key === 'longitude' || key === 'lng' || key === 'lon') {
            standardized[key] = Math.max(-180, Math.min(180, value));
          } else {
            standardized[key] = value;
          }
        } else if (typeof value === 'object' && value !== null) {
          // 处理坐标对象
          standardized[key] = await this.unifyCoordinateSystem(value);
        } else {
          standardized[key] = value;
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // 递归处理嵌套对象
        standardized[key] = await this.unifyCoordinateSystem(value);
      } else {
        standardized[key] = value;
      }
    }

    return standardized;
  }

  /**
   * 统一单位
   */
  private async unifyUnits(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const standardized: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (this.isUnitField(key)) {
        // 统一单位（例如：距离统一为米，时间统一为秒）
        if (typeof value === 'number') {
          standardized[key] = this.convertToStandardUnit(key, value);
        } else if (typeof value === 'object' && value !== null && 'value' in value && 'unit' in value) {
          // 处理带单位的值对象
          const valueObj = value as { value: unknown; unit: string };
          if (typeof valueObj.value === 'number') {
            standardized[key] = this.convertToStandardUnit(key, valueObj.value, valueObj.unit);
          } else {
            standardized[key] = value;
          }
        } else {
          standardized[key] = value;
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // 递归处理嵌套对象
        standardized[key] = await this.unifyUnits(value);
      } else {
        standardized[key] = value;
      }
    }

    return standardized;
  }

  /**
   * 生成标准化报告
   */
  private generateStandardizationReport(
    cleanedData: CleanedData,
    timeFormat: any,
    coordinateSystem: any,
    units: any,
  ): StandardizedData['standardizationReport'] {
    const timeFormatIssues = this.countTimeFormatIssues(cleanedData.formatStandardized, timeFormat);
    const coordinateSystemIssues = this.countCoordinateSystemIssues(timeFormat, coordinateSystem);
    const unitIssues = this.countUnitIssues(coordinateSystem, units);

    return {
      timeFormatIssues,
      coordinateSystemIssues,
      unitIssues,
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 判断是否为时间字段
   */
  private isTimeField(field: string): boolean {
    const timeFields = [
      'timestamp',
      'createdAt',
      'updatedAt',
      'startDate',
      'endDate',
      'date',
      'time',
      'datetime',
      'collectedAt',
      'processedAt',
    ];
    return timeFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
  }

  /**
   * 判断是否为坐标字段
   */
  private isCoordinateField(field: string): boolean {
    const coordinateFields = ['latitude', 'lat', 'longitude', 'lng', 'lon', 'coordinates', 'location'];
    return coordinateFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
  }

  /**
   * 判断是否为单位字段
   */
  private isUnitField(field: string): boolean {
    const unitFields = ['distance', 'duration', 'speed', 'temperature', 'weight', 'height', 'width'];
    return unitFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
  }

  /**
   * 转换为标准单位
   */
  private convertToStandardUnit(field: string, value: number, sourceUnit?: string): number {
    // 距离：统一为米
    if (field.toLowerCase().includes('distance')) {
      if (sourceUnit === 'km' || sourceUnit === 'kilometer') {
        return value * 1000;
      } else if (sourceUnit === 'mile' || sourceUnit === 'mi') {
        return value * 1609.34;
      }
      return value; // 假设已经是米
    }

    // 时间：统一为秒
    if (field.toLowerCase().includes('duration')) {
      if (sourceUnit === 'minute' || sourceUnit === 'min') {
        return value * 60;
      } else if (sourceUnit === 'hour' || sourceUnit === 'hr') {
        return value * 3600;
      } else if (sourceUnit === 'day') {
        return value * 86400;
      }
      return value; // 假设已经是秒
    }

    // 温度：统一为摄氏度
    if (field.toLowerCase().includes('temperature')) {
      if (sourceUnit === 'fahrenheit' || sourceUnit === 'f') {
        return (value - 32) * (5 / 9);
      } else if (sourceUnit === 'kelvin' || sourceUnit === 'k') {
        return value - 273.15;
      }
      return value; // 假设已经是摄氏度
    }

    return value;
  }

  /**
   * 统计时间格式问题数量
   */
  private countTimeFormatIssues(before: any, after: any): number {
    let count = 0;
    const traverse = (b: any, a: any) => {
      if (typeof b === 'object' && b !== null) {
        for (const key in b) {
          if (this.isTimeField(key) && b[key] !== a[key]) {
            count++;
          } else if (typeof b[key] === 'object') {
            traverse(b[key], a[key]);
          }
        }
      }
    };
    traverse(before, after);
    return count;
  }

  /**
   * 统计坐标系问题数量
   */
  private countCoordinateSystemIssues(before: any, after: any): number {
    let count = 0;
    const traverse = (b: any, a: any) => {
      if (typeof b === 'object' && b !== null) {
        for (const key in b) {
          if (this.isCoordinateField(key) && typeof b[key] === 'number' && b[key] !== a[key]) {
            count++;
          } else if (typeof b[key] === 'object') {
            traverse(b[key], a[key]);
          }
        }
      }
    };
    traverse(before, after);
    return count;
  }

  /**
   * 统计单位问题数量
   */
  private countUnitIssues(before: any, after: any): number {
    let count = 0;
    const traverse = (b: any, a: any) => {
      if (typeof b === 'object' && b !== null) {
        for (const key in b) {
          if (this.isUnitField(key) && typeof b[key] === 'number' && b[key] !== a[key]) {
            count++;
          } else if (typeof b[key] === 'object') {
            traverse(b[key], a[key]);
          }
        }
      }
    };
    traverse(before, after);
    return count;
  }
}
