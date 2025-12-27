// src/poi/services/poi-layer.service.ts
/**
 * POI 分层服务
 * 
 * P2.1: POI 的正确分层
 * 
 * 功能：
 * 1. 区分静态、半动态、高度动态的POI数据
 * 2. 在路线生成时只使用静态和半动态层
 * 3. 提供数据层查询和管理功能
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  POILayerType,
  POIStaticData,
  POISemiDynamicData,
  POIHighlyDynamicData,
  RouteGenerationPOIData,
  CompletePOIData,
  POILayerMetadata,
} from '../interfaces/poi-layer.interface';

@Injectable()
export class POILayerService {
  private readonly logger = new Logger(POILayerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取用于路线生成的POI数据（只包含静态和半动态层）
   * 
   * @param poiIds POI ID列表
   * @returns 路线生成用的POI数据
   */
  async getPOIsForRouteGeneration(poiIds: string[]): Promise<RouteGenerationPOIData[]> {
    this.logger.log(`获取 ${poiIds.length} 个POI用于路线生成（静态+半动态层）`);

    const pois: RouteGenerationPOIData[] = [];

    for (const poiId of poiIds) {
      try {
        const poi = await this.getPOIForRouteGeneration(poiId);
        if (poi) {
          pois.push(poi);
        }
      } catch (error) {
        this.logger.warn(`获取POI ${poiId} 失败: ${error}`);
      }
    }

    return pois;
  }

  /**
   * 获取单个POI用于路线生成（只包含静态和半动态层）
   */
  async getPOIForRouteGeneration(poiId: string): Promise<RouteGenerationPOIData | null> {
    // 1. 获取静态层数据（从poi_canonical表）
    const staticData = await this.getStaticLayerData(poiId);
    if (!staticData) {
      return null;
    }

    // 2. 获取半动态层数据（从poi_canonical表的opening_hours等字段）
    const semiDynamicData = await this.getSemiDynamicLayerData(poiId);

    return {
      static: staticData,
      semiDynamic: semiDynamicData || undefined,
    };
  }

  /**
   * 获取完整的POI数据（包含所有层）
   */
  async getCompletePOI(poiId: string): Promise<CompletePOIData | null> {
    const staticData = await this.getStaticLayerData(poiId);
    if (!staticData) {
      return null;
    }

    const semiDynamicData = await this.getSemiDynamicLayerData(poiId);
    const highlyDynamicData = await this.getHighlyDynamicLayerData(poiId);

    return {
      static: staticData,
      semiDynamic: semiDynamicData || undefined,
      highlyDynamic: highlyDynamicData || undefined,
    };
  }

  /**
   * 获取静态层数据
   */
  private async getStaticLayerData(poiId: string): Promise<POIStaticData | null> {
    try {
      const poi = await this.prisma.poi_canonical.findUnique({
        where: { poi_id: poiId },
      });

      if (!poi) {
        return null;
      }

      return {
        id: poi.poi_id,
        name: poi.name_default || '未命名',
        nameI18n: poi.name_i18n as Record<string, string> | undefined,
        location: {
          lat: poi.lat,
          lng: poi.lng,
          geom: (poi as any).geom,
          address: poi.address || undefined,
          regionKey: poi.region_key || undefined,
          regionName: poi.region_name || undefined,
        },
        category: poi.category,
        tags: this.extractTags(poi.tags_slim),
        source: poi.source,
        externalId: poi.source_key,
        createdAt: poi.created_at || new Date(),
        updatedAt: poi.updated_at || new Date(),
      };
    } catch (error) {
      this.logger.error(`获取静态层数据失败 (${poiId}): ${error}`);
      return null;
    }
  }

  /**
   * 获取半动态层数据
   */
  private async getSemiDynamicLayerData(poiId: string): Promise<POISemiDynamicData | null> {
    try {
      const poi = await this.prisma.poi_canonical.findUnique({
        where: { poi_id: poiId },
        select: {
          poi_id: true,
          opening_hours: true,
          phone: true,
          website: true,
          updated_at: true,
        },
      });

      if (!poi) {
        return null;
      }

      const semiDynamic: POISemiDynamicData = {
        poiId: poi.poi_id,
        updatedAt: poi.updated_at || new Date(),
      };

      // 解析开放时间
      if (poi.opening_hours) {
        semiDynamic.openingHours = {
          raw: poi.opening_hours,
          // 可以在这里添加结构化解析逻辑
        };
      }

      // 联系方式
      if (poi.phone || poi.website) {
        semiDynamic.contact = {
          phone: poi.phone || undefined,
          website: poi.website || undefined,
        };
      }

      return semiDynamic;
    } catch (error) {
      this.logger.error(`获取半动态层数据失败 (${poiId}): ${error}`);
      return null;
    }
  }

  /**
   * 获取高度动态层数据
   * 
   * 注意：高度动态层数据通常来自外部API或实时服务
   * 这里提供一个框架，实际实现需要接入相应的数据源
   */
  private async getHighlyDynamicLayerData(poiId: string): Promise<POIHighlyDynamicData | null> {
    // TODO: 实现高度动态层数据获取
    // 可以从以下来源获取：
    // 1. 实时API（如Google Places API的实时数据）
    // 2. 缓存服务（如Redis）
    // 3. 外部服务（如拥挤度预测服务）
    
    this.logger.debug(`高度动态层数据获取未实现 (${poiId})`);
    return null;
  }

  /**
   * 从tags_slim中提取标签数组
   */
  private extractTags(tagsSlim: any): string[] {
    if (!tagsSlim || typeof tagsSlim !== 'object') {
      return [];
    }

    const tags: string[] = [];

    // 提取常见的标签
    const tagKeys = [
      'amenity',
      'tourism',
      'leisure',
      'shop',
      'historic',
      'natural',
      'waterway',
      'highway',
    ];

    for (const key of tagKeys) {
      if (tagsSlim[key]) {
        tags.push(`${key}:${tagsSlim[key]}`);
      }
    }

    // 提取其他标签
    for (const [key, value] of Object.entries(tagsSlim)) {
      if (!tagKeys.includes(key) && typeof value === 'string') {
        tags.push(`${key}:${value}`);
      }
    }

    return tags;
  }

  /**
   * 获取POI数据层元数据
   */
  async getPOILayerMetadata(poiId: string): Promise<POILayerMetadata[]> {
    const metadata: POILayerMetadata[] = [];

    // 静态层元数据
    const staticData = await this.getStaticLayerData(poiId);
    if (staticData) {
      metadata.push({
        layerType: POILayerType.STATIC,
        source: staticData.source,
        updateFrequency: 'static',
        lastUpdated: staticData.updatedAt,
        qualityScore: this.calculateQualityScore(staticData),
        usableForRouteGeneration: true,
      });
    }

    // 半动态层元数据
    const semiDynamicData = await this.getSemiDynamicLayerData(poiId);
    if (semiDynamicData) {
      metadata.push({
        layerType: POILayerType.SEMI_DYNAMIC,
        source: 'poi_canonical',
        updateFrequency: 'daily',
        lastUpdated: semiDynamicData.updatedAt,
        qualityScore: this.calculateSemiDynamicQualityScore(semiDynamicData),
        usableForRouteGeneration: true,
      });
    }

    // 高度动态层元数据
    const highlyDynamicData = await this.getHighlyDynamicLayerData(poiId);
    if (highlyDynamicData) {
      metadata.push({
        layerType: POILayerType.HIGHLY_DYNAMIC,
        source: 'external_api',
        updateFrequency: 'realtime',
        lastUpdated: highlyDynamicData.updatedAt,
        usableForRouteGeneration: false, // 高度动态层不用于路线生成
      });
    }

    return metadata;
  }

  /**
   * 计算静态层数据质量评分
   */
  private calculateQualityScore(staticData: POIStaticData): number {
    let score = 0;

    // 名称（20分）
    if (staticData.name && staticData.name !== '未命名') {
      score += 20;
    }

    // 位置（30分）
    if (staticData.location.lat && staticData.location.lng) {
      score += 30;
    }

    // 分类（20分）
    if (staticData.category) {
      score += 20;
    }

    // 标签（20分）
    if (staticData.tags.length > 0) {
      score += Math.min(20, staticData.tags.length * 5);
    }

    // 地址（10分）
    if (staticData.location.address) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * 计算半动态层数据质量评分
   */
  private calculateSemiDynamicQualityScore(semiDynamicData: POISemiDynamicData): number {
    let score = 0;

    // 开放时间（40分）
    if (semiDynamicData.openingHours) {
      score += 40;
    }

    // 联系方式（30分）
    if (semiDynamicData.contact) {
      if (semiDynamicData.contact.phone) score += 15;
      if (semiDynamicData.contact.website) score += 15;
    }

    // 价格信息（20分）
    if (semiDynamicData.pricing) {
      score += 20;
    }

    // 评分信息（10分）
    if (semiDynamicData.rating) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * 检查POI是否可用于路线生成
   * 
   * 规则：只使用静态和半动态层，排除高度动态层
   */
  isUsableForRouteGeneration(poiId: string): Promise<boolean> {
    return this.getPOIForRouteGeneration(poiId).then(poi => poi !== null);
  }

  /**
   * 批量检查POI是否可用于路线生成
   */
  async filterUsablePOIs(poiIds: string[]): Promise<string[]> {
    const usableIds: string[] = [];

    for (const poiId of poiIds) {
      const usable = await this.isUsableForRouteGeneration(poiId);
      if (usable) {
        usableIds.push(poiId);
      }
    }

    return usableIds;
  }
}


