// src/places/services/amap-poi.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * 高德地图 POI 服务
 * 
 * 功能：
 * 1. 根据名称和坐标搜索 POI
 * 2. 获取 POI 详细信息（开放时间、门票、类型、亮点等）
 * 3. 解析并格式化数据
 * 
 * API 文档：
 * - POI 搜索：https://lbs.amap.com/api/webservice/guide/api/search#text
 * - POI 详情：https://lbs.amap.com/api/webservice/guide/api/detail
 */
@Injectable()
export class AmapPOIService {
  private readonly logger = new Logger(AmapPOIService.name);
  private readonly apiKey: string | undefined;
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://restapi.amap.com/v3';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('AMAP_API_KEY');
    
    this.axiosInstance = axios.create({
      timeout: 10000, // 10 秒超时
      params: {
        key: this.apiKey || '',
      },
    });
  }

  /**
   * 根据名称和坐标搜索 POI 并获取详细信息
   * 
   * @param name POI 名称
   * @param lat 纬度
   * @param lng 经度
   * @returns POI 详细信息
   */
  async getPOIDetails(
    name: string,
    lat: number,
    lng: number
  ): Promise<{
    openingHours?: string;
    openingHoursStructured?: any;
    ticketPrice?: string;
    ticketPriceStructured?: any;
    type?: string;
    highlights?: string[];
    interestDimensions?: string[];
    amapId?: string;
    address?: string;
    tel?: string;
    website?: string;
    email?: string;
    postcode?: string;
  } | null> {
    if (!this.apiKey) {
      this.logger.warn('高德地图 API Key 未配置，无法获取 POI 详情');
      return null;
    }

    try {
      // 步骤1: 使用名称和坐标搜索 POI
      const searchResult = await this.searchPOI(name, lat, lng);
      
      if (!searchResult || !searchResult.id) {
        this.logger.warn(`未找到 POI: ${name} (${lat}, ${lng})`);
        return null;
      }

      // 步骤2: 获取 POI 详情
      const detailResult = await this.getPOIDetail(searchResult.id);
      
      if (!detailResult) {
        // 如果详情获取失败，返回搜索结果的简化信息
        return this.parseSearchResult(searchResult);
      }

      // 步骤3: 解析并返回详细信息
      return this.parseDetailResult(detailResult);
    } catch (error: any) {
      this.logger.error(
        `获取 POI 详情失败: ${name} (${lat}, ${lng}) - ${error.message}`,
        error.stack
      );
      return null;
    }
  }

  /**
   * 根据名称搜索POI并获取坐标（不依赖现有坐标）
   * 
   * 用于修正坐标的场景，只根据名称搜索，返回最匹配的POI坐标
   * 
   * @param name POI 名称
   * @param city 城市名称（可选，用于提高搜索精度）
   * @returns POI坐标信息
   */
  async searchPOIByName(
    name: string,
    city?: string
  ): Promise<{
    lat: number;
    lng: number;
    amapId?: string;
    address?: string;
    name?: string;
    error?: string; // 添加错误信息字段
  } | null> {
    if (!this.apiKey) {
      this.logger.warn('高德地图 API Key 未配置，无法搜索 POI');
      return null;
    }

    try {
      // 策略1: 使用完整名称搜索（如果提供城市，添加城市限定）
      let keywords = name;
      if (city) {
        keywords = `${city} ${name}`;
      }

      let params = {
        keywords,
        offset: 1,
        page: 1,
        extensions: 'base', // 只需要基础信息，包含坐标
      };

      let response = await this.axiosInstance.get(
        `${this.baseUrl}/place/text`,
        { params }
      );

      let data = response.data;
      if (data.status === '1' && data.pois && data.pois.length > 0) {
        const poi = data.pois[0];
        const [lng, lat] = poi.location.split(',').map(parseFloat);
        this.logger.debug(`找到POI (名称搜索): ${name} -> ${poi.name}`);
        return {
          lat,
          lng,
          amapId: poi.id,
          address: poi.address,
          name: poi.name,
        };
      }

      // 策略2: 简化名称搜索
      const simplifiedName = this.simplifyName(name);
      if (simplifiedName !== name) {
        keywords = city ? `${city} ${simplifiedName}` : simplifiedName;
        params = {
          ...params,
          keywords,
        };

        response = await this.axiosInstance.get(
          `${this.baseUrl}/place/text`,
          { params }
        );

        data = response.data;
        if (data.status === '1' && data.pois && data.pois.length > 0) {
          const poi = data.pois[0];
          const [lng, lat] = poi.location.split(',').map(parseFloat);
          this.logger.debug(`找到POI (简化名称): ${name} -> ${poi.name}`);
          return {
            lat,
            lng,
            amapId: poi.id,
            address: poi.address,
            name: poi.name,
          };
        }
      }

      // 记录失败原因
      if (data.status !== '1') {
        const errorInfo = data.info || 'N/A';
        this.logger.warn(`名称搜索失败: status=${data.status}, info=${errorInfo}, 景点=${name}`);
        
        // 如果是API限额错误，返回特殊标记
        if (errorInfo === 'USER_DAILY_QUERY_OVER_LIMIT' || errorInfo.includes('QUERY_OVER_LIMIT')) {
          return {
            lat: 0,
            lng: 0,
            error: 'USER_DAILY_QUERY_OVER_LIMIT',
          };
        }
      } else if (!data.pois || data.pois.length === 0) {
        this.logger.debug(`名称搜索失败: 未找到匹配的POI, 景点=${name}`);
      }

      return null;
    } catch (error: any) {
      this.logger.error(`名称搜索POI失败: ${name} - ${error.message}`);
      if (error.response) {
        this.logger.error(`API响应: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * 搜索 POI（根据名称和坐标）
   * 
   * 优化策略：
   * 1. 先尝试精确名称匹配（1km半径）
   * 2. 如果失败，尝试简化名称（去除地区前缀）
   * 3. 扩大搜索半径到5km
   */
  private async searchPOI(
    name: string,
    lat: number,
    lng: number
  ): Promise<any | null> {
    try {
      // 策略1: 精确名称匹配，1km半径
      let params = {
        keywords: name,
        location: `${lng},${lat}`,
        radius: 1000, // 1km
        offset: 1,
        page: 1,
        extensions: 'base',
      };

      let response = await this.axiosInstance.get(
        `${this.baseUrl}/place/text`,
        { params }
      );

      let data = response.data;
      if (data.status === '1' && data.pois && data.pois.length > 0) {
        this.logger.debug(`找到POI (策略1-精确匹配): ${name}`);
        return data.pois[0];
      }

      // 记录策略1失败原因
      if (data.status !== '1') {
        this.logger.debug(`策略1失败: status=${data.status}, info=${data.info || 'N/A'}, count=${data.count || 0}`);
      } else if (!data.pois || data.pois.length === 0) {
        this.logger.debug(`策略1失败: 未找到匹配的POI (count=${data.count || 0})`);
      }

      // 策略2: 简化名称（去除地区前缀，如"北京市"、"苏州市"等）
      const simplifiedName = this.simplifyName(name);
      if (simplifiedName !== name) {
        params = {
          ...params,
          keywords: simplifiedName,
          radius: 3000, // 扩大到3km
        };

        response = await this.axiosInstance.get(
          `${this.baseUrl}/place/text`,
          { params }
        );

        data = response.data;
        if (data.status === '1' && data.pois && data.pois.length > 0) {
          this.logger.debug(`找到POI (策略2-简化名称): ${name} -> ${simplifiedName}`);
          return data.pois[0];
        }

        // 记录策略2失败原因
        if (data.status !== '1') {
          this.logger.debug(`策略2失败: status=${data.status}, info=${data.info || 'N/A'}, count=${data.count || 0}`);
        } else if (!data.pois || data.pois.length === 0) {
          this.logger.debug(`策略2失败: 未找到匹配的POI (count=${data.count || 0})`);
        }
      }

      // 策略3: 扩大搜索半径到5km，使用简化名称
      params = {
        ...params,
        keywords: simplifiedName,
        radius: 5000, // 5km
      };

      response = await this.axiosInstance.get(
        `${this.baseUrl}/place/text`,
        { params }
      );

      data = response.data;
      if (data.status === '1' && data.pois && data.pois.length > 0) {
        this.logger.debug(`找到POI (策略3-扩大半径): ${name} -> ${simplifiedName}`);
        return data.pois[0];
      }

      // 记录策略3失败原因
      if (data.status !== '1') {
        this.logger.warn(`所有策略失败: status=${data.status}, info=${data.info || 'N/A'}, count=${data.count || 0}, 景点=${name}`);
      } else if (!data.pois || data.pois.length === 0) {
        this.logger.debug(`所有策略失败: 未找到匹配的POI (count=${data.count || 0}), 景点=${name}`);
      }

      return null;
    } catch (error: any) {
      this.logger.error(`搜索 POI 失败: ${name} (${lat}, ${lng}) - ${error.message}`);
      if (error.response) {
        this.logger.error(`API响应: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * 简化景点名称，去除地区前缀
   * 
   * 例如：
   * "北京市昌平区十三陵景区" -> "十三陵景区"
   * "苏州市光福景区" -> "光福景区"
   */
  private simplifyName(name: string): string {
    // 去除常见的地区前缀
    const patterns = [
      /^北京市[^市]*?区?/,
      /^上海市[^市]*?区?/,
      /^天津市[^市]*?区?/,
      /^重庆市[^市]*?区?/,
      /^[^省]+省[^市]+市[^区]*?区?/,
      /^[^市]+市[^区]*?区?/,
      /^[^自治区]+自治区[^市]+市/,
      /^[^自治区]+自治区[^盟]+盟/,
    ];

    let simplified = name;
    for (const pattern of patterns) {
      simplified = simplified.replace(pattern, '');
    }

    // 去除开头的空格和标点
    simplified = simplified.replace(/^[\s、，,]+/, '');

    return simplified || name; // 如果简化后为空，返回原名
  }

  /**
   * 获取 POI 详情
   */
  private async getPOIDetail(poiId: string): Promise<any | null> {
    try {
      const params = {
        id: poiId,
        extensions: 'all', // 返回所有详细信息
      };

      const response = await this.axiosInstance.get(
        `${this.baseUrl}/place/detail`,
        { params }
      );

      const data = response.data;
      if (data.status === '1' && data.pois && data.pois.length > 0) {
        this.logger.debug(`成功获取POI详情: ${poiId}`);
        return data.pois[0];
      }

      // 记录详情获取失败的原因
      if (data.status !== '1') {
        this.logger.warn(`获取POI详情失败: status=${data.status}, info=${data.info || 'N/A'}, poiId=${poiId}`);
      } else if (!data.pois || data.pois.length === 0) {
        this.logger.warn(`获取POI详情失败: 未找到POI详情, poiId=${poiId}`);
      }

      return null;
    } catch (error: any) {
      this.logger.error(`获取 POI 详情失败: poiId=${poiId}, ${error.message}`);
      if (error.response) {
        this.logger.error(`API响应: status=${error.response.status}, data=${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * 解析搜索结果（简化信息）
   */
  private parseSearchResult(poi: any): {
    type?: string;
    address?: string;
    tel?: string;
    amapId?: string;
  } {
    return {
      type: poi.type || undefined,
      address: poi.address || undefined,
      tel: poi.tel || undefined,
      amapId: poi.id || undefined,
    };
  }

  /**
   * 解析详情结果（完整信息）
   */
  private parseDetailResult(poi: any): {
    openingHours?: string;
    openingHoursStructured?: any; // 结构化开放时间
    ticketPrice?: string;
    ticketPriceStructured?: any; // 结构化门票价格（成人/儿童/优惠）
    type?: string;
    highlights?: string[];
    interestDimensions?: string[];
    amapId?: string;
    address?: string;
    tel?: string;
    website?: string;
    email?: string;
    postcode?: string;
  } {
    const result: any = {
      amapId: poi.id,
      address: poi.address,
      tel: poi.tel,
      website: poi.website,
      email: poi.email,
      postcode: poi.postcode,
    };

    // 1. 开放时间（营业时间）
    if (poi.business_time) {
      result.openingHours = poi.business_time;
      // 尝试解析为结构化格式
      result.openingHoursStructured = this.parseOpeningHours(poi.business_time);
    }

    // 2. 门票价格
    if (poi.cost) {
      result.ticketPrice = poi.cost;
      // 尝试解析为结构化格式（成人/儿童/优惠）
      result.ticketPriceStructured = this.parseTicketPrice(poi.cost);
    }

    // 3. 类型
    if (poi.type) {
      result.type = poi.type;
    }

    // 4. 亮点（标签）
    if (poi.tag) {
      // tag 可能是字符串（逗号分隔）或数组
      if (typeof poi.tag === 'string') {
        result.highlights = poi.tag.split(',').map((t: string) => t.trim()).filter(Boolean);
      } else if (Array.isArray(poi.tag)) {
        result.highlights = poi.tag;
      }
    }

    // 5. 兴趣维度（从多个字段提取）
    const interestDimensions: string[] = [];
    
    // 从类型中提取（如：风景名胜;公园;主题公园）
    if (poi.type) {
      const typeParts = poi.type.split(';');
      if (typeParts.length > 1) {
        interestDimensions.push(typeParts[1]); // 二级分类
      }
    }

    // 从标签中提取
    if (poi.tag) {
      const tags = typeof poi.tag === 'string' 
        ? poi.tag.split(',').map((t: string) => t.trim())
        : poi.tag;
      interestDimensions.push(...tags);
    }

    // 从其他字段提取（如：indoor_map, indoor_map_url 表示有室内地图）
    if (poi.indoor_map === '1') {
      interestDimensions.push('室内导航');
    }

    if (interestDimensions.length > 0) {
      // 去重：使用filter和indexOf
      result.interestDimensions = interestDimensions.filter((value, index, self) => 
        self.indexOf(value) === index
      );
    }

    return result;
  }

  /**
   * 解析开放时间字符串为结构化格式
   * 
   * 高德返回的格式示例：
   * - "周一至周五:08:30-17:30；周六:09:00-18:00"
   * - "全天开放"
   * - "08:00-18:00"
   */
  private parseOpeningHours(businessTime: string): any {
    if (!businessTime) return undefined;

    const result: any = {};

    // 处理"全天开放"
    if (businessTime.includes('全天') || businessTime.includes('24小时')) {
      result.alwaysOpen = true;
      return result;
    }

    // 处理"周一至周五"格式
    const weekdayMatch = businessTime.match(/周一至周五[：:]([^；;]+)/);
    if (weekdayMatch) {
      const timeRange = this.parseTimeRange(weekdayMatch[1]);
      if (timeRange) {
        result.weekday = timeRange;
      }
    }

    // 处理"周六"格式
    const saturdayMatch = businessTime.match(/周六[^：:]*[：:]([^；;]+)/);
    if (saturdayMatch) {
      const timeRange = this.parseTimeRange(saturdayMatch[1]);
      if (timeRange) {
        result.saturday = timeRange;
      }
    }

    // 处理"周日"格式
    const sundayMatch = businessTime.match(/周日[^：:]*[：:]([^；;]+)/);
    if (sundayMatch) {
      const timeRange = this.parseTimeRange(sundayMatch[1]);
      if (timeRange) {
        result.sunday = timeRange;
      }
    }

    // 如果没有匹配到特定格式，尝试解析为统一时间
    if (!result.weekday && !result.saturday && !result.sunday) {
      const timeRange = this.parseTimeRange(businessTime);
      if (timeRange) {
        result.uniform = timeRange;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * 解析时间范围（如 "08:30-17:30"）
   */
  private parseTimeRange(timeStr: string): { open: string; close: string } | null {
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*[-~至]\s*(\d{1,2}):(\d{2})/);
    if (match) {
      return {
        open: `${match[1].padStart(2, '0')}:${match[2]}`,
        close: `${match[3].padStart(2, '0')}:${match[4]}`,
      };
    }
    return null;
  }

  /**
   * 解析门票价格字符串为结构化格式
   * 
   * 高德返回的格式示例：
   * - "成人票:50元;儿童票:25元;学生票:30元"
   * - "50元"
   * - "免费"
   * - "成人:80元/人;儿童:40元/人"
   */
  private parseTicketPrice(cost: string): any {
    if (!cost) return undefined;

    const result: any = {};

    // 处理"免费"
    if (cost.includes('免费') || cost.includes('0元')) {
      result.free = true;
      return result;
    }

    // 提取价格数字
    const priceMatch = cost.match(/(\d+(?:\.\d+)?)\s*元/);
    if (priceMatch) {
      result.basePrice = parseFloat(priceMatch[1]);
      result.currency = 'CNY';
    }

    // 解析成人票
    const adultMatch = cost.match(/成人[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
    if (adultMatch) {
      result.adult = parseFloat(adultMatch[1]);
    } else if (result.basePrice) {
      // 如果没有明确标注，假设基础价格是成人票
      result.adult = result.basePrice;
    }

    // 解析儿童票
    const childMatch = cost.match(/儿童[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
    if (childMatch) {
      result.child = parseFloat(childMatch[1]);
    }

    // 解析学生票
    const studentMatch = cost.match(/学生[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
    if (studentMatch) {
      result.student = parseFloat(studentMatch[1]);
    }

    // 解析老人票/优惠票
    const seniorMatch = cost.match(/(老人|长者|优惠)[票:：]?\s*(\d+(?:\.\d+)?)\s*元/);
    if (seniorMatch) {
      result.senior = parseFloat(seniorMatch[2]);
    }

    // 保存原始字符串
    result.raw = cost;

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * 批量获取 POI 详情
   * 
   * @param pois POI 列表（名称、坐标）
   * @param batchSize 批次大小，默认 10
   * @param delay 批次间延迟（毫秒），默认 200ms（避免 API 限流）
   */
  async batchGetPOIDetails(
    pois: Array<{ name: string; lat: number; lng: number }>,
    batchSize: number = 10,
    delay: number = 200
  ): Promise<Array<{
    name: string;
    lat: number;
    lng: number;
    data: {
      openingHours?: string;
      ticketPrice?: string;
      type?: string;
      highlights?: string[];
      interestDimensions?: string[];
      amapId?: string;
      address?: string;
      tel?: string;
      website?: string;
    } | null;
  }>> {
    const results: Array<{
      name: string;
      lat: number;
      lng: number;
      data: {
        openingHours?: string;
        ticketPrice?: string;
        type?: string;
        highlights?: string[];
        interestDimensions?: string[];
        amapId?: string;
        address?: string;
        tel?: string;
        website?: string;
      } | null;
    }> = [];

    for (let i = 0; i < pois.length; i += batchSize) {
      const batch = pois.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (poi) => {
          const data = await this.getPOIDetails(poi.name, poi.lat, poi.lng);
          return {
            name: poi.name,
            lat: poi.lat,
            lng: poi.lng,
            data,
          };
        })
      );

      results.push(...batchResults);

      // 批次间延迟，避免 API 限流
      if (i + batchSize < pois.length) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }
}
