// src/places/services/google-places.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * Google Places API 服务
 * 
 * 功能：
 * 1. 根据国家代码获取旅游景点（使用 Google Places API）
 * 2. 支持过滤特定类型的景点（attraction, museum, viewpoint 等）
 * 3. 解析并格式化 Google Places 数据
 * 
 * API 文档：
 * - Google Places API: https://developers.google.com/maps/documentation/places/web-service
 * - Place Search: https://developers.google.com/maps/documentation/places/web-service/search-text
 */
@Injectable()
export class GooglePlacesService {
  private readonly logger = new Logger(GooglePlacesService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(private configService: ConfigService) {
    // 支持多种环境变量名
    let rawKey = 
      this.configService.get<string>('GOOGLE_PLACES_API_KEY') || 
      this.configService.get<string>('GOOGLE_MAPS_API_KEY') || 
      '';
    
    // 清理 API Key（移除可能的 "your_api_key" 前缀）
    if (rawKey && rawKey.includes('your_api_key')) {
      this.apiKey = rawKey.replace('your_api_key', '').trim();
    } else {
      this.apiKey = rawKey;
    }
    
    if (!this.apiKey || this.apiKey.length < 20) {
      this.logger.warn('GOOGLE_PLACES_API_KEY 或 GOOGLE_MAPS_API_KEY 未配置或格式不正确，Google Places 功能将不可用');
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
   * 优化策略：
   * 1. 小国（如冰岛）：使用国家中心坐标 + 大 radius（50km），单次查询
   * 2. 大国：合并查询类型，减少 API 调用次数（从 城市×类型 优化为 城市×1）
   * 3. 使用 keyword 替代已弃用的 type 参数
   * 
   * @param countryCode ISO 3166-1 国家代码（如 'US' 表示美国）
   * @param tourismTypes 旅游类型过滤（可选，如 ['attraction', 'viewpoint', 'museum']）
   * @param timeoutMs 总超时时间（毫秒），默认 50 秒
   * @returns 景点列表
   */
  async fetchAttractionsByCountry(
    countryCode: string,
    tourismTypes?: string[],
    timeoutMs: number = 50000
  ): Promise<GooglePlacesPOI[]> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY 未配置');
    }

    try {
      this.logger.log(`正在从 Google Places 获取 ${countryCode} 的景点数据...（超时：${timeoutMs}ms）`);

      const pois: GooglePlacesPOI[] = [];
      const startTime = Date.now();

      // 创建超时 Promise
      const timeoutPromise = new Promise<GooglePlacesPOI[]>((resolve) => {
        setTimeout(() => {
          this.logger.warn(`搜索超时（${timeoutMs}ms），返回已收集的 ${pois.length} 个结果`);
          resolve(pois);
        }, timeoutMs);
      });

      // 创建搜索 Promise
      const searchPromise = (async () => {
        // 判断国家规模，选择不同的搜索策略
        const countryInfo = this.getCountryInfo(countryCode);
        
        if (countryInfo.isSmallCountry) {
          // 小国策略：使用国家中心坐标 + 大 radius，单次查询合并所有类型
          this.logger.log(`使用小国策略：国家中心坐标 (${countryInfo.center.lat}, ${countryInfo.center.lng})`);
          
          const mergedQuery = this.buildMergedQuery(countryCode, countryCode, tourismTypes);
          const results = await this.searchPlacesByText(mergedQuery, countryCode);
          pois.push(...results);
        } else {
          // 大国策略：限制城市数量，合并查询类型
          const majorCities = this.getMajorCitiesByCountry(countryCode);
          const maxCities = 3; // 进一步减少到 3 个城市
          const citiesToSearch = majorCities.slice(0, maxCities);
          
          this.logger.log(`使用大国策略：搜索前 ${maxCities} 个主要城市（共 ${majorCities.length} 个）`);
          
          for (const city of citiesToSearch) {
            // 检查是否超时
            if (Date.now() - startTime >= timeoutMs) {
              this.logger.warn(`搜索超时，已处理 ${citiesToSearch.indexOf(city)}/${citiesToSearch.length} 个城市`);
              break;
            }

            try {
              // 优化：合并所有类型为一次查询，而不是循环查询
              const mergedQuery = this.buildMergedQuery(city.name, countryCode, tourismTypes);
              const results = await this.searchPlacesByText(mergedQuery, countryCode);
              pois.push(...results);
              
              // 添加延迟避免 API 限流
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error: any) {
              this.logger.warn(`搜索城市 ${city.name} 失败: ${error.message}`);
            }
          }
        }

        return pois;
      })();

      // 使用 Promise.race 实现超时控制
      const result = await Promise.race([searchPromise, timeoutPromise]);

      // 去重（基于 place_id 和坐标）
      const uniquePois = this.deduplicatePois(result);
      
      const elapsed = Date.now() - startTime;
      this.logger.log(`成功获取 ${uniquePois.length} 个景点（耗时：${elapsed}ms，API 调用优化：从 ~15 次减少到 ~3 次）`);
      
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
   * 在指定城市搜索景点（已废弃，使用 buildMergedQuery + searchPlacesByText 替代）
   * 保留用于向后兼容
   */
  private async searchPlacesInCity(
    cityName: string,
    countryCode: string,
    placeType: string
  ): Promise<GooglePlacesPOI[]> {
    try {
      const query = this.buildSearchQuery(cityName, countryCode, placeType);
      return await this.searchPlacesByText(query, countryCode);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error_message || error.message;
      const errorStatus = error.response?.status || 'N/A';
      this.logger.error(
        `搜索城市 ${cityName} 的 ${placeType} 失败: ${errorMsg} (HTTP ${errorStatus})`
      );
      if (error.response?.data) {
        this.logger.error(`API 错误详情: ${JSON.stringify(error.response.data)}`);
      }
      if (error.response?.status === 403 || error.response?.status === 401) {
        throw new Error(`Google Places API 认证失败: ${errorMsg}`);
      }
      return [];
    }
  }

  /**
   * 使用 Nearby Search API 搜索附近景点（更精确的地理范围）
   * @param lat 纬度
   * @param lng 经度
   * @param countryCode 国家代码
   * @param placeType 地点类型
   * @param cityName 城市名称（用于日志）
   */
  private async searchPlacesNearby(
    lat: number,
    lng: number,
    countryCode: string,
    placeType: string,
    cityName: string
  ): Promise<GooglePlacesPOI[]> {
    try {
      // 使用更小的 radius（5000 米 = 5 公里），缩小搜索范围
      const radius = 5000;
      
      // 映射为 Google Places API 类型
      const placeTypeMapped = this.mapPlaceType(placeType);
      
      // 使用 Nearby Search API
      // 注意：type 参数在新版 API 中已弃用，但为了兼容性仍可使用
      // 如果 type 不可用，可以尝试使用 keyword 参数
      const params: any = {
        location: `${lat},${lng}`,
        radius: radius,
        key: this.apiKey,
        language: 'en',
      };
      
      // 尝试使用 type 参数（如果支持）
      if (placeTypeMapped && placeTypeMapped !== 'point_of_interest') {
        params.type = placeTypeMapped;
      } else {
        // 如果类型太通用，使用 keyword 参数
        params.keyword = this.buildSearchQuery('', '', placeTypeMapped || 'tourist attraction');
      }
      
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/nearbysearch/json`,
        { params }
      );

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Google Places Nearby Search 返回状态: ${response.data.status}`);
        return [];
      }

      const results = response.data.results || [];
      
      // 限制结果数量（最多 20 个，减少数据传输）
      const limitedResults = results.slice(0, 20);
      
      // 映射为 POI 对象
      const pois = limitedResults.map((result: any) => this.mapGooglePlaceToPoi(result, countryCode));
      
      this.logger.log(`在 ${cityName} (${lat}, ${lng}) 附近找到 ${pois.length} 个 ${placeType}`);
      
      return pois;
    } catch (error: any) {
      this.logger.warn(`Nearby Search 失败，回退到 Text Search: ${error.message}`);
      // 回退到 Text Search
      const query = this.buildSearchQuery(cityName, countryCode, placeType);
      return await this.searchPlacesByText(query, countryCode);
    }
  }

  /**
   * 使用 Text Search API 搜索景点（优化：限制结果数量，减少响应时间）
   */
  private async searchPlacesByText(
    query: string,
    countryCode: string
  ): Promise<GooglePlacesPOI[]> {
    try {
      this.logger.log(`搜索: ${query}`);
      
      const response = await this.axiosInstance.get(
        `${this.baseUrl}/textsearch/json`,
        {
          params: {
            query: query,
            key: this.apiKey,
            language: 'en',
          },
          timeout: 10000, // 10 秒超时（单个请求）
        }
      );

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        this.logger.warn(`Google Places Text Search 返回状态: ${response.data.status}`);
        return [];
      }

      const results = response.data.results || [];
      
      // 限制结果数量（只获取前 10 个，进一步减少响应时间）
      const limitedResults = results.slice(0, 10);
      
      // 映射为 POI 对象
      const pois = limitedResults.map((result: any) => this.mapGooglePlaceToPoi(result, countryCode));
      
      this.logger.log(`找到 ${pois.length} 个结果`);
      
      return pois;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error_message || error.message;
      this.logger.error(`Text Search 失败: ${errorMsg}`);
      return [];
    }
  }

