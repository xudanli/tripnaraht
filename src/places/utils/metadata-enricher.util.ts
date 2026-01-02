// src/places/utils/metadata-enricher.util.ts

import { PlaceMetadata } from '../interfaces/place-metadata.interface';
import { OsmOpeningHoursParser } from '../../common/utils/osm-opening-hours-parser.util';

/**
 * Metadata Enricher 工具类
 * 
 * 用于增强 Place 的 metadata，包括：
 * - OSM opening_hours 解析
 * - business_status 设置
 * - 其他 metadata 字段的标准化处理
 */
export class MetadataEnricher {
  /**
   * 增强 metadata（解析 OSM opening_hours 等）
   * 
   * @param metadata 原始 metadata
   * @returns 增强后的 metadata
   */
  static enrich(metadata: PlaceMetadata | any): PlaceMetadata {
    const enriched: PlaceMetadata = { ...metadata };

    // 1. 解析 OSM opening_hours（如果存在）
    if (!enriched.openingHours) {
      const osmHours = this.extractOsmOpeningHours(metadata);
      if (osmHours) {
        const parsed = OsmOpeningHoursParser.parse(osmHours);
        if (parsed) {
          enriched.openingHours = parsed;
        }
      }
    }

    // 2. 标准化 business_status（如果缺失）
    if (!enriched.business_status) {
      // 可以根据 openingHours 推断，但更准确的是从数据源获取
      // 这里暂时不自动设置，需要在数据导入时明确设置
    }

    return enriched;
  }

  /**
   * 从 metadata 中提取 OSM opening_hours 字符串
   */
  private static extractOsmOpeningHours(metadata: any): string | null {
    if (!metadata) return null;

    // 优先从 rawTags.opening_hours 获取（OSM 标准字段）
    if (metadata.rawTags?.opening_hours) {
      return metadata.rawTags.opening_hours;
    }

    // 从 metadata.opening_hours 获取
    if (metadata.opening_hours) {
      return metadata.opening_hours;
    }

    // 从 metadata.openingHours.osmFormat 获取（如果已经存在）
    if (metadata.openingHours?.osmFormat) {
      return metadata.openingHours.osmFormat;
    }

    return null;
  }

  /**
   * 合并两个 metadata 对象
   * 新值覆盖旧值，但保留 openingHours 的现有结构
   */
  static merge(oldMetadata: PlaceMetadata | any, newMetadata: PlaceMetadata | any): PlaceMetadata {
    const merged: PlaceMetadata = {
      ...oldMetadata,
      ...newMetadata,
    };

    // 特殊处理 openingHours：合并而不是覆盖
    if (oldMetadata?.openingHours && newMetadata?.openingHours) {
      merged.openingHours = {
        ...oldMetadata.openingHours,
        ...newMetadata.openingHours,
      };
    }

    return merged;
  }
}

