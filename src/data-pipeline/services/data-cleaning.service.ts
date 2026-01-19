// src/data-pipeline/services/data-cleaning.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { CleanedData } from '../interfaces/data-pipeline.interface';

/**
 * 数据清洗服务
 * 
 * 提供数据清洗功能：
 * - 处理缺失值
 * - 处理异常值
 * - 标准化格式
 */
@Injectable()
export class DataCleaningService {
  private readonly logger = new Logger(DataCleaningService.name);

  /**
   * 清洗数据
   */
  async cleanData(rawData: any): Promise<CleanedData> {
    this.logger.log('Starting data cleaning process');

    // 处理缺失值
    const missingValuesHandled = await this.handleMissingValues(rawData);

    // 处理异常值
    const outliersHandled = await this.handleOutliers(missingValuesHandled);

    // 标准化格式
    const formatStandardized = await this.standardizeFormat(outliersHandled);

    // 生成清洗报告
    const cleaningReport = this.generateCleaningReport(
      rawData,
      missingValuesHandled,
      outliersHandled,
      formatStandardized,
    );

    return {
      missingValuesHandled,
      outliersHandled,
      formatStandardized,
      cleaningReport,
    };
  }

  /**
   * 处理缺失值
   */
  private async handleMissingValues(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const cleaned: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined || value === '') {
        // 关键字段：拒绝或使用默认值
        if (this.isCriticalField(key)) {
          cleaned[key] = this.getDefaultValue(key);
        } else {
          // 非关键字段：标记为缺失
          cleaned[key] = null;
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // 递归处理嵌套对象
        cleaned[key] = await this.handleMissingValues(value);
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  /**
   * 处理异常值
   */
  private async handleOutliers(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const cleaned: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number') {
        // 检查数值是否在合理范围内
        if (this.isOutlier(key, value)) {
          this.logger.warn(`Outlier detected: ${key} = ${value}`);
          // 标记为可疑，需要人工审查
          cleaned[key] = {
            value,
            flagged: true,
            reason: 'outlier',
          };
        } else {
          cleaned[key] = value;
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // 递归处理嵌套对象
        cleaned[key] = await this.handleOutliers(value);
      } else {
        cleaned[key] = value;
      }
    }

    return cleaned;
  }

  /**
   * 标准化格式
   */
  private async standardizeFormat(data: any): Promise<any> {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const standardized: any = Array.isArray(data) ? [] : {};

    for (const [key, value] of Object.entries(data)) {
      if (value instanceof Date) {
        // 统一时间格式为 ISO 8601
        standardized[key] = value.toISOString();
      } else if (typeof value === 'string' && this.isDateString(value)) {
        // 尝试解析日期字符串
        try {
          standardized[key] = new Date(value).toISOString();
        } catch {
          standardized[key] = value;
        }
      } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        // 递归处理嵌套对象
        standardized[key] = await this.standardizeFormat(value);
      } else {
        standardized[key] = value;
      }
    }

    return standardized;
  }

  /**
   * 生成清洗报告
   */
  private generateCleaningReport(
    rawData: any,
    missingValuesHandled: any,
    outliersHandled: any,
    formatStandardized: any,
  ): CleanedData['cleaningReport'] {
    const missingValuesCount = this.countMissingValues(rawData, missingValuesHandled);
    const outliersCount = this.countOutliers(outliersHandled);
    const formatIssuesCount = this.countFormatIssues(rawData, formatStandardized);

    return {
      missingValuesCount,
      outliersCount,
      formatIssuesCount,
    };
  }

  // ========== 辅助方法 ==========

  /**
   * 判断是否为关键字段
   */
  private isCriticalField(field: string): boolean {
    const criticalFields = ['id', 'userId', 'tripId', 'destination', 'startDate', 'endDate'];
    return criticalFields.includes(field);
  }

  /**
   * 获取默认值
   */
  private getDefaultValue(field: string): any {
    const defaults: Record<string, any> = {
      id: null, // ID 不能有默认值
      userId: null,
      tripId: null,
      destination: '',
      startDate: null,
      endDate: null,
    };
    return defaults[field] ?? null;
  }

  /**
   * 判断是否为异常值
   */
  private isOutlier(field: string, value: number): boolean {
    // 简单的异常值检测：基于字段的合理范围
    const ranges: Record<string, { min: number; max: number }> = {
      latitude: { min: -90, max: 90 },
      longitude: { min: -180, max: 180 },
      temperature: { min: -50, max: 50 },
      duration: { min: 0, max: 86400 }, // 秒
      distance: { min: 0, max: 100000 }, // 米
    };

    const range = ranges[field];
    if (!range) {
      return false; // 未知字段，不判断为异常值
    }

    return value < range.min || value > range.max;
  }

  /**
   * 判断是否为日期字符串
   */
  private isDateString(value: string): boolean {
    // 简单的日期字符串检测
    return /^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{4}\/\d{2}\/\d{2}/.test(value);
  }

  /**
   * 统计缺失值数量
   */
  private countMissingValues(rawData: any, cleanedData: any): number {
    let count = 0;
    const traverse = (raw: any, cleaned: any) => {
      if (typeof raw === 'object' && raw !== null) {
        for (const key in raw) {
          if (raw[key] === null || raw[key] === undefined || raw[key] === '') {
            if (cleaned[key] === null || cleaned[key] === undefined) {
              count++;
            }
          } else if (typeof raw[key] === 'object') {
            traverse(raw[key], cleaned[key]);
          }
        }
      }
    };
    traverse(rawData, cleanedData);
    return count;
  }

  /**
   * 统计异常值数量
   */
  private countOutliers(data: any): number {
    let count = 0;
    const traverse = (obj: any) => {
      if (typeof obj === 'object' && obj !== null) {
        for (const value of Object.values(obj)) {
          if (typeof value === 'object' && value !== null && 'flagged' in value && value.flagged) {
            count++;
          } else if (typeof value === 'object') {
            traverse(value);
          }
        }
      }
    };
    traverse(data);
    return count;
  }

  /**
   * 统计格式问题数量
   */
  private countFormatIssues(rawData: any, standardizedData: any): number {
    // 简化实现：比较日期字段的格式变化
    let count = 0;
    const traverse = (raw: any, std: any) => {
      if (typeof raw === 'object' && raw !== null) {
        for (const key in raw) {
          if (raw[key] instanceof Date && typeof std[key] === 'string') {
            count++;
          } else if (typeof raw[key] === 'object') {
            traverse(raw[key], std[key]);
          }
        }
      }
    };
    traverse(rawData, standardizedData);
    return count;
  }
}
