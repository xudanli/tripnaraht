// src/providers/poi/poi.provider.interface.ts

import type { PoiCandidate } from '../../assist/dto/action.dto';

// Re-export for convenience
export type { PoiCandidate };

/**
 * POI 搜索提供者接口
 * 
 * 支持多种 POI 数据源（Google Places、OSM、Mock）
 */
export interface PoiProvider {
  /**
   * 文本搜索 POI
   * 
   * @param args 搜索参数
   * @returns POI 候选列表
   */
  textSearch(args: {
    query: string;
    lat: number;
    lng: number;
    radiusM?: number;  // 搜索半径（米），默认 1000
    language?: string; // 语言代码
    types?: string[];  // POI 类型过滤（如 ['restaurant', 'cafe']）
  }): Promise<PoiCandidate[]>;

  /**
   * 附近搜索 POI
   * 
   * @param args 搜索参数
   * @returns POI 候选列表
   */
  nearbySearch?(args: {
    lat: number;
    lng: number;
    radiusM?: number;
    type?: string;  // POI 类型（如 'restaurant', 'cafe'）
    keyword?: string; // 关键词
    language?: string;
  }): Promise<PoiCandidate[]>;
}