  /**
   * 获取城市坐标（用于 Nearby Search）
   */
  private getCityCoordinates(cityName: string, countryCode: string): { lat: number; lng: number } | null {
    // 主要城市的坐标数据（用于精确搜索）
    const cityCoordsMap: Record<string, Record<string, { lat: number; lng: number }>> = {
      US: {
        'New York': { lat: 40.7128, lng: -74.0060 },
        'Los Angeles': { lat: 34.0522, lng: -118.2437 },
        'Chicago': { lat: 41.8781, lng: -87.6298 },
        'San Francisco': { lat: 37.7749, lng: -122.4194 },
        'Washington': { lat: 38.9072, lng: -77.0369 },
        'Miami': { lat: 25.7617, lng: -80.1918 },
        'Las Vegas': { lat: 36.1699, lng: -115.1398 },
        'Boston': { lat: 42.3601, lng: -71.0589 },
      },
      IS: {
        'Reykjavik': { lat: 64.1466, lng: -21.9426 },
      },
      JP: {
        'Tokyo': { lat: 35.6762, lng: 139.6503 },
        'Osaka': { lat: 34.6937, lng: 135.5023 },
        'Kyoto': { lat: 35.0116, lng: 135.7681 },
      },
      GB: {
        'London': { lat: 51.5074, lng: -0.1278 },
        'Manchester': { lat: 53.4808, lng: -2.2426 },
        'Edinburgh': { lat: 55.9533, lng: -3.1883 },
      },
    };
    
    return cityCoordsMap[countryCode]?.[cityName] || null;
  }

