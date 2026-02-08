// src/agent/assistants/planning-assistant/services/mcp-tool-dispatcher.service.ts

/**
 * MCP Tool Dispatcher Service
 * 
 * 职责:
 * - 统一接口调用所有 MCP 工具
 * - 根据服务名称和工具名称路由到对应的服务
 * - 处理工具调用的错误和重试
 */

import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { McpToolDefinition } from './mcp-tool-registry.service';
import { AirbnbService } from '../../../../mcp/airbnb.service';
import { WeatherDirectService } from '../../../../mcp/weather-direct.service';
import { ExaService } from '../../../../mcp/exa.service';
import { GoogleCalendarService } from '../../../../mcp/google-calendar.service';
import { GoogleMapsDirectService } from '../../../../mcp/google-maps-direct.service';

@Injectable()
export class McpToolDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(McpToolDispatcherService.name);

  // 常见中文位置名称到英文的映射（支持别名）
  private readonly locationNameMap: Map<string, string> = new Map([
    // 国家/地区
    ['冰岛', 'Iceland'],
    ['日本', 'Japan'],
    ['韩国', 'South Korea'],
    ['泰国', 'Thailand'],
    ['新加坡', 'Singapore'],
    ['马来西亚', 'Malaysia'],
    ['印度尼西亚', 'Indonesia'],
    ['菲律宾', 'Philippines'],
    ['越南', 'Vietnam'],
    ['美国', 'United States'],
    ['加拿大', 'Canada'],
    ['澳大利亚', 'Australia'],
    ['新西兰', 'New Zealand'],
    ['英国', 'United Kingdom'],
    ['法国', 'France'],
    ['德国', 'Germany'],
    ['意大利', 'Italy'],
    ['西班牙', 'Spain'],
    ['挪威', 'Norway'],
    ['瑞典', 'Sweden'],
    ['芬兰', 'Finland'],
    ['丹麦', 'Denmark'],
    ['瑞士', 'Switzerland'],
    ['奥地利', 'Austria'],
    ['荷兰', 'Netherlands'],
    ['比利时', 'Belgium'],
    ['葡萄牙', 'Portugal'],
    ['希腊', 'Greece'],
    ['土耳其', 'Turkey'],
    
    // 中国主要城市（支持别名）
    ['北京', 'Beijing'],
    ['北京市', 'Beijing'],
    ['上海', 'Shanghai'],
    ['上海市', 'Shanghai'],
    ['广州', 'Guangzhou'],
    ['广州市', 'Guangzhou'],
    ['深圳', 'Shenzhen'],
    ['深圳市', 'Shenzhen'],
    ['杭州', 'Hangzhou'],
    ['杭州市', 'Hangzhou'],
    ['南京', 'Nanjing'],
    ['南京市', 'Nanjing'],
    ['苏州', 'Suzhou'],
    ['苏州市', 'Suzhou'],
    ['成都', 'Chengdu'],
    ['成都市', 'Chengdu'],
    ['重庆', 'Chongqing'],
    ['重庆市', 'Chongqing'],
    ['武汉', 'Wuhan'],
    ['武汉市', 'Wuhan'],
    ['西安', 'Xi\'an'],
    ['西安市', 'Xi\'an'],
    ['天津', 'Tianjin'],
    ['天津市', 'Tianjin'],
    ['厦门', 'Xiamen'],
    ['厦门市', 'Xiamen'],
    ['青岛', 'Qingdao'],
    ['青岛市', 'Qingdao'],
    ['大连', 'Dalian'],
    ['大连市', 'Dalian'],
    ['宁波', 'Ningbo'],
    ['宁波市', 'Ningbo'],
    ['无锡', 'Wuxi'],
    ['无锡市', 'Wuxi'],
    ['长沙', 'Changsha'],
    ['长沙市', 'Changsha'],
    ['郑州', 'Zhengzhou'],
    ['郑州市', 'Zhengzhou'],
    ['济南', 'Jinan'],
    ['济南市', 'Jinan'],
    ['合肥', 'Hefei'],
    ['合肥市', 'Hefei'],
    ['昆明', 'Kunming'],
    ['昆明市', 'Kunming'],
    ['哈尔滨', 'Harbin'],
    ['哈尔滨市', 'Harbin'],
    ['长春', 'Changchun'],
    ['长春市', 'Changchun'],
    ['沈阳', 'Shenyang'],
    ['沈阳市', 'Shenyang'],
    ['香港', 'Hong Kong'],
    ['香港特别行政区', 'Hong Kong'],
    ['澳门', 'Macau'],
    ['澳门特别行政区', 'Macau'],
    ['台北', 'Taipei'],
    ['台北市', 'Taipei'],
    
    // 日本城市
    ['东京', 'Tokyo'],
    ['东京都', 'Tokyo'],
    ['大阪', 'Osaka'],
    ['大阪市', 'Osaka'],
    ['京都', 'Kyoto'],
    ['京都市', 'Kyoto'],
    ['横滨', 'Yokohama'],
    ['名古屋', 'Nagoya'],
    ['福冈', 'Fukuoka'],
    ['札幌', 'Sapporo'],
    
    // 韩国城市
    ['首尔', 'Seoul'],
    ['釜山', 'Busan'],
    ['济州', 'Jeju'],
    ['济州岛', 'Jeju'],
    
    // 东南亚城市
    ['曼谷', 'Bangkok'],
    ['清迈', 'Chiang Mai'],
    ['普吉', 'Phuket'],
    ['普吉岛', 'Phuket'],
    ['吉隆坡', 'Kuala Lumpur'],
    ['槟城', 'Penang'],
    ['雅加达', 'Jakarta'],
    ['巴厘岛', 'Bali'],
    ['马尼拉', 'Manila'],
    ['河内', 'Hanoi'],
    ['胡志明市', 'Ho Chi Minh City'],
    
    // 欧洲城市
    ['伦敦', 'London'],
    ['巴黎', 'Paris'],
    ['罗马', 'Rome'],
    ['米兰', 'Milan'],
    ['威尼斯', 'Venice'],
    ['佛罗伦萨', 'Florence'],
    ['柏林', 'Berlin'],
    ['慕尼黑', 'Munich'],
    ['马德里', 'Madrid'],
    ['巴塞罗那', 'Barcelona'],
    ['阿姆斯特丹', 'Amsterdam'],
    ['布鲁塞尔', 'Brussels'],
    ['维也纳', 'Vienna'],
    ['苏黎世', 'Zurich'],
    ['日内瓦', 'Geneva'],
    ['哥本哈根', 'Copenhagen'],
    ['斯德哥尔摩', 'Stockholm'],
    ['奥斯陆', 'Oslo'],
    ['赫尔辛基', 'Helsinki'],
    ['雷克雅未克', 'Reykjavik'],
    ['都柏林', 'Dublin'],
    ['爱丁堡', 'Edinburgh'],
    ['里斯本', 'Lisbon'],
    ['雅典', 'Athens'],
    ['伊斯坦布尔', 'Istanbul'],
    
    // 北美城市
    ['纽约', 'New York'],
    ['洛杉矶', 'Los Angeles'],
    ['旧金山', 'San Francisco'],
    ['三藩市', 'San Francisco'],
    ['芝加哥', 'Chicago'],
    ['波士顿', 'Boston'],
    ['华盛顿', 'Washington'],
    ['华盛顿特区', 'Washington DC'],
    ['西雅图', 'Seattle'],
    ['拉斯维加斯', 'Las Vegas'],
    ['迈阿密', 'Miami'],
    ['多伦多', 'Toronto'],
    ['温哥华', 'Vancouver'],
    ['蒙特利尔', 'Montreal'],
    
    // 澳洲/新西兰城市
    ['悉尼', 'Sydney'],
    ['墨尔本', 'Melbourne'],
    ['布里斯班', 'Brisbane'],
    ['珀斯', 'Perth'],
    ['奥克兰', 'Auckland'],
    ['惠灵顿', 'Wellington'],
    ['基督城', 'Christchurch'],
  ]);

  // 地理编码结果缓存（避免重复 API 调用）
  private readonly geocodeCache: Map<string, { result: string; timestamp: number }> = new Map();
  private readonly GEOCODE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

  constructor(
    @Optional() private readonly airbnbService?: AirbnbService,
    @Optional() private readonly weatherDirectService?: WeatherDirectService,
    @Optional() private readonly exaService?: ExaService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
    @Optional() private readonly googleMapsDirectService?: GoogleMapsDirectService,
  ) {
    this.logger.log('🚀 MCP Tool Dispatcher Service 初始化');
    this.logger.log(`服务注入状态: Airbnb=${!!airbnbService}, Weather=${!!weatherDirectService}, Exa=${!!exaService}, GoogleCalendar=${!!googleCalendarService}, GoogleMaps=${!!googleMapsDirectService}`);
    if (!airbnbService) {
      this.logger.warn('⚠️ AirbnbService 未注入！');
    }
    if (!weatherDirectService) {
      this.logger.warn('⚠️ WeatherDirectService 未注入！');
    }
    if (!exaService) {
      this.logger.warn('⚠️ ExaService 未注入！');
    }
    if (!googleCalendarService) {
      this.logger.warn('⚠️ GoogleCalendarService 未注入！');
    }
    if (!googleMapsDirectService) {
      this.logger.warn('⚠️ GoogleMapsDirectService 未注入！');
    }
  }

  /**
   * 模块初始化时启动缓存清理定时器
   */
  onModuleInit() {
    // 每小时清理一次过期缓存
    setInterval(() => {
      this.cleanExpiredGeocodeCache();
    }, 60 * 60 * 1000);
    
    this.logger.debug('地理编码缓存清理定时器已启动（每小时清理一次）');
  }

  /**
   * 执行工具调用（带重试机制）
   */
  async executeTool(
    serviceName: string,
    toolName: string,
    params: Record<string, any>,
    retries: number = 1
  ): Promise<any> {
    this.logger.debug(`执行工具调用: ${serviceName}.${toolName}, params=${JSON.stringify(params)}`);

    let lastError: any;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // 根据服务名称路由到对应的服务
        switch (serviceName) {
          case 'airbnb':
            return await this.executeAirbnbTool(toolName, params);
          case 'weather':
            return await this.executeWeatherTool(toolName, params);
          case 'exa':
            return await this.executeExaTool(toolName, params);
          case 'google-calendar':
            return await this.executeGoogleCalendarTool(toolName, params);
          default:
            throw new Error(`未知的服务: ${serviceName}`);
        }
      } catch (error: any) {
        lastError = error;
        
        // 如果是最后一次尝试，或者错误不可重试，直接抛出
        if (attempt === retries || !this.isRetryableError(error)) {
          this.logger.error(`工具调用失败: ${serviceName}.${toolName}, error=${error.message}`, error.stack);
          throw error;
        }
        
        // 等待后重试
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 指数退避，最大5秒
        this.logger.warn(`工具调用失败，${delay}ms 后重试 (${attempt + 1}/${retries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    // 网络错误、超时错误可以重试
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    // 5xx 服务器错误可以重试
    if (error.response && error.response.status >= 500 && error.response.status < 600) {
      return true;
    }
    
    // 429 限流错误可以重试
    if (error.response && error.response.status === 429) {
      return true;
    }
    
    return false;
  }

  /**
   * 执行 Airbnb 工具
   */
  private async executeAirbnbTool(toolName: string, params: any): Promise<any> {
    if (!this.airbnbService) {
      throw new Error('AirbnbService 不可用');
    }

    switch (toolName) {
      case 'airbnb.search':
        return await this.airbnbService.searchListings({
          location: params.location,
          adults: params.adults || 1,
          checkin: params.checkin,
          checkout: params.checkout,
        });

      case 'airbnb.listingDetails':
        return await this.airbnbService.getListingDetails({
          listingId: params.listingId,
          checkin: params.checkin,
          checkout: params.checkout,
        });

      default:
        throw new Error(`未知的 Airbnb 工具: ${toolName}`);
    }
  }

  /**
   * 执行 Weather 工具
   */
  private async executeWeatherTool(toolName: string, params: any): Promise<any> {
    if (!this.weatherDirectService) {
      throw new Error('WeatherDirectService 不可用');
    }

    switch (toolName) {
      case 'weather.getCurrentWeather':
        // WeatherDirectService.getCurrentWeather 接受城市名称字符串
        const city = params.location || params.destination;
        const normalizedCity = await this.normalizeLocationName(city);
        return await this.weatherDirectService.getCurrentWeather(normalizedCity);

      case 'weather.getWeatherByDatetimeRange':
        // WeatherDirectService.getWeatherByDatetimeRange 接受三个独立参数
        const location = params.location || params.destination;
        const normalizedLocation = await this.normalizeLocationName(location);
        const startDate = params.startDate || this.getDefaultStartDate();
        const endDate = params.endDate || this.getDefaultEndDate(startDate);
        return await this.weatherDirectService.getWeatherByDatetimeRange(
          normalizedLocation,
          startDate,
          endDate
        );

      default:
        throw new Error(`未知的 Weather 工具: ${toolName}`);
    }
  }

  /**
   * 执行 Exa 工具
   */
  private async executeExaTool(toolName: string, params: any): Promise<any> {
    if (!this.exaService) {
      throw new Error('ExaService 不可用');
    }

    switch (toolName) {
      case 'exa.webSearch':
        // ExaService.webSearch 接受 query 字符串和 options 对象
        return await this.exaService.webSearch(
          params.query,
          {
            numResults: params.numResults || 5,
          }
        );

      case 'exa.webSearchAdvanced':
        return await this.exaService.webSearchAdvanced(
          params.query,
          {
            numResults: params.numResults || 5,
            category: params.category,
          }
        );

      case 'exa.deepSearch':
        return await this.exaService.deepSearch(
          params.query,
          {
            numResults: params.numResults || 5,
          }
        );

      case 'exa.crawlUrl':
        return await this.exaService.crawlUrl(
          params.url,
          {
            text: params.text !== false,
            html: params.html === true,
            markdown: params.markdown === true,
          }
        );

      default:
        throw new Error(`未知的 Exa 工具: ${toolName}`);
    }
  }

  /**
   * 执行 Google Calendar 工具
   */
  private async executeGoogleCalendarTool(toolName: string, params: any): Promise<any> {
    if (!this.googleCalendarService) {
      throw new Error('GoogleCalendarService 不可用');
    }

    switch (toolName) {
      case 'google-calendar.createEvent':
        return await this.googleCalendarService.createEvent({
          summary: params.summary,
          start: this.parseDateTime(params.start),
          end: this.parseDateTime(params.end),
          description: params.description,
          location: params.location,
          calendarId: params.calendarId,
        });

      case 'google-calendar.findFreeSlots':
        return await this.googleCalendarService.findFreeSlots({
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          durationMinutes: params.durationMinutes || 60,
          calendarId: params.calendarId,
        });

      case 'google-calendar.quickAdd':
        return await this.googleCalendarService.quickAdd({
          text: params.text,
          calendarId: params.calendarId,
        });

      case 'google-calendar.listEvents':
        return await this.googleCalendarService.listEvents({
          timeMin: params.timeMin,
          timeMax: params.timeMax,
          maxResults: params.maxResults || 10,
          calendarId: params.calendarId,
        });

      default:
        throw new Error(`未知的 Google Calendar 工具: ${toolName}`);
    }
  }

  /**
   * 解析日期时间字符串（支持 ISO 8601 和自然语言）
   */
  private parseDateTime(dateTimeStr: string): { dateTime: string; timeZone?: string } | { date: string } {
    // 如果是日期格式（YYYY-MM-DD），返回日期对象
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateTimeStr)) {
      return { date: dateTimeStr };
    }
    
    // 如果是完整的日期时间，返回 dateTime 对象
    return { dateTime: dateTimeStr };
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(serviceName: string): boolean {
    switch (serviceName) {
      case 'airbnb':
        return !!this.airbnbService;
      case 'weather':
        return !!this.weatherDirectService;
      case 'exa':
        return !!this.exaService;
      case 'google-calendar':
        return !!this.googleCalendarService;
      default:
        return false;
    }
  }

  /**
   * 获取默认开始日期（今天）
   */
  private getDefaultStartDate(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /**
   * 获取默认结束日期（开始日期后7天）
   */
  private getDefaultEndDate(startDate: string): string {
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return end.toISOString().split('T')[0];
  }

  /**
   * 标准化位置名称（将中文位置名称转换为英文或坐标）
   * 
   * 策略：
   * 1. 首先检查常见的中文-英文映射（支持别名）
   * 2. 检查地理编码缓存
   * 3. 如果映射中没有，尝试使用 Google Maps 地理编码
   * 4. 如果地理编码成功，缓存结果并返回英文名称或坐标
   * 5. 如果都失败，返回原始名称（让天气服务自己处理）
   */
  private async normalizeLocationName(location: string): Promise<string> {
    if (!location || typeof location !== 'string') {
      return location;
    }

    // 清理位置名称（移除多余的空格和标点）
    const cleanedLocation = location.trim().replace(/[，,。.？?！!]/g, '');

    // 1. 检查常见的中文-英文映射（支持别名）
    if (this.locationNameMap.has(cleanedLocation)) {
      const mappedName = this.locationNameMap.get(cleanedLocation)!;
      this.logger.debug(`位置名称映射: "${cleanedLocation}" -> "${mappedName}"`);
      return mappedName;
    }

    // 2. 如果已经是英文或坐标格式，直接返回
    if (/^[\d\s.,-]+$/.test(cleanedLocation) || /^[A-Za-z\s,.-]+$/.test(cleanedLocation)) {
      // 坐标格式（如 "64.1466,-21.9426"）或纯英文名称
      return cleanedLocation;
    }

    // 3. 检查地理编码缓存
    const cachedResult = this.geocodeCache.get(cleanedLocation);
    if (cachedResult && Date.now() - cachedResult.timestamp < this.GEOCODE_CACHE_TTL) {
      this.logger.debug(`使用缓存的地理编码结果: "${cleanedLocation}" -> "${cachedResult.result}"`);
      return cachedResult.result;
    }

    // 4. 尝试使用 Google Maps 地理编码（如果可用）
    if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
      try {
        this.logger.debug(`尝试使用 Google Maps 地理编码: "${cleanedLocation}"`);
        const geocodeResult = await this.googleMapsDirectService.geocode({
          address: cleanedLocation,
          language: 'en',
        });

        if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
          const result = geocodeResult.data.results[0];
          // 优先使用 address_components 中的城市或国家名称（更简洁）
          const cityName = result.address_components?.find((comp: any) => 
            comp.types.includes('locality')
          )?.long_name;
          
          const countryName = result.address_components?.find((comp: any) => 
            comp.types.includes('country')
          )?.long_name;
          
          // 如果找到城市名称，使用城市名称；否则使用国家名称；最后使用 formatted_address
          const normalizedName = cityName || countryName || result.formatted_address || cleanedLocation;
          
          // 缓存结果
          this.geocodeCache.set(cleanedLocation, {
            result: normalizedName,
            timestamp: Date.now(),
          });
          
          this.logger.debug(`Google Maps 地理编码成功: "${cleanedLocation}" -> "${normalizedName}"`);
          return normalizedName;
        }
      } catch (error: any) {
        this.logger.warn(`Google Maps 地理编码失败: "${cleanedLocation}", error: ${error.message}`);
        // 继续尝试其他方法
      }
    }

    // 5. 如果都失败，返回原始名称（让天气服务自己处理）
    this.logger.debug(`位置名称标准化失败，使用原始名称: "${cleanedLocation}"`);
    return cleanedLocation;
  }

  /**
   * 清理过期的地理编码缓存
   */
  private cleanExpiredGeocodeCache(): void {
    const now = Date.now();
    for (const [key, value] of this.geocodeCache.entries()) {
      if (now - value.timestamp >= this.GEOCODE_CACHE_TTL) {
        this.geocodeCache.delete(key);
      }
    }
  }
}
