// src/places/services/overpass.service.ts
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

/**
 * Overpass API 服务
 * 
 * 功能：
 * 1. 根据国家代码获取旅游景点（tourism）
 * 2. 支持过滤特定类型的景点（attraction, viewpoint, museum 等）
 * 3. 解析并格式化 OSM 数据
 * 
 * API 文档：
 * - Overpass API: https://wiki.openstreetmap.org/wiki/Overpass_API
 * - Overpass Turbo: https://overpass-turbo.eu/
 */
@Injectable()
export class OverpassService {
  private readonly logger = new Logger(OverpassService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://overpass-api.de/api/interpreter';

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 120000, // 120 秒超时（Overpass 查询可能较慢）
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'TripNARA/1.0 (tripnara@example.com)',
      },
    });
  }

  /**
   * 获取指定国家的旅游景点
   * 
   * @param countryCode ISO 3166-1 国家代码（如 'IS' 表示冰岛）
   * @param tourismTypes 旅游类型过滤（可选，如 ['attraction', 'viewpoint', 'museum']）
   * @returns 景点列表
   */
  async fetchAttractionsByCountry(
    countryCode: string,
    tourismTypes?: string[]
  ): Promise<OverpassPOI[]> {
    try {
      // 构建 Overpass 查询
      const query = this.buildQuery(countryCode, tourismTypes);
      
      this.logger.log(`正在从 Overpass 获取 ${countryCode} 的景点数据...`);

      // 发送请求
      const response = await this.axiosInstance.post(
        this.baseUrl,
        `data=${encodeURIComponent(query)}`
      );

      const elements = response.data?.elements || [];
      
      this.logger.log(`成功获取 ${elements.length} 个景点`);

      // 解析并映射数据
      return elements.map((el: any) => this.mapOverpassElementToPoi(el));
    } catch (error: any) {
      this.logger.error(
        `获取 ${countryCode} 景点数据失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 构建 Overpass 查询语句
   */
  private buildQuery(countryCode: string, tourismTypes?: string[]): string {
    // 如果指定了类型，使用正则表达式匹配
    const tourismFilter = tourismTypes && tourismTypes.length > 0
      ? `["tourism"~"${tourismTypes.join('|')}"]`
      : '["tourism"]';

    return `
      [out:json][timeout:60];
      area["ISO3166-1"="${countryCode}"][admin_level=2]->.searchArea;
      (
        node${tourismFilter}(area.searchArea);
        way${tourismFilter}(area.searchArea);
        relation${tourismFilter}(area.searchArea);
      );
      out center;
    `.trim();
  }

  /**
   * 将 Overpass 元素映射为 POI 对象
   */
  private mapOverpassElementToPoi(el: any): OverpassPOI {
    // 判断是否为面（way/relation），如果是则使用 center，否则使用 lat/lon
    const isArea = !!el.center;
    const lat = isArea ? el.center.lat : el.lat;
    const lng = isArea ? el.center.lon : el.lon;

    // 提取名称（优先使用 name:en，其次使用 name）
    const name = el.tags?.name || el.tags?.['name:en'] || 'Unnamed place';
    const nameEn = el.tags?.['name:en'] || el.tags?.name;

    // 提取类型
    const category = el.tags?.tourism || el.tags?.amenity || el.tags?.natural || 'other';
    const type = el.tags?.tourism || el.tags?.amenity || el.tags?.natural || 'other';

    return {
      osmId: el.id,
      osmType: el.type,
      name,
      nameEn,
      lat,
      lng,
      category,
      type,
      rawTags: el.tags || {},
    };
  }
}

/**
 * Overpass POI 数据结构
 */
export interface OverpassPOI {
  osmId: number;
  osmType: 'node' | 'way' | 'relation';
  name: string;
  nameEn?: string;
  lat: number;
  lng: number;
  category: string; // tourism, amenity, natural 等
  type: string;     // attraction, museum, viewpoint 等
  rawTags: Record<string, string>;
}
