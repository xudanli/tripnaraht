// src/places/services/mapbox.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * Mapbox API 服务
 * 
 * 功能：
 * 1. 根据国家代码获取旅游景点（使用 Mapbox Search API）
 * 2. 支持过滤特定类型的景点（attraction, museum, viewpoint 等）
 * 3. 解析并格式化 Mapbox 数据
 * 
 * API 文档：
 * - Mapbox Search API: https://docs.mapbox.com/api/search/search-box/
 * - Mapbox Geocoding API: https://docs.mapbox.com/api/search/geocoding/
 */
@Injectable()
export class MapboxService {
  private readonly logger = new Logger(MapboxService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly accessToken: string;
  private readonly baseUrl = 'https://api.mapbox.com';

  constructor(private configService: ConfigService) {
    // 支持多种环境变量名（VITE_ 前缀用于前端，后端直接使用）
    this.accessToken = 
      this.configService.get<string>('MAPBOX_ACCESS_TOKEN') || 
      this.configService.get<string>('VITE_MAPBOX_ACCESS_TOKEN') || 
      '';
    
    if (!this.accessToken) {
      this.logger.warn('MAPBOX_ACCESS_TOKEN 或 VITE_MAPBOX_ACCESS_TOKEN 未配置，Mapbox 功能将不可用');
    }

    this.axiosInstance = axios.create({
      timeout: 30000, // 30 秒超时
      headers: {
        'User-Agent': 'TripNARA/1.0',
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
  ): Promise<MapboxPOI[]> {
    if (!this.accessToken) {
      throw new Error('MAPBOX_ACCESS_TOKEN 未配置');
    }

    try {
      this.logger.log(`正在从 Mapbox 获取 ${countryCode} 的景点数据...`);

      // 获取国家边界框（使用 Mapbox Geocoding API）
      const countryBounds = await this.getCountryBounds(countryCode);
      
      // 构建搜索查询
      const query = this.buildSearchQuery(tourismTypes);
      
      // 使用 Mapbox Geocoding API 搜索景点
      // 由于 Mapbox Geocoding API 不支持直接按国家代码搜索，我们需要使用边界框
      const pois: MapboxPOI[] = [];
      
      // 使用主要城市进行搜索（更有效的方式）
      // 对于美国，搜索主要城市而不是整个国家边界框
      const majorCities = this.getMajorCitiesByCountry(countryCode);
      
      if (majorCities.length > 0) {
        // 对每个主要城市进行搜索
        for (const city of majorCities) {
          try {
            // 获取城市边界框
            const cityBounds = await this.getCityBounds(city.name, countryCode);
            
            // 对每种类型分别搜索
            if (tourismTypes && tourismTypes.length > 0) {
              for (const type of tourismTypes) {
                const results = await this.searchInBbox(
                  `${type} ${city.name}`,
                  cityBounds.bbox
                );
                pois.push(...results);
                // 添加延迟避免 API 限流
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            } else {
              const results = await this.searchInBbox(
                `${query} ${city.name}`,
                cityBounds.bbox
              );
              pois.push(...results);
              // 添加延迟避免 API 限流
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (error: any) {
            this.logger.warn(`搜索城市 ${city.name} 失败: ${error.message}`);
          }
        }
      } else {
        // 如果没有主要城市列表，使用边界框分片搜索
        const bbox = countryBounds.bbox;
        const latStep = (bbox[3] - bbox[1]) / 3; // 分成 3x3 网格
        const lngStep = (bbox[2] - bbox[0]) / 3;

        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const minLng = bbox[0] + j * lngStep;
            const maxLng = bbox[0] + (j + 1) * lngStep;
            const minLat = bbox[1] + i * latStep;
            const maxLat = bbox[1] + (i + 1) * latStep;
            
            if (tourismTypes && tourismTypes.length > 0) {
              for (const type of tourismTypes) {
                const results = await this.searchInBbox(
                  type,
                  [minLng, minLat, maxLng, maxLat]
                );
                pois.push(...results);
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            } else {
              const results = await this.searchInBbox(
                query,
                [minLng, minLat, maxLng, maxLat]
              );
              pois.push(...results);
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          }
        }
      }

      // 去重（基于坐标和名称）
      const uniquePois = this.deduplicatePois(pois);
      
      this.logger.log(`成功获取 ${uniquePois.length} 个景点`);
      
      return uniquePois;
    } catch (error: any) {
      this.logger.error(
        `获取 ${countryCode} 景点数据失败: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * 获取主要城市列表（用于更精确的搜索）
   */
  private getMajorCitiesByCountry(countryCode: string): Array<{ name: string; countryCode: string }> {
    const cityMap: Record<string, Array<{ name: string; countryCode: string }>> = {
      US: [
        { name: 'New York', countryCode: 'US' },
        { name: 'Los Angeles', countryCode: 'US' },
        { name: 'Chicago', countryCode: 'US' },
        { name: 'San Francisco', countryCode: 'US' },
        { name: 'Washington', countryCode: 'US' },
      ],
      IS: [
        { name: 'Reykjavik', countryCode: 'IS' },
      ],
      JP: [
        { name: 'Tokyo', countryCode: 'JP' },
        { name: 'Osaka', countryCode: 'JP' },
        { name: 'Kyoto', countryCode: 'JP' },
      ],
      GB: [
        { name: 'London', countryCode: 'GB' },
        { name: 'Manchester', countryCode: 'GB' },
        { name: 'Edinburgh', countryCode: 'GB' },
      ],
    };
    
    return cityMap[countryCode] || [];
  }

  /**
   * 获取城市的边界框
   */
  private async getCityBounds(cityName: string, countryCode: string): Promise<{
    bbox: [number, number, number, number];
    name: string;
  }> {
    try {
      const query = `${cityName}, ${countryCode}`;
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        {
          params: {
            access_token: this.accessToken,
            types: 'place',
            limit: 1,
          },
        }
      );

      const feature = response.data?.features?.[0];
      if (!feature || !feature.bbox) {
        // 如果没有边界框，使用中心点周围的小区域
        const [lng, lat] = feature?.geometry?.coordinates || [0, 0];
        return {
          bbox: [lng - 0.1, lat - 0.1, lng + 0.1, lat + 0.1] as [number, number, number, number],
          name: feature?.place_name || cityName,
        };
      }

      return {
        bbox: feature.bbox as [number, number, number, number],
        name: feature.place_name || cityName,
      };
    } catch (error: any) {
      this.logger.warn(`获取城市 ${cityName} 边界框失败: ${error.message}`);
      // 返回默认小区域
      return {
        bbox: [-74.0, 40.7, -73.9, 40.8] as [number, number, number, number], // 纽约默认
        name: cityName,
      };
    }
  }

  /**
   * 获取国家的边界框
   */
  private async getCountryBounds(countryCode: string): Promise<{
    bbox: [number, number, number, number];
    name: string;
  }> {
    try {
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/geocoding/v5/mapbox.places/${countryCode}.json`,
        {
          params: {
            access_token: this.accessToken,
            types: 'country',
          },
        }
      );

      const feature = response.data?.features?.[0];
      if (!feature || !feature.bbox) {
        throw new Error(`无法获取 ${countryCode} 的边界框`);
      }

      return {
        bbox: feature.bbox as [number, number, number, number],
        name: feature.place_name || countryCode,
      };
    } catch (error: any) {
      this.logger.error(`获取国家边界框失败: ${error.message}`);
      // 返回默认边界框（冰岛）
      return {
        bbox: [-25.0, 63.0, -13.0, 67.0],
        name: countryCode,
      };
    }
  }

  /**
   * 构建搜索查询
   * Mapbox Geocoding API 支持多种查询方式
   */
  private buildSearchQuery(tourismTypes?: string[]): string {
    if (tourismTypes && tourismTypes.length > 0) {
      // 使用更通用的搜索词
      // Mapbox 支持搜索特定类型的 POI
      const typeMap: Record<string, string> = {
        attraction: 'attraction',
        museum: 'museum',
        viewpoint: 'viewpoint',
        monument: 'monument',
        gallery: 'gallery',
        theater: 'theater',
      };
      
      const mappedTypes = tourismTypes
        .map(t => typeMap[t.toLowerCase()] || t)
        .filter(Boolean);
      
      // 使用第一个类型作为主要搜索词
      return mappedTypes[0] || 'attraction';
    }

    // 默认搜索旅游景点
    return 'attraction';
  }

  /**
   * 在指定边界框内搜索
   * 使用 Mapbox Geocoding API 搜索 POI
   */
  private async searchInBbox(
    query: string,
    bbox: [number, number, number, number]
  ): Promise<MapboxPOI[]> {
    try {
      // 使用 Mapbox Geocoding API 搜索 POI
      // 注意：Geocoding API 主要用于地理编码，但也可以搜索 POI
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        {
          params: {
            access_token: this.accessToken,
            bbox: bbox.join(','),
            limit: 50,
            types: 'poi', // 只搜索 POI
            language: 'en',
          },
        }
      );

      const features = response.data?.features || [];
      
      // 记录原始数据用于调试
      this.logger.debug(`Mapbox API 返回 ${features.length} 个结果`);
      
      // 放宽过滤条件，先获取所有 POI，然后在映射时处理
      return features
        .filter((feature: any) => {
          // 只过滤掉明显不是 POI 的结果
          const properties = feature.properties || {};
          const placeType = properties.place_type || [];
          
          // 如果是 POI 类型，或者包含在 place_type 中
          return placeType.includes('poi') || 
                 properties.category || 
                 properties.type ||
                 feature.id?.startsWith('poi');
        })
        .map((feature: any) => this.mapMapboxFeatureToPoi(feature))
        .filter((poi: MapboxPOI) => {
          // 在映射后过滤，确保有有效的类型信息
          return poi.category && poi.type;
        });
    } catch (error: any) {
      this.logger.warn(`搜索边界框失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 将 Mapbox 要素映射为 POI 对象
   */
  private mapMapboxFeatureToPoi(feature: any): MapboxPOI {
    const [lng, lat] = feature.geometry?.coordinates || [0, 0];
    const properties = feature.properties || {};
    const context = feature.context || [];

    // 提取名称（Mapbox 使用 text 字段作为主要名称）
    const name = properties.text || properties.name || feature.text || 'Unnamed place';
    const nameEn = properties.name_en || properties.name || name;

    // 提取类型（Mapbox 使用 category 或 type 字段）
    // Mapbox 的 category 可能是数组或字符串
    let category = 'tourism';
    let type = 'attraction';
    
    if (properties.category) {
      if (Array.isArray(properties.category)) {
        category = properties.category[0] || 'tourism';
        type = properties.category[0] || 'attraction';
      } else {
        category = properties.category;
        type = properties.category;
      }
    }
    
    if (properties.type) {
      type = properties.type;
    }
    
    // 从 place_type 中提取信息
    const placeType = feature.place_type || [];
    if (placeType.length > 0 && !category) {
      category = placeType[0];
      type = placeType[0];
    }

    // 提取国家代码
    const countryContext = context.find((ctx: any) => 
      ctx.id?.startsWith('country') || ctx.short_code
    );
    const countryCode = countryContext?.short_code?.toUpperCase() || 
                       countryContext?.iso_3166_1?.toUpperCase();

    // 生成兼容的 osmId（使用 mapboxId 的哈希值）
    const mapboxId = feature.id || feature.properties?.id || '';
    const osmId = this.hashStringToNumber(mapboxId);

    // 将 properties 映射为 rawTags（兼容 Overpass 格式）
    const rawTags: Record<string, string> = {};
    if (name) rawTags.name = name;
    if (nameEn && nameEn !== name) rawTags['name:en'] = nameEn;
    if (category) rawTags.tourism = category;
    if (type) rawTags.type = type;
    if (countryCode) rawTags['ISO3166-1'] = countryCode;
    
    // 添加其他有用的属性
    if (properties.address) rawTags.address = properties.address;
    if (properties.phone) rawTags.phone = properties.phone;
    if (properties.website) rawTags.website = properties.website;

    return {
      // Mapbox 特有字段
      mapboxId,
      countryCode,
      rawProperties: properties,
      rawContext: context,
      
      // 兼容 OverpassPOI 的字段
      osmId,
      osmType: 'node' as const,
      name,
      nameEn,
      lat,
      lng,
      category: typeof category === 'string' ? category : (category[0] || 'tourism'),
      type: typeof type === 'string' ? type : (type[0] || 'attraction'),
      rawTags,
    };
  }

  /**
   * 将字符串哈希为数字（用于生成兼容的 osmId）
   */
  private hashStringToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为 32 位整数
    }
    return Math.abs(hash);
  }

  /**
   * 去重 POI（基于坐标和名称）
   */
  private deduplicatePois(pois: MapboxPOI[]): MapboxPOI[] {
    const seen = new Set<string>();
    const unique: MapboxPOI[] = [];

    for (const poi of pois) {
      // 使用坐标和名称生成唯一键
      const key = `${poi.lat.toFixed(4)}_${poi.lng.toFixed(4)}_${poi.name}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(poi);
      }
    }

    return unique;
  }
}

/**
 * Mapbox POI 数据结构
 * 兼容 OverpassPOI 接口，便于替换
 */
export interface MapboxPOI {
  // Mapbox 特有字段
  mapboxId: string;
  countryCode?: string;
  rawProperties: Record<string, any>;
  rawContext: any[];
  
  // 兼容 OverpassPOI 的字段
  osmId: number; // 使用 mapboxId 的哈希值
  osmType: 'node' | 'way' | 'relation'; // 默认为 'node'
  name: string;
  nameEn?: string;
  lat: number;
  lng: number;
  category: string;
  type: string;
  rawTags: Record<string, string>; // 从 rawProperties 映射
}

