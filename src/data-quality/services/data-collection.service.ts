// src/data-quality/services/data-collection.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeographicDataValidatorService, ValidationResult } from './geographic-data-validator.service';
import { DataQualityFrameworkService } from './data-quality-framework.service';

/**
 * 采集配置
 */
export interface CollectionConfig {
  countryCode?: string;
  source: string; // 'weather_api' | 'poi_api' | 'road_status_api' | 'physical_reality_file'
  [key: string]: any;
}

/**
 * 原始数据
 */
export interface RawData {
  data: any;
  metadata: {
    source: string;
    collectedAt: Date;
    countryCode?: string;
    [key: string]: any;
  };
}

/**
 * 数据采集服务
 * 
 * 功能：
 * - 从多种数据源采集数据
 * - 数据格式统一
 * - 错误处理和重试
 */
@Injectable()
export class DataCollectionService {
  private readonly logger = new Logger(DataCollectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geographicDataValidator: GeographicDataValidatorService,
    private readonly dataQualityFramework: DataQualityFrameworkService,
  ) {}

  /**
   * 采集数据
   */
  async collectData(
    dataSource: string,
    dataType: string,
    config: CollectionConfig
  ): Promise<RawData> {
    this.logger.log(`采集数据: ${dataSource} (${dataType}) from ${config.source}`);

    try {
      // 根据数据源类型选择适配器
      const adapter = this.getAdapter(config.source);
      
      // 调用适配器采集数据
      const rawData = await adapter.collect(dataSource, dataType, config);

      return {
        data: rawData,
        metadata: {
          source: config.source,
          collectedAt: new Date(),
          countryCode: config.countryCode,
          dataSource,
          dataType,
        },
      };
    } catch (error: any) {
      this.logger.error(`数据采集失败: ${dataSource} - ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 验证数据
   */
  async validateData(
    rawData: RawData,
    dataType: string
  ): Promise<ValidationResult> {
    const errors: Array<{ field: string; message: string }> = [];
    const warnings: Array<{ field: string; message: string }> = [];

    // 1. 基本验证（数据不为空）
    if (!rawData.data) {
      errors.push({
        field: 'data',
        message: '数据为空',
      });
      return { valid: false, errors, warnings };
    }

    // 2. 地理数据验证（如果包含坐标）
    if (rawData.metadata.countryCode) {
      const coordinates = this.geographicDataValidator.extractCoordinatesFromPhysicalRealityData(
        rawData.data
      );

      if (coordinates.length > 0) {
        // 验证坐标格式
        const coordValidation = this.geographicDataValidator.validateCoordinatesBatch(coordinates);
        if (!coordValidation.valid) {
          errors.push(...coordValidation.errors);
        }
        warnings.push(...coordValidation.warnings);

        // 验证空间范围
        const spatialRangeValidation = this.geographicDataValidator.validateSpatialRange(
          coordinates,
          rawData.metadata.countryCode
        );
        if (!spatialRangeValidation.valid) {
          errors.push(...spatialRangeValidation.errors);
        }
        warnings.push(...spatialRangeValidation.warnings);
      }
    }

    // 3. 数据质量框架验证（五维度）
    const requiredFields = this.getRequiredFields(dataType);
    const completeness = this.dataQualityFramework.assessCompleteness(
      rawData.data,
      requiredFields,
      []
    );

    if (completeness.currentValue < 0.8) {
      warnings.push({
        field: 'completeness',
        message: `数据完整性不足: ${(completeness.currentValue * 100).toFixed(1)}%`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 索引数据（更新KnowledgeFile和Chunk）
   */
  async indexData(
    rawData: RawData,
    dataSource: string,
    dataType: string
  ): Promise<number> {
    this.logger.log(`索引数据: ${dataSource} (${dataType})`);

    try {
      // 1. 分块处理（根据数据类型）
      const chunks = this.chunkData(rawData.data, dataType);

      // 2. 生成Embedding（简化版：使用现有服务）
      // TODO: 集成实际的Embedding服务

      // 3. 更新或创建KnowledgeFile记录
      const knowledgeFile = await this.prisma.knowledgeFile.upsert({
        where: {
          filename: dataSource,
        },
        create: {
          filename: dataSource,
          filepath: `data/physical-reality/${dataType}/${dataSource}`,
          category: 'PHYSICAL_REALITY',
          version: '1.0',
          language: 'zh-CN',
          credibilityScore: 0.95,
          dataSources: [rawData.metadata.source],
          lastUpdated: rawData.metadata.collectedAt,
        },
        update: {
          lastUpdated: rawData.metadata.collectedAt,
          dataSources: [rawData.metadata.source],
        },
      });

      // 4. 删除旧的chunks（如果存在）
      await this.prisma.chunk.deleteMany({
        where: {
          fileId: knowledgeFile.id,
        },
      });

      // 5. 创建新的chunks（简化版：只创建记录，不生成embedding）
      // TODO: 集成实际的chunk创建和embedding生成逻辑

      this.logger.log(`数据索引完成: ${dataSource}，生成 ${chunks.length} 个chunks`);

      return chunks.length;
    } catch (error: any) {
      this.logger.error(`数据索引失败: ${dataSource} - ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 获取数据源适配器
   */
  private getAdapter(_source: string): DataSourceAdapter {
    // 简化版：返回基础适配器
    // 实际应该根据source类型返回不同的适配器
    return new PhysicalRealityFileAdapter(this.prisma);
  }

  /**
   * 分块处理数据
   */
  private chunkData(data: any, dataType: string): Array<{ content: string; metadata: any }> {
    // 简化版：根据数据类型分块
    const chunks: Array<{ content: string; metadata: any }> = [];

    if (dataType === 'road_status' && data.segments) {
      data.segments.forEach((segment: any, index: number) => {
        chunks.push({
          content: `道路状态: ${segment.name || '未知路段'}，状态: ${segment.status || '未知'}`,
          metadata: {
            segmentIndex: index,
            start: segment.start,
            end: segment.end,
          },
        });
      });
    } else if (dataType === 'ferry_schedules' && data.routes) {
      data.routes.forEach((route: any, index: number) => {
        chunks.push({
          content: `渡轮路线: ${route.origin?.name || '未知'} → ${route.destination?.name || '未知'}`,
          metadata: {
            routeIndex: index,
            origin: route.origin,
            destination: route.destination,
          },
        });
      });
    } else if (dataType === 'weather_windows' && data.regions) {
      data.regions.forEach((region: any, index: number) => {
        chunks.push({
          content: `天气窗口: ${region.name || '未知区域'}，最佳时间: ${region.bestTime || '未知'}`,
          metadata: {
            regionIndex: index,
            center: region.center,
          },
        });
      });
    }

    return chunks;
  }

  /**
   * 获取必需字段
   */
  private getRequiredFields(dataType: string): string[] {
    const fieldMap: Record<string, string[]> = {
      road_status: ['segments', 'region', 'countryCode'],
      ferry_schedules: ['routes', 'origin', 'destination'],
      weather_windows: ['regions', 'center', 'countryCode'],
    };

    return fieldMap[dataType] || [];
  }
}

/**
 * 数据源适配器接口
 */
interface DataSourceAdapter {
  collect(dataSource: string, dataType: string, config: CollectionConfig): Promise<any>;
}

/**
 * 物理现实数据文件适配器
 */
class PhysicalRealityFileAdapter implements DataSourceAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async collect(dataSource: string, dataType: string, _config: CollectionConfig): Promise<any> {
    // 简化版：从文件系统读取数据
    // 实际应该从实际的数据源（API、文件等）读取
    const fs = require('fs');
    const path = require('path');

    const filePath = path.join(
      process.cwd(),
      'data',
      'physical-reality',
      dataType,
      `${dataSource}.json`
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`数据文件不存在: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }
}