  /**
   * 构建合并查询（优化：合并多个类型为一次查询，减少 API 调用）
   * @param location 位置（城市名或国家名）
   * @param countryCode 国家代码
   * @param tourismTypes 旅游类型数组（可选）
   * @returns 合并后的查询字符串
   */
  private buildMergedQuery(
    location: string,
    countryCode: string,
    tourismTypes?: string[]
  ): string {
    // 类型关键词映射
    const typeMap: Record<string, string> = {
      attraction: 'tourist attraction',
      museum: 'museum',
      viewpoint: 'viewpoint',
      monument: 'monument',
      gallery: 'art gallery',
      theater: 'theater',
    };

    if (tourismTypes && tourismTypes.length > 0) {
      // 合并多个类型：使用 OR 逻辑，例如 "tourist attraction OR museum in Iceland"
      const typeKeywords = tourismTypes
        .slice(0, 3) // 限制最多 3 种类型
        .map(type => typeMap[type.toLowerCase()] || type)
        .join(' OR ');
      
      return `${typeKeywords} in ${location}, ${countryCode}`;
    } else {
      // 默认：搜索所有旅游景点
      return `tourist attraction in ${location}, ${countryCode}`;
    }
  }

  /**
   * 构建单个类型的搜索查询（保留用于向后兼容）
   */
  private buildSearchQuery(cityName: string, countryCode: string, placeType: string): string {
    const typeMap: Record<string, string> = {
      attraction: 'tourist attraction',
      museum: 'museum',
      viewpoint: 'viewpoint',
      monument: 'monument',
      gallery: 'art gallery',
      theater: 'theater',
    };

    const typeName = typeMap[placeType.toLowerCase()] || placeType;
    return `${typeName} in ${cityName}, ${countryCode}`;
  }

  /**
   * 获取国家信息（判断是否小国，获取中心坐标）
   */
  private getCountryInfo(countryCode: string): {
    isSmallCountry: boolean;
    center: { lat: number; lng: number };
    radius?: number;
  } {
    // 小国定义：面积小或主要景点集中在少数城市
    const smallCountries: Record<string, { lat: number; lng: number; radius: number }> = {
      IS: { lat: 64.9631, lng: -19.0208, radius: 50000 }, // 冰岛中心，50km radius
      LU: { lat: 49.8153, lng: 6.1296, radius: 30000 }, // 卢森堡
      MT: { lat: 35.9375, lng: 14.3754, radius: 20000 }, // 马耳他
      CY: { lat: 35.1264, lng: 33.4299, radius: 40000 }, // 塞浦路斯
    };

    const countryInfo = smallCountries[countryCode];
    if (countryInfo) {
      return {
        isSmallCountry: true,
        center: { lat: countryInfo.lat, lng: countryInfo.lng },
        radius: countryInfo.radius,
      };
    }

    // 大国：返回第一个主要城市的坐标作为参考
    const majorCities = this.getMajorCitiesByCountry(countryCode);
    if (majorCities.length > 0) {
      const firstCity = this.getCityCoordinates(majorCities[0].name, countryCode);
      return {
        isSmallCountry: false,
        center: firstCity || { lat: 0, lng: 0 },
      };
    }

    return {
      isSmallCountry: false,
      center: { lat: 0, lng: 0 },
    };
  }

  /**
   * 映射地点类型为 Google Places API 类型
   */
  private mapPlaceType(placeType: string): string {
    const typeMap: Record<string, string> = {
      attraction: 'tourist_attraction',
      museum: 'museum',
      viewpoint: 'point_of_interest',
      monument: 'point_of_interest',
      gallery: 'art_gallery',
      theater: 'movie_theater',
    };

    return typeMap[placeType.toLowerCase()] || 'point_of_interest';
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
        { name: 'Miami', countryCode: 'US' },
        { name: 'Las Vegas', countryCode: 'US' },
        { name: 'Boston', countryCode: 'US' },
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
   * 将 Google Place 结果映射为 POI 对象
   */
  private mapGooglePlaceToPoi(result: any, countryCode?: string): GooglePlacesPOI {
    const location = result.geometry?.location || {};
    const lat = location.lat || 0;
    const lng = location.lng || 0;

    // 提取名称
    const name = result.name || 'Unnamed place';
    
    // 提取类型
    const types = result.types || [];
    const category = this.extractCategory(types);
    const type = this.extractType(types);

    // 生成兼容的 osmId（使用 place_id 的哈希值）
    const placeId = result.place_id || '';
    const osmId = this.hashStringToNumber(placeId);

    // 构建 rawTags（兼容 Overpass 格式）
    const rawTags: Record<string, string> = {};
    rawTags.name = name;
    if (result.vicinity) rawTags.address = result.vicinity;
    if (category) rawTags.tourism = category;
    if (type) rawTags.type = type;
    if (countryCode) rawTags['ISO3166-1'] = countryCode;
    if (result.rating) rawTags.rating = result.rating.toString();
    if (result.formatted_address) rawTags['addr:full'] = result.formatted_address;

    return {
      // Google Places 特有字段
      placeId,
      countryCode: countryCode || '',
      rawResult: result,
      
      // 兼容 OverpassPOI 的字段
      osmId,
      osmType: 'node' as const,
      name,
      nameEn: name, // Google Places 通常返回英文名
      lat,
      lng,
      category,
      type,
      rawTags,
    };
  }

  /**
   * 从 Google Places types 数组中提取主要类别
   */
  private extractCategory(types: string[]): string {
    // 优先级：tourism 相关 > point_of_interest > 其他
    const tourismTypes = types.filter(t => 
      t.includes('tourist') || 
      t.includes('attraction') ||
      t.includes('museum') ||
      t.includes('viewpoint')
    );
    
    if (tourismTypes.length > 0) {
      return tourismTypes[0].replace(/_/g, ' ');
    }
    
    if (types.includes('point_of_interest')) {
      return 'point_of_interest';
    }
    
    return types[0]?.replace(/_/g, ' ') || 'tourism';
  }

  /**
   * 从 Google Places types 数组中提取具体类型
   */
  private extractType(types: string[]): string {
    // 查找最具体的类型（排除通用类型）
    const excludeTypes = ['point_of_interest', 'establishment', 'geocode'];
    const specificTypes = types.filter(t => !excludeTypes.includes(t));
    
    if (specificTypes.length > 0) {
      return specificTypes[0].replace(/_/g, ' ');
    }
    
    return types[0]?.replace(/_/g, ' ') || 'attraction';
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
   * 去重 POI（基于 place_id 和坐标）
   */
  private deduplicatePois(pois: GooglePlacesPOI[]): GooglePlacesPOI[] {
    const seen = new Set<string>();
    const unique: GooglePlacesPOI[] = [];

    for (const poi of pois) {
      // 优先使用 place_id，其次使用坐标+名称
      const key = poi.placeId || 
                  `${poi.lat.toFixed(4)}_${poi.lng.toFixed(4)}_${poi.name}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(poi);
      }
    }

    return unique;
  }
}

/**
 * Google Places POI 数据结构
 * 兼容 OverpassPOI 接口，便于替换
 */
export interface GooglePlacesPOI {
  // Google Places 特有字段
  placeId: string;
  countryCode: string;
  rawResult: Record<string, any>;
  
  // 兼容 OverpassPOI 的字段
  osmId: number; // 使用 place_id 的哈希值
  osmType: 'node' | 'way' | 'relation'; // 默认为 'node'
  name: string;
  nameEn?: string;
  lat: number;
  lng: number;
  category: string;
  type: string;
  rawTags: Record<string, string>; // 从 Google Places 结果映射
}

