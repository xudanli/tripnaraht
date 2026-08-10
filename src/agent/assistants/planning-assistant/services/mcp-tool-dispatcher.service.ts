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
import { classifyOrchestratorFailure } from '../../../utils/orchestrator-failure-taxonomy.util';
import { McpToolExecutionError } from '../errors/mcp-tool-execution.error';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AirbnbService } from '../../../../mcp/airbnb.service';
import { WeatherDirectService } from '../../../../mcp/weather-direct.service';
import { ExaService } from '../../../../mcp/exa.service';
import { GoogleCalendarService } from '../../../../mcp/google-calendar.service';
import { GoogleMapsDirectService } from '../../../../mcp/google-maps-direct.service';
import { HotelDirectService } from '../../../../mcp/hotel-direct.service';
import { AmapHotelService } from '../../../../mcp/amap-hotel.service';
import { FliggyDirectService } from '../../../../mcp/fliggy-direct.service';
import {
  hasChinaFliggyHubHint,
  isChinaOtaMarketLoose,
  resolveFliggyDestName,
  resolveFliggyHotelKeywords,
  resolveFliggyLodgingSearch,
  stripClientContextAppendix,
} from '../../../../mcp/fliggy-dest.util';
import { XiaohongshuDirectService } from '../../../../mcp/xiaohongshu-direct.service';
import { mapXhsFeedsToExperienceBundle } from '../../../../mcp/xiaohongshu-evidence.mapper';
import { formatXhsExperienceNarratorBlock } from '../../../../mcp/format-xhs-experience-narrator.util';
import { BookingComService } from '../../../../mcp/booking-com.service';
import { CarRentalDirectService } from '../../../../mcp/car-rental-direct.service';
import { ActivityDirectService } from '../../../../mcp/activity-direct.service';
import { RestaurantDirectService } from '../../../../mcp/restaurant-direct.service';
import { AdvancedGeocodingService, LocationContext } from './advanced-geocoding.service';
import {
  isChinaHotelSearchScope,
  lodgingTownAliasForAirbnb,
  resolveAirbnbSearchLocation,
} from '../utils/hotel-search-location.util';
import {
  listingHasStayPriceHint,
  preferStayPricedAirbnbListings,
  stampPoiCatalogInventory,
  tagAirbnbInventoryFields,
  type HotelInventoryMeta,
} from '../../../utils/hotel-inventory-verify.util';

@Injectable()
export class McpToolDispatcherService implements OnModuleInit {
  private readonly logger = new Logger(McpToolDispatcherService.name);

  // 常见中文位置名称到英文的映射（支持别名）
  private readonly locationNameMap: Map<string, string> = new Map([
    // 国家/地区（含 ISO 国家代码，如 IS=冰岛）
    ['冰岛', 'Iceland'],
    ['IS', 'Iceland'],
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
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly airbnbService?: AirbnbService,
    @Optional() private readonly weatherDirectService?: WeatherDirectService,
    @Optional() private readonly exaService?: ExaService,
    @Optional() private readonly googleCalendarService?: GoogleCalendarService,
    @Optional() private readonly googleMapsDirectService?: GoogleMapsDirectService,
    @Optional() private readonly hotelDirectService?: HotelDirectService,
    @Optional() private readonly amapHotelService?: AmapHotelService,
    @Optional() private readonly fliggyDirectService?: FliggyDirectService,
    @Optional() private readonly xiaohongshuDirectService?: XiaohongshuDirectService,
    @Optional() private readonly bookingComService?: BookingComService,
    @Optional() private readonly carRentalDirectService?: CarRentalDirectService,
    @Optional() private readonly activityDirectService?: ActivityDirectService,
    @Optional() private readonly restaurantDirectService?: RestaurantDirectService,
    @Optional() private readonly advancedGeocodingService?: AdvancedGeocodingService,
  ) {
    this.logger.log('🚀 MCP Tool Dispatcher Service 初始化');
    this.logger.log(
      `服务注入状态: Airbnb=${!!airbnbService}, Weather=${!!weatherDirectService}, Exa=${!!exaService}, GoogleCalendar=${!!googleCalendarService}, GoogleMaps=${!!googleMapsDirectService}, Hotel=${!!hotelDirectService}, AmapHotel=${!!amapHotelService}, Fliggy=${!!fliggyDirectService}, Xiaohongshu=${!!xiaohongshuDirectService}, BookingCom=${!!bookingComService}, CarRentalDirect=${!!carRentalDirectService}, Activity=${!!activityDirectService}, Restaurant=${!!restaurantDirectService}, AdvancedGeocoding=${!!advancedGeocodingService}`,
    );
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
    if (!hotelDirectService) {
      this.logger.warn('⚠️ HotelDirectService 未注入！');
    }
    if (!bookingComService) {
      this.logger.warn('⚠️ BookingComService 未注入！');
    }
    if (!advancedGeocodingService) {
      this.logger.warn('⚠️ AdvancedGeocodingService 未注入！');
    }
  }

  /** 轻量路径：Booking.com RapidAPI 是否可用 */
  isBookingComCarRentalAvailable(): boolean {
    return this.bookingComService?.isAvailable() === true;
  }

  /**
   * 轻量路径：租车检索是否可跑。
   * Booking Key 缺失时仍可用 CarRentalDirect（Browserbase 探页 + 目录）。
   */
  isCarRentalSearchAvailable(): boolean {
    return (
      this.bookingComService?.isAvailable() === true ||
      this.carRentalDirectService?.isAvailable() === true
    );
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
    // 如果 toolName 已经包含服务名前缀（如 "hotel.search"），提取实际工具名
    // 否则使用完整工具名
    let actualToolName = toolName;
    if (toolName.startsWith(`${serviceName}.`)) {
      actualToolName = toolName.substring(serviceName.length + 1);
    }
    
    this.logger.debug(`执行工具调用: ${serviceName}.${actualToolName} (原始: ${toolName}), params=${JSON.stringify(params)}`);

    let lastError: any;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // 根据服务名称路由到对应的服务
        switch (serviceName) {
          case 'airbnb':
            return await this.executeAirbnbTool(actualToolName.startsWith('airbnb.') ? actualToolName : `airbnb.${actualToolName}`, params);
          case 'weather':
            return await this.executeWeatherTool(actualToolName.startsWith('weather.') ? actualToolName : `weather.${actualToolName}`, params);
          case 'exa':
            return await this.executeExaTool(actualToolName.startsWith('exa.') ? actualToolName : `exa.${actualToolName}`, params);
          case 'google-calendar':
            return await this.executeGoogleCalendarTool(actualToolName.startsWith('google-calendar.') ? actualToolName : `google-calendar.${actualToolName}`, params);
          case 'hotel':
            return await this.executeHotelTool(actualToolName.startsWith('hotel.') ? actualToolName : `hotel.${actualToolName}`, params);
          case 'activity':
            return await this.executeActivityTool(
              actualToolName.startsWith('activity.') ? actualToolName : `activity.${actualToolName}`,
              params,
            );
          case 'fliggy':
            return await this.executeFliggyTool(
              actualToolName.startsWith('fliggy.')
                ? actualToolName
                : `fliggy.${actualToolName}`,
              params,
            );
          case 'xiaohongshu':
          case 'xhs':
            return await this.executeXiaohongshuTool(
              actualToolName.startsWith('xiaohongshu.')
                ? actualToolName
                : `xiaohongshu.${actualToolName}`,
              params,
            );
          case 'restaurant':
            return await this.executeRestaurantTool(
              actualToolName.startsWith('restaurant.')
                ? actualToolName
                : `restaurant.${actualToolName}`,
              params,
            );
          case 'car_rental':
            return await this.executeBookingComTool(
              actualToolName.startsWith('car_rental.') ? actualToolName : `car_rental.${actualToolName}`,
              params,
            );
          default:
            this.throwTaggedMcpFailure(serviceName, actualToolName, new Error(`未知的服务: ${serviceName}`));
        }
      } catch (error: any) {
        lastError = error;
        
        // 如果是最后一次尝试，或者错误不可重试，直接抛出
        if (attempt === retries || !this.isRetryableError(error)) {
          this.logger.error(`工具调用失败: ${serviceName}.${toolName}, error=${error.message}`, error.stack);
          this.throwTaggedMcpFailure(serviceName, actualToolName, error);
        }
        
        // 等待后重试
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // 指数退避，最大5秒
        this.logger.warn(`工具调用失败，${delay}ms 后重试 (${attempt + 1}/${retries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.throwTaggedMcpFailure(serviceName, actualToolName, lastError);
  }

  /**
   * MCP 出口统一打上 I5 指纹（JSON-RPC / HTTP 语义见 classifyOrchestratorFailure）。
   */
  private throwTaggedMcpFailure(serviceName: string, actualToolName: string, error: unknown): never {
    const meta = classifyOrchestratorFailure(error, {
      tool_id: `mcp.${serviceName}.${actualToolName}`,
      mcp_service: serviceName,
      mcp_tool: actualToolName,
    });
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error).slice(0, 500);
    throw new McpToolExecutionError(msg, {
      cause: error,
      orchestratorRobustness: meta,
      mcpService: serviceName,
      mcpTool: actualToolName,
    });
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

    // 当 location/destination 为国家代码（如 IS、JP）时，先转为国家名称，否则 Open-Meteo 地理编码可能失败
    const resolveLocationForWeather = (raw: string): string => {
      if (!raw || typeof raw !== 'string') return raw;
      const trimmed = raw.trim().toUpperCase();
      if (params.countryCode && trimmed === params.countryCode.toUpperCase()) {
        const countryName = this.getCountryNameFromCode(params.countryCode);
        if (countryName !== params.countryCode) {
          this.logger.debug(`天气查询: 国家代码 "${raw}" -> "${countryName}"`);
          return countryName;
        }
      }
      return raw;
    };

    switch (toolName) {
      case 'weather.getCurrentWeather':
        // WeatherDirectService.getCurrentWeather 接受城市名称字符串
        const city = resolveLocationForWeather(params.location || params.destination);
        const normalizedCity = await this.normalizeLocationName(city, {
          selectedDestination: params.destination,
          language: params.language,
        });
        return await this.weatherDirectService.getCurrentWeather(normalizedCity);

      case 'weather.getWeatherByDatetimeRange':
        // WeatherDirectService.getWeatherByDatetimeRange 接受三个独立参数
        const location = resolveLocationForWeather(params.location || params.destination);
        const normalizedLocation = await this.normalizeLocationName(location, {
          selectedDestination: params.destination,
          language: params.language,
        });
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
   * 从入住日当天最后一个行程项获取地点名称（用于「行程项附近」酒店搜索）
   * 按 order DESC、startTime DESC 取当天最后一项，用地点名称搜索更符合 Airbnb 等服务的匹配逻辑
   */
  private async getLastItineraryItemPlaceForDate(
    tripId: string,
    checkInDate: string
  ): Promise<{ placeName: string; nameCN?: string; nameEN?: string } | null> {
    if (!this.prisma) return null;
    try {
      const row = await this.prisma.$queryRaw<
        Array<{ nameCN: string; nameEN: string | null }>
      >`
        SELECT p."nameCN", p."nameEN"
        FROM "ItineraryItem" ii
        JOIN "TripDay" td ON ii."tripDayId" = td.id
        JOIN "Place" p ON ii."placeId" = p.id
        WHERE td."tripId" = ${tripId}
          AND td.date::date = ${checkInDate}::date
        ORDER BY ii."order" DESC NULLS LAST, ii."startTime" DESC NULLS LAST
        LIMIT 1
      `;
      if (!row || row.length === 0) return null;
      const { nameCN, nameEN } = row[0];
      const placeName = (nameEN || nameCN || '').trim();
      if (!placeName) return null;
      this.logger.debug(
        `从当天最后行程项获取地点: tripId=${tripId}, checkIn=${checkInDate}, placeName=${placeName}`
      );
      return { placeName, nameCN, nameEN: nameEN || undefined };
    } catch (e: any) {
      this.logger.debug(`获取行程项地点失败: ${e?.message}`);
      return null;
    }
  }

  /**
   * 执行 Hotel 工具
   * 
   * 优先级：优先使用 Airbnb，如果 Airbnb 不可用或结果为空，再降级到 HotelDirectService
   * 位置策略：若有 tripId + 日期，优先使用行程项坐标；否则按城市/国家
   */
  private async executeHotelTool(toolName: string, params: any): Promise<any> {
    switch (toolName) {
      case 'hotel.search':
        // 处理位置参数（可能是字符串或坐标对象）
        let location: { lat: number; lng: number } | undefined;

        // 策略 -1: 上游已算好走廊/锚点坐标（DayN 末站↔次日首站）时优先使用，勿被「当日最后一项」覆盖
        if (
          params.location &&
          typeof params.location === 'object' &&
          typeof (params.location as { lat?: unknown }).lat === 'number' &&
          typeof (params.location as { lng?: unknown }).lng === 'number'
        ) {
          location = {
            lat: (params.location as { lat: number }).lat,
            lng: (params.location as { lng: number }).lng,
          };
          this.logger.debug(
            `使用上游传入住宿检索坐标: (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`,
          );
        }

        // 策略0: 若有 tripId + checkIn，取当天最后行程项地名（即使已有坐标，也供 Airbnb 文本检索）
        let locationFromItineraryPlace: {
          placeName: string;
          nameCN?: string;
          nameEN?: string;
          countryName: string;
        } | null = null;
        const checkIn = params.checkIn || params.checkin;
        if (params.tripId && checkIn && this.prisma) {
          const dateStr = typeof checkIn === 'string' ? checkIn.split('T')[0] : String(checkIn).split('T')[0];
          const lastItemPlace = await this.getLastItineraryItemPlaceForDate(params.tripId, dateStr);
          if (lastItemPlace) {
            const countryName = params.countryCode
              ? this.getCountryNameFromCode(params.countryCode)
              : 'Iceland';
            locationFromItineraryPlace = {
              placeName: lastItemPlace.placeName,
              nameCN: lastItemPlace.nameCN,
              nameEN: lastItemPlace.nameEN,
              countryName,
            };
            this.logger.debug(
              `使用当天最后行程项地点搜索: ${locationFromItineraryPlace.placeName}, ${locationFromItineraryPlace.countryName}`,
            );
            // 尚无坐标时：地理编码行程项地点，供 HotelDirect / 距离过滤
            if (!location) {
            const placeAddress = `${locationFromItineraryPlace.placeName}, ${locationFromItineraryPlace.countryName}`;
            if (this.advancedGeocodingService) {
              try {
                const geocodeResult = await this.advancedGeocodingService.geocode(placeAddress, {
                  selectedDestination: params.destination,
                  language: params.language,
                });
                if (geocodeResult.coordinates) {
                  location = geocodeResult.coordinates;
                  this.logger.debug(`行程项地点地理编码: ${placeAddress} -> (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`);
                }
              } catch (_) {}
            }
            if (!location && this.googleMapsDirectService?.isServiceAvailable()) {
              try {
                const geocodeResult = await this.googleMapsDirectService.geocode({
                  address: placeAddress,
                  language: params.language || 'en',
                });
                if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
                  const coords = geocodeResult.data.results[0].geometry?.location;
                  if (coords) {
                    location = { lat: coords.lat, lng: coords.lng };
                    this.logger.debug(`行程项地点地理编码: ${placeAddress} -> (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`);
                  }
                }
              } catch (_) {}
            }
            }
          }
        }

        // 策略1: 如果直接提供了 location 参数（且尚未从行程项获取）
        if (!location && params.location) {
          if (typeof params.location === 'string') {
            const locationStr = params.location.trim();
            // 当 location 为 2 字母国家代码（如 IS）时，地理编码 "IS" 会失败，优先使用预定义坐标
            const isCountryCode = locationStr.length === 2 && /^[A-Za-z]{2}$/.test(locationStr);
            if (isCountryCode) {
              const code = locationStr.toUpperCase();
              const predefinedCoords = this.getCountryCenterCoordinates(code);
              if (predefinedCoords) {
                location = predefinedCoords;
                this.logger.debug(`location 为国家代码 ${code}，使用预定义坐标: (${location.lat}, ${location.lng})`);
              }
            }

            if (!location) {
              // 如果是字符串，尝试地理编码
              const normalizedLocation = await this.normalizeLocationName(params.location, {
                selectedDestination: params.destination,
                language: params.language,
              });

              // 使用高级地理编码服务获取坐标
              if (this.advancedGeocodingService) {
                const geocodeResult = await this.advancedGeocodingService.geocode(normalizedLocation, {
                  selectedDestination: params.destination,
                  language: params.language,
                });
                if (geocodeResult.coordinates) {
                  location = geocodeResult.coordinates;
                }
              } else if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
                // 降级到 Google Maps 地理编码
                const geocodeResult = await this.googleMapsDirectService.geocode({
                  address: normalizedLocation,
                  language: params.language || 'en',
                });
                if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
                  const result = geocodeResult.data.results[0];
                  const coords = result.geometry?.location;
                  if (coords) {
                    location = { lat: coords.lat, lng: coords.lng };
                  }
                }
              }

              // 地理编码失败时，若为 2 字母格式，尝试用国家名称再编码（预定义坐标已在上面处理）
              if (!location && isCountryCode) {
                const countryName = this.getCountryNameFromCode(locationStr.toUpperCase());
                if (countryName !== locationStr) {
                  if (this.advancedGeocodingService) {
                    const geocodeResult = await this.advancedGeocodingService.geocode(countryName, {
                      selectedDestination: params.destination,
                      language: params.language,
                    });
                    if (geocodeResult.coordinates) location = geocodeResult.coordinates;
                  } else if (this.googleMapsDirectService?.isServiceAvailable()) {
                    const geocodeResult = await this.googleMapsDirectService.geocode({
                      address: countryName,
                      language: params.language || 'en',
                    });
                    if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
                      const coords = geocodeResult.data.results[0].geometry?.location;
                      if (coords) location = { lat: coords.lat, lng: coords.lng };
                    }
                  }
                }
              }

              if (!location) {
                // 若有 countryCode，不抛出，交由策略2用预定义坐标处理（避免地理编码超时时无法唤起 Airbnb）
                if (!params.countryCode) {
                  throw new Error(`无法解析位置: ${params.location}`);
                }
                this.logger.debug(`location 地理编码失败，将使用 countryCode=${params.countryCode} 的预定义坐标`);
              }
            }
          } else if (params.location.lat && params.location.lng) {
            // 如果已经是坐标对象
            location = params.location;
          }
        }
        
        // 策略2: 如果没有 location，但有 countryCode，使用国家代码进行地理编码
        if (!location && params.countryCode) {
          this.logger.debug(`使用 countryCode 进行地理编码: ${params.countryCode}`);
          const countryName = this.getCountryNameFromCode(params.countryCode);
          
          // 先尝试使用高级地理编码服务
          if (this.advancedGeocodingService) {
            try {
              const geocodeResult = await this.advancedGeocodingService.geocode(countryName, {
                selectedDestination: params.destination,
                language: params.language,
              });
              if (geocodeResult.coordinates) {
                location = geocodeResult.coordinates;
                this.logger.debug(`通过 countryCode (高级地理编码) 获取坐标成功: ${countryName} -> (${location.lat}, ${location.lng})`);
              }
            } catch (error: any) {
              this.logger.warn(`高级地理编码失败: ${error.message}，尝试 Google Maps 或预定义坐标`);
            }
          }
          
          // 如果高级地理编码失败，尝试 Google Maps
          if (!location && this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
            try {
              const geocodeResult = await this.googleMapsDirectService.geocode({
                address: countryName,
                language: params.language || 'en',
              });
              if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
                const result = geocodeResult.data.results[0];
                const coords = result.geometry?.location;
                if (coords) {
                  location = { lat: coords.lat, lng: coords.lng };
                  this.logger.debug(`通过 countryCode (Google Maps) 获取坐标成功: ${countryName} -> (${location.lat}, ${location.lng})`);
                }
              }
            } catch (error: any) {
              this.logger.warn(`Google Maps 地理编码失败: ${error.message}，使用预定义坐标作为降级方案`);
            }
          }
          
          // 降级方案：如果所有地理编码都失败，使用预定义的国家中心坐标
          if (!location) {
            const predefinedCoords = this.getCountryCenterCoordinates(params.countryCode);
            if (predefinedCoords) {
              location = predefinedCoords;
              this.logger.debug(`使用预定义国家中心坐标作为降级方案: ${params.countryCode} -> (${location.lat}, ${location.lng})`);
            } else {
              this.logger.warn(`无法获取 ${params.countryCode} 的坐标（地理编码失败且无预定义坐标）`);
            }
          }
        }
        
        // 策略3: 如果没有 location，但有 destination，使用目的地进行地理编码
        if (!location && params.destination) {
          this.logger.debug(`使用 destination 进行地理编码: ${params.destination}`);
          
          if (this.advancedGeocodingService) {
            const geocodeResult = await this.advancedGeocodingService.geocode(params.destination, {
              selectedDestination: params.destination,
              language: params.language,
            });
            if (geocodeResult.coordinates) {
              location = geocodeResult.coordinates;
              this.logger.debug(`通过 destination 获取坐标成功: ${params.destination} -> (${location.lat}, ${location.lng})`);
            }
          } else if (this.googleMapsDirectService && this.googleMapsDirectService.isServiceAvailable()) {
            const geocodeResult = await this.googleMapsDirectService.geocode({
              address: params.destination,
              language: params.language || 'en',
            });
            if (geocodeResult.success && geocodeResult.data?.results?.length > 0) {
              const result = geocodeResult.data.results[0];
              const coords = result.geometry?.location;
              if (coords) {
                location = { lat: coords.lat, lng: coords.lng };
                this.logger.debug(`通过 destination 获取坐标成功: ${params.destination} -> (${location.lat}, ${location.lng})`);
              }
            }
          }
        }
        
        // 策略4: 如果都没有，尝试从 naturalLanguage 中提取位置信息
        if (!location && params.naturalLanguage) {
          this.logger.debug(`尝试从 naturalLanguage 提取位置: ${params.naturalLanguage}`);
          // 移除"推荐"、"酒店"等关键词，保留地点信息
          const cleanedText = params.naturalLanguage.replace(/推荐|酒店|hotel|找|搜索/gi, '').trim();
          if (cleanedText && cleanedText.length > 0) {
            if (this.advancedGeocodingService) {
              const geocodeResult = await this.advancedGeocodingService.geocode(cleanedText, {
                selectedDestination: params.destination,
                language: params.language,
              });
              if (geocodeResult.coordinates) {
                location = geocodeResult.coordinates;
                this.logger.debug(`通过 naturalLanguage 获取坐标成功: ${cleanedText} -> (${location.lat}, ${location.lng})`);
              }
            }
          }
        }

        // 国内行程：跳过 Airbnb，优先飞猪（可跳转预订）→ 高德；海外仍 Airbnb 优先
        const providerErrors: string[] = [];
        const preferChina = isChinaHotelSearchScope({
          countryCode: params.countryCode,
          destination: params.destination,
          placeHint:
            params.naturalLanguage ||
            params.query ||
            locationFromItineraryPlace?.nameCN ||
            locationFromItineraryPlace?.placeName,
        });

        // 国内飞猪靠 dest/poi 锚点，不必串行 Google geocode（代理挂掉时曾拖到首都中心）
        if (!location && preferChina) {
          this.logger.debug(
            '国内酒店检索：跳过强制 geocode，使用占位坐标后走飞猪 dest 锚点',
          );
          location = { lat: 30.057, lng: 101.965 }; // 康定附近占位；真实检索以 destName 为准
        }

        if (!location) {
          throw new Error('缺少必需参数: location。请提供位置信息（location、countryCode、destination 或 naturalLanguage）');
        }

        if (preferChina && this.fliggyDirectService?.isServiceAvailable()) {
          try {
            const itineraryPlaceName =
              locationFromItineraryPlace?.nameCN?.trim() ||
              locationFromItineraryPlace?.placeName?.trim() ||
              null;
            const lodging = resolveFliggyLodgingSearch({
              destination:
                typeof params.destination === 'string' ? params.destination : null,
              placeHint:
                typeof params.naturalLanguage === 'string'
                  ? params.naturalLanguage
                  : null,
              naturalLanguage:
                typeof params.naturalLanguage === 'string'
                  ? params.naturalLanguage
                  : null,
              query: typeof params.query === 'string' ? params.query : null,
              itineraryPlaceName,
            });
            if (!lodging?.destName) {
              this.logger.warn(
                '酒店搜索：国内飞猪缺少当晚锚点城市（避免误搜成都），跳过飞猪改高德/坐标',
              );
              providerErrors.push('飞猪: 缺少行程锚点城市');
            } else {
              const keyWords =
                lodging.keyWords ||
                resolveFliggyHotelKeywords({
                  query: typeof params.query === 'string' ? params.query : null,
                  naturalLanguage:
                    typeof params.naturalLanguage === 'string'
                      ? params.naturalLanguage
                      : null,
                  placeHint: itineraryPlaceName,
                });
              this.logger.log(
                `酒店搜索：国内优先飞猪 dest=${lodging.destName}` +
                  (lodging.poiName ? ` poi=${lodging.poiName}` : '') +
                  (keyWords ? ` kw=${keyWords}` : '') +
                  (itineraryPlaceName ? ` anchor=${itineraryPlaceName}` : ''),
              );
              const searchOnce = (poiName?: string) =>
                this.fliggyDirectService!.searchHotels({
                  destName: lodging.destName,
                  poiName,
                  keyWords,
                  checkInDate:
                    typeof params.checkIn === 'string' ? params.checkIn : undefined,
                  checkOutDate:
                    typeof params.checkOut === 'string'
                      ? params.checkOut
                      : undefined,
                  limit: 12,
                });
              let fliggyResult = await searchOnce(lodging.poiName);
              // 429 时勿立刻再打一次 dest-only，避免加倍消耗配额
              if (
                !fliggyResult.results?.length &&
                lodging.poiName &&
                !fliggyResult.rateLimited
              ) {
                this.logger.debug(
                  `飞猪 poi=${lodging.poiName} 无结果，回退仅 dest=${lodging.destName}`,
                );
                fliggyResult = await searchOnce(undefined);
              }
              if (fliggyResult.results?.length) {
                return {
                  success: true,
                  results: fliggyResult.results,
                  totalResults: fliggyResult.results.length,
                  source: 'fliggy',
                  inventory_meta: {
                    inventory_verified: fliggyResult.results.some(
                      (r) => r.inventoryVerified,
                    ),
                    inventory_mode: fliggyResult.results.some(
                      (r) => r.inventoryVerified,
                    )
                      ? 'stay_priced'
                      : 'poi_catalog',
                    disclaimer_zh: `飞猪检索：${lodging.destName}${
                      lodging.poiName ? ` · ${lodging.poiName}` : ''
                    }周边，下单前请以飞猪页为准。`,
                  },
                };
              }
              providerErrors.push(`飞猪: ${fliggyResult.error || '无结果'}`);
            }
          } catch (fliggyErr: any) {
            this.logger.warn(`飞猪酒店搜索失败: ${fliggyErr.message}`);
            providerErrors.push(`飞猪: ${fliggyErr.message}`);
          }
        }

        if (preferChina && this.amapHotelService?.isServiceAvailable()) {
          try {
            this.logger.debug('酒店搜索：国内飞猪无结果，尝试高德住宿 POI...');
            const amapResult = await this.amapHotelService.searchHotels({
              keywords: params.query || params.naturalLanguage || '酒店',
              location,
              city:
                typeof params.destination === 'string' &&
                !/^[A-Z]{2}$/i.test(params.destination)
                  ? params.destination
                  : undefined,
              radiusMeters: params.radius || 8000,
              limit: 12,
            });
            if (amapResult.results?.length) {
              const stamped = stampPoiCatalogInventory(
                amapResult.results as unknown as Array<Record<string, unknown>>,
                'amap',
              );
              return {
                success: true,
                results: stamped.results,
                totalResults: stamped.results.length,
                source: 'amap',
                inventory_meta: stamped.inventory_meta,
              };
            }
            providerErrors.push('高德: 无结果');
          } catch (amapErr: any) {
            this.logger.warn(`高德住宿搜索失败: ${amapErr.message}`);
            providerErrors.push(`高德: ${amapErr.message}`);
          }
        }

        // 海外 / 国内供应商皆空：再试 Airbnb（国内默认跳过）
        if (!preferChina && this.airbnbService) {
          try {
            this.logger.debug('酒店搜索：优先尝试 Airbnb...');

            const countryCodeForAirbnb =
              (params.location && typeof params.location === 'string' && params.location.trim().length === 2 && /^[A-Za-z]{2}$/.test(params.location.trim())
                ? params.location.trim().toUpperCase()
                : params.countryCode?.toUpperCase()) ?? null;
            const countryNameForAirbnb = countryCodeForAirbnb
              ? this.getCountryNameFromCode(countryCodeForAirbnb)
              : null;
            const capitalFallback = countryCodeForAirbnb
              ? this.getAirbnbLocationFromCountryCode(countryCodeForAirbnb)
              : null;
            const itineraryPlaceForAirbnb =
              locationFromItineraryPlace?.nameEN?.trim() ||
              locationFromItineraryPlace?.nameCN?.trim() ||
              locationFromItineraryPlace?.placeName ||
              null;
            const airbnbLocationStr = resolveAirbnbSearchLocation({
              countryCode: countryCodeForAirbnb,
              countryName: countryNameForAirbnb,
              placeHint: params.naturalLanguage,
              itineraryPlaceName: itineraryPlaceForAirbnb,
              query: params.query,
              countryCapitalFallback: capitalFallback,
              latLngFallback: location,
              preferLatLngOverCapital: Boolean(
                locationFromItineraryPlace || params.naturalLanguage || location,
              ),
            });
            this.logger.debug(`Airbnb 搜索 location=${airbnbLocationStr}`);

            // 构建 Airbnb 搜索参数（ignoreRobotsText 用于绕过 Airbnb robots.txt 限制）
            const airbnbParams: any = {
              location: airbnbLocationStr,
              adults: params.guests || params.adults || 1,
              checkin: params.checkIn,
              checkout: params.checkOut,
              ignoreRobotsText: true,
            };

            // 如果有 tripId 或 countryCode，记录日志（可用于后续增强）
            if (params.tripId) {
              this.logger.debug(`Airbnb 搜索使用 tripId: ${params.tripId}`);
            }
            if (params.countryCode) {
              this.logger.debug(`Airbnb 搜索使用 countryCode: ${params.countryCode}`);
            }
            
            const airbnbResult = await this.airbnbService.searchListings(airbnbParams);
            // 解析 MCP 返回格式：content[0].text 为 JSON，含 searchResults 或 error
            let searchResults: any[] = [];
            if (airbnbResult?.content?.[0]?.type === 'text') {
              try {
                const data = JSON.parse(airbnbResult.content[0].text);
                if (data.error) {
                  this.logger.warn(`Airbnb 返回错误: ${data.error}`);
                  providerErrors.push(`Airbnb: ${data.error}`);
                } else {
                  searchResults = data.searchResults || [];
                }
              } catch (_) {}
            }
            // 有 countryCode 时按坐标过滤，剔除错误国家的房源（如美国）
            if (searchResults.length > 0 && countryCodeForAirbnb) {
              const filtered = this.filterListingsByCountry(searchResults, countryCodeForAirbnb);
              if (filtered.length < searchResults.length) {
                this.logger.debug(`Airbnb 按国家过滤: ${searchResults.length} -> ${filtered.length} (countryCode=${countryCodeForAirbnb})`);
              }
              searchResults = filtered;
            }
            /**
             * 走廊中文合成名易导致 Airbnb 漂到错误国家 → 国家过滤后变 0。
             * 用行程锚点 lat/lng 或英文末站名重试一次，避免整段降级空卡。
             */
            if (
              searchResults.length === 0 &&
              countryCodeForAirbnb &&
              (location || itineraryPlaceForAirbnb)
            ) {
              const retryLoc = location
                ? `${location.lat},${location.lng}`
                : `${lodgingTownAliasForAirbnb(String(itineraryPlaceForAirbnb))}, ${countryNameForAirbnb || 'Iceland'}`;
              if (retryLoc && retryLoc !== airbnbLocationStr) {
                this.logger.warn(
                  `Airbnb 国家过滤后为空，改用锚点重试 location=${retryLoc} (原=${airbnbLocationStr})`,
                );
                try {
                  const retryResult = await this.airbnbService.searchListings({
                    ...airbnbParams,
                    location: retryLoc,
                  });
                  let retryRows: any[] = [];
                  if (retryResult?.content?.[0]?.type === 'text') {
                    try {
                      const data = JSON.parse(retryResult.content[0].text);
                      if (!data.error) retryRows = data.searchResults || [];
                    } catch (_) {}
                  }
                  if (retryRows.length > 0 && countryCodeForAirbnb) {
                    retryRows = this.filterListingsByCountry(retryRows, countryCodeForAirbnb);
                  }
                  if (retryRows.length > 0) {
                    searchResults = retryRows;
                    this.logger.debug(`Airbnb 锚点重试成功，找到 ${searchResults.length} 个房源`);
                  }
                } catch (retryErr: any) {
                  this.logger.debug(`Airbnb 锚点重试失败: ${retryErr?.message || retryErr}`);
                }
              }
            }
            // 有行程锚点坐标时：丢掉离锚点过远的房源（典型：南岸晚却漂到雷克雅未克）
            if (searchResults.length > 0 && location) {
              const near = this.filterListingsNearAnchor(searchResults, location, 180);
              if (near.length > 0 && near.length < searchResults.length) {
                this.logger.debug(
                  `Airbnb 按锚点距离过滤: ${searchResults.length} -> ${near.length} (anchor=${location.lat.toFixed(3)},${location.lng.toFixed(3)})`,
                );
                searchResults = near;
              } else if (near.length === 0) {
                this.logger.warn(
                  `Airbnb 锚点 ${location.lat.toFixed(3)},${location.lng.toFixed(3)} 180km 内无房源，保留原结果以免空列表`,
                );
              }
            }
            if (searchResults.length > 0) {
              this.logger.debug(`Airbnb 搜索成功，找到 ${searchResults.length} 个房源`);
              /**
               * Direct 结果已够卡片展示；再调 MCP listingDetails 易卡住整段 LIVE_TOOL_HOTEL。
               * 富化限时 2s，超时直接用搜索结果。
               */
              const fromDirect =
                typeof airbnbResult?.content?.[0]?.text === 'string' &&
                airbnbResult.content[0].text.includes('"source":"airbnb_direct"');
              let enriched = searchResults;
              if (!fromDirect) {
                enriched = await Promise.race([
                  this.enrichAirbnbResultsWithDetails(searchResults, {
                    checkIn: params.checkIn,
                    checkOut: params.checkOut,
                    adults: params.guests || params.adults || 1,
                    limit: 3,
                  }),
                  new Promise<any[]>((resolve) =>
                    setTimeout(() => resolve(searchResults), 2_000),
                  ),
                ]);
              }

              const stayCi = params.checkIn ? String(params.checkIn).slice(0, 10) : undefined;
              const stayCo = params.checkOut ? String(params.checkOut).slice(0, 10) : undefined;
              const verifiedPack = await this.verifyAirbnbStayInventory(enriched, {
                checkIn: stayCi,
                checkOut: stayCo,
                adults: params.guests || params.adults || 1,
              });
              if (verifiedPack.results.length === 0) {
                this.logger.debug(
                  `Airbnb 核验后无可订示意结果（dropped=${verifiedPack.inventory_meta.dropped_unavailable ?? 0}），降级到 HotelDirect / 高德`,
                );
                providerErrors.push('Airbnb: 核验后无可订结果');
              } else {
                return {
                  success: true,
                  results: verifiedPack.results,
                  totalResults: verifiedPack.results.length,
                  source: 'airbnb',
                  inventory_meta: verifiedPack.inventory_meta,
                };
              }
            } else {
              this.logger.debug('Airbnb 搜索无结果，降级到 HotelDirect / 高德');
              if (!providerErrors.some((e) => e.startsWith('Airbnb:'))) {
                providerErrors.push('Airbnb: 无结果');
              }
            }
          } catch (airbnbError: any) {
            this.logger.warn(`Airbnb 搜索失败，降级到 HotelDirect / 高德: ${airbnbError.message}`);
            providerErrors.push(`Airbnb: ${airbnbError.message}`);
          }
        } else if (!preferChina) {
          this.logger.debug('AirbnbService 不可用，降级到 HotelDirect / 高德');
          providerErrors.push('Airbnb: 服务未注入');
        }

        // Google Places（HotelDirect）兜底
        if (!this.hotelDirectService) {
          throw new Error(
            `住宿检索失败（飞猪/Airbnb/高德均不可用，且 HotelDirectService 未注入）。详情: ${providerErrors.join(' | ') || '无'}`,
          );
        }

        const googleOk = await this.hotelDirectService.ensureAvailable();
        if (!googleOk) {
          // 国内再试一次高德（若前面因非 CN 跳过）
          if (!preferChina && this.amapHotelService?.isServiceAvailable()) {
            try {
              const amapResult = await this.amapHotelService.searchHotels({
                keywords: params.query || params.naturalLanguage || '酒店',
                location,
                radiusMeters: params.radius || 8000,
                limit: 12,
              });
              if (amapResult.results?.length) {
                const stamped = stampPoiCatalogInventory(
                  amapResult.results as unknown as Array<Record<string, unknown>>,
                  'amap',
                );
                return {
                  success: true,
                  results: stamped.results,
                  totalResults: stamped.results.length,
                  source: 'amap',
                  inventory_meta: stamped.inventory_meta,
                };
              }
            } catch (amapErr: any) {
              providerErrors.push(`高德兜底: ${amapErr.message}`);
            }
          }
          providerErrors.push(`Google Places: ${this.hotelDirectService.getUnavailableReason()}`);
          /** 供应商全挂：软失败，勿抛栈（轻量路径会记 live_sensor_audit） */
          this.logger.warn(
            `住宿检索无可用供应商: ${providerErrors.join(' | ')}`,
          );
          return {
            success: false,
            results: [],
            totalResults: 0,
            source: null,
            error: `住宿检索失败。${providerErrors.join(' | ')}`,
          };
        }

        this.logger.debug('使用 HotelDirectService 搜索酒店...');
        
        // 构建酒店搜索参数
        const hotelSearchParams: any = {
          query: params.query ?? params.naturalLanguage,
          destination: params.destination,
          location: location,
          radius: params.radius || 10000,
          type: params.type || 'lodging',
          priceLevel: params.priceLevel,
          minRating: params.minRating,
          checkIn: params.checkIn,
          checkOut: params.checkOut,
          guests: params.guests,
          language: params.language || 'en',
          skipQueryRewrite: params.skipQueryRewrite,
          queryRewriteResult: params.queryRewriteResult,
          multiRouteSearch: params.multiRouteSearch ?? true,
          maxRoutesPerLane: params.maxRoutesPerLane ?? 2,
          rewriteContext: params.rewriteContext ?? {
            selectedDestination: params.destination,
            profile: 'user_facing',
            skipRewrite: Boolean(params.skipQueryRewrite),
          },
        };
        
        // 如果有 tripId 或 countryCode，记录日志（可用于后续增强）
        if (params.tripId) {
          this.logger.debug(`HotelDirectService 搜索使用 tripId: ${params.tripId}`);
        }
        if (params.countryCode) {
          this.logger.debug(`HotelDirectService 搜索使用 countryCode: ${params.countryCode}`);
        }
        
        const hotelResult = await this.hotelDirectService.searchHotels(hotelSearchParams);
        const googleRows = Array.isArray((hotelResult as any)?.results)
          ? ((hotelResult as any).results as Array<Record<string, unknown>>)
          : [];
        const stampedGoogle = stampPoiCatalogInventory(googleRows, 'hotel');
        return {
          ...hotelResult,
          results: stampedGoogle.results,
          totalResults: stampedGoogle.results.length,
          source: 'hotel',
          inventory_meta: stampedGoogle.inventory_meta,
        };

      case 'hotel.getDetails':
        if (!params.placeId) {
          throw new Error('缺少必需参数: placeId');
        }
        if (!this.hotelDirectService) {
          throw new Error('HotelDirectService 不可用');
        }
        return await this.hotelDirectService.getHotelDetails(
          params.placeId,
          params.language || 'en'
        );

      default:
        throw new Error(`未知的 Hotel 工具: ${toolName}`);
    }
  }

  private async executeActivityTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'activity.search': {
        const query = String(
          params.query ?? params.q ?? params.message ?? params.naturalLanguage ?? '',
        ).trim();
        const destination =
          typeof params.destination === 'string' ? params.destination : null;
        const countryCode =
          typeof params.countryCode === 'string' ? params.countryCode : null;
        // 国内活动/门票：国家码 / 常见城市名 / 飞猪锚点（九寨沟等）→ 优先 FlyAI search-poi
        const china =
          isChinaHotelSearchScope({
            countryCode,
            destination,
            placeHint: query,
          }) ||
          isChinaOtaMarketLoose({ countryCode, destination }) ||
          hasChinaFliggyHubHint(query, destination);
        if (china && this.fliggyDirectService?.isServiceAvailable()) {
          const lodging = resolveFliggyLodgingSearch({
            destination:
              typeof params.destination === 'string' ? params.destination : null,
            placeHint: query,
            query,
          });
          const city = lodging?.destName;
          if (city) {
            const fliggy = await this.fliggyDirectService.searchPois({
              cityName: city,
              keyword:
                lodging?.poiName ||
                resolveFliggyHotelKeywords({ query }) ||
                query ||
                undefined,
              limit:
                typeof params.limit === 'number'
                  ? params.limit
                  : Number(params.limit) || 6,
            });
            if (fliggy.activities?.length) {
              return {
                activities: fliggy.activities,
                meta: {
                  query: query || city,
                  browserbase_available: false,
                  probed: 0,
                  fallback: 0,
                  latency_ms: fliggy.latency_ms ?? 0,
                  mode: 'fliggy',
                  source: 'fliggy',
                },
              };
            }
            const kw = await this.fliggyDirectService.keywordSearch(
              query || `${city} 门票`,
              6,
            );
            if (kw.activities?.length) {
              return {
                activities: kw.activities,
                meta: {
                  query: query || city,
                  browserbase_available: false,
                  probed: 0,
                  fallback: 0,
                  latency_ms: kw.latency_ms ?? 0,
                  mode: 'fliggy_keyword',
                  source: 'fliggy',
                },
              };
            }
          }
        }
        if (!this.activityDirectService) {
          throw new Error('ActivityDirectService 不可用');
        }
        return this.activityDirectService.searchActivities({
          query: query || '冰岛活动预订',
          limit: typeof params.limit === 'number' ? params.limit : Number(params.limit) || 4,
          date:
            typeof params.date === 'string'
              ? params.date
              : typeof params.activityDate === 'string'
                ? params.activityDate
                : undefined,
        });
      }
      default:
        throw new Error(`未知的 Activity 工具: ${toolName}`);
    }
  }

  private async executeXiaohongshuTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.xiaohongshuDirectService?.isServiceAvailable()) {
      throw new Error(
        'XiaohongshuDirectService 不可用。请启动 xiaohongshu-mcp（默认 http://localhost:18060/mcp）并设置 XHS_MCP_ENABLED=true',
      );
    }
    switch (toolName) {
      case 'xiaohongshu.search_feeds':
      case 'xiaohongshu.searchFeeds': {
        const keyword = String(
          params.keyword ?? params.query ?? params.q ?? '',
        ).trim();
        const searched = await this.xiaohongshuDirectService.searchFeeds({
          keyword,
          limit:
            typeof params.limit === 'number'
              ? params.limit
              : Number(params.limit) || 20,
          filters:
            params.filters && typeof params.filters === 'object'
              ? (params.filters as {
                  sort_by?: string;
                  note_type?: string;
                  publish_time?: string;
                  search_scope?: string;
                  location?: string;
                })
              : undefined,
        });
        const bundle = mapXhsFeedsToExperienceBundle({
          query: keyword,
          destinationHint:
            typeof params.destination === 'string'
              ? params.destination
              : typeof params.destinationHint === 'string'
                ? params.destinationHint
                : null,
          raw: searched.raw,
          limit:
            typeof params.limit === 'number'
              ? params.limit
              : Number(params.limit) || 20,
        });
        return {
          ...searched,
          experience_bundle: bundle,
          disclaimer_zh: bundle.disclaimerZh,
          narrator_hint_zh: formatXhsExperienceNarratorBlock(bundle),
        };
      }
      case 'xiaohongshu.get_feed_detail':
      case 'xiaohongshu.getFeedDetail':
        return this.xiaohongshuDirectService.getFeedDetail({
          feed_id: String(params.feed_id ?? params.feedId ?? '').trim(),
          xsec_token: String(params.xsec_token ?? params.xsecToken ?? '').trim(),
          load_all_comments:
            params.load_all_comments === true ||
            params.loadAllComments === true,
          limit:
            typeof params.limit === 'number'
              ? params.limit
              : Number(params.limit) || undefined,
        });
      case 'xiaohongshu.user_profile':
      case 'xiaohongshu.userProfile':
        return this.xiaohongshuDirectService.userProfile({
          user_id: String(params.user_id ?? params.userId ?? '').trim(),
          xsec_token: String(params.xsec_token ?? params.xsecToken ?? '').trim(),
        });
      case 'xiaohongshu.list_feeds':
      case 'xiaohongshu.listFeeds':
        return this.xiaohongshuDirectService.listFeeds();
      default:
        throw new Error(`未知或未开放的小红书工具: ${toolName}`);
    }
  }

  private async executeFliggyTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.fliggyDirectService?.isServiceAvailable()) {
      throw new Error(
        'FliggyDirectService 不可用。请安装 @fly-ai/flyai-cli 并可选配置 FLYAI_API_KEY（https://open.fly.ai/docs/quickstart）',
      );
    }
    switch (toolName) {
      case 'fliggy.search_hotel':
      case 'fliggy.hotel_search':
      case 'fliggy.searchHotel': {
        const destName =
          String(params.dest_name ?? params.destName ?? params.destination ?? '').trim() ||
          resolveFliggyDestName({
            destination:
              typeof params.destination === 'string' ? params.destination : null,
            query: typeof params.query === 'string' ? params.query : null,
          }) ||
          '';
        return this.fliggyDirectService.searchHotels({
          destName,
          keyWords: String(params.key_words ?? params.keyWords ?? params.query ?? '').trim() || undefined,
          poiName: String(params.poi_name ?? params.poiName ?? '').trim() || undefined,
          checkInDate: String(params.check_in_date ?? params.checkIn ?? '').trim() || undefined,
          checkOutDate: String(params.check_out_date ?? params.checkOut ?? '').trim() || undefined,
          maxPrice:
            typeof params.max_price === 'number'
              ? params.max_price
              : typeof params.maxPrice === 'number'
                ? params.maxPrice
                : undefined,
          limit: typeof params.limit === 'number' ? params.limit : 12,
        });
      }
      case 'fliggy.search_poi':
      case 'fliggy.poi_search':
      case 'fliggy.searchPoi': {
        const cityName =
          String(params.city_name ?? params.cityName ?? params.destination ?? '').trim() ||
          resolveFliggyDestName({
            destination:
              typeof params.destination === 'string' ? params.destination : null,
            query: typeof params.query === 'string' ? params.query : null,
          }) ||
          '';
        return this.fliggyDirectService.searchPois({
          cityName,
          keyword: String(params.keyword ?? params.query ?? '').trim() || undefined,
          category: String(params.category ?? '').trim() || undefined,
          poiLevel:
            typeof params.poi_level === 'number'
              ? params.poi_level
              : typeof params.poiLevel === 'number'
                ? params.poiLevel
                : undefined,
          limit: typeof params.limit === 'number' ? params.limit : 6,
        });
      }
      case 'fliggy.search_flight':
      case 'fliggy.searchFlight':
      case 'fliggy.flight_search': {
        return this.fliggyDirectService.searchFlights({
          origin: String(params.origin ?? params.from ?? '').trim(),
          destination: String(params.destination ?? params.to ?? '').trim() || undefined,
          depDate: String(
            params.dep_date ?? params.depDate ?? params.departureDate ?? '',
          ).trim() || undefined,
          backDate: String(
            params.back_date ?? params.backDate ?? params.returnDate ?? '',
          ).trim() || undefined,
          sortType:
            typeof params.sort_type === 'number' || typeof params.sort_type === 'string'
              ? params.sort_type
              : typeof params.sortType === 'number' || typeof params.sortType === 'string'
                ? params.sortType
                : 3,
          maxPrice:
            typeof params.max_price === 'number'
              ? params.max_price
              : typeof params.maxPrice === 'number'
                ? params.maxPrice
                : undefined,
          limit: typeof params.limit === 'number' ? params.limit : 6,
        });
      }
      case 'fliggy.keyword_search':
      case 'fliggy.keywordSearch': {
        const q = String(params.query ?? params.q ?? '').trim();
        return this.fliggyDirectService.keywordSearch(
          q,
          typeof params.limit === 'number' ? params.limit : 8,
        );
      }
      default:
        throw new Error(`未知的 Fliggy 工具: ${toolName}`);
    }
  }

  private async executeRestaurantTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'restaurant.search':
      case 'restaurant.nearby': {
        const query = String(params.query ?? params.q ?? 'restaurant').trim() || 'restaurant';
        const china = isChinaHotelSearchScope({
          countryCode:
            typeof params.countryCode === 'string' ? params.countryCode : null,
          destination:
            typeof params.destination === 'string' ? params.destination : null,
          placeHint: query,
        }) ||
          isChinaOtaMarketLoose({
            countryCode:
              typeof params.countryCode === 'string' ? params.countryCode : null,
            destination:
              typeof params.destination === 'string' ? params.destination : null,
          }) ||
          hasChinaFliggyHubHint(query, params.destination as string | undefined);
        if (china && this.fliggyDirectService?.isServiceAvailable()) {
          const city =
            resolveFliggyDestName({
              destination:
                typeof params.destination === 'string' ? params.destination : null,
              placeHint: query,
              query,
            }) || undefined;
          const fliggy = await this.fliggyDirectService.searchRestaurants({
            query,
            cityHint: city,
            limit:
              typeof params.limit === 'number' ? params.limit : Number(params.limit) || 6,
          });
          if (fliggy.restaurants.length) {
            return {
              restaurants: fliggy.restaurants.map((r) => ({
                ...r,
                name: r.nameZh,
                cta_zh: r.cta_zh,
                source: 'fliggy',
              })),
              meta: {
                source: 'fliggy',
                mode: 'fliggy_keyword',
                latency_ms: fliggy.latency_ms,
              },
            };
          }
        }
        if (!this.restaurantDirectService?.isServiceAvailable?.()) {
          throw new Error('RestaurantDirectService 不可用');
        }
        const location =
          params.location && typeof params.location === 'object'
            ? (params.location as { lat?: number; lng?: number })
            : undefined;
        return this.restaurantDirectService.searchRestaurants({
          query,
          ...(location?.lat != null && location?.lng != null
            ? { location: { lat: Number(location.lat), lng: Number(location.lng) } }
            : {}),
          radius: typeof params.radius === 'number' ? params.radius : Number(params.radius) || 8000,
          minRating:
            typeof params.minRating === 'number' ? params.minRating : Number(params.minRating) || undefined,
          language: String(params.language ?? (china ? 'zh' : 'en')),
          type: String(params.type ?? 'restaurant'),
        });
      }
      default:
        throw new Error(`未知的 Restaurant 工具: ${toolName}`);
    }
  }

  /** Booking.com 地点项 → 坐标（上游字段名不统一） */
  private extractBookingCarLocationCoords(item: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
    if (!item || typeof item !== 'object') return null;
    const coords = item.coordinates as Record<string, unknown> | undefined;
    const latRaw =
      typeof item.latitude === 'number'
        ? item.latitude
        : coords && typeof coords.latitude === 'number'
          ? coords.latitude
          : undefined;
    const lngRaw =
      typeof item.longitude === 'number'
        ? item.longitude
        : coords && typeof coords.longitude === 'number'
          ? coords.longitude
          : undefined;
    if (typeof latRaw === 'number' && typeof lngRaw === 'number' && Number.isFinite(latRaw) && Number.isFinite(lngRaw)) {
      return { lat: latRaw, lng: lngRaw };
    }
    return null;
  }

  /**
   * Booking.com 租车：先 searchDestination 取坐标再 searchCarRentals。
   * 工具名：`car_rental.search`（复合）、`car_rental.searchLocation`。
   */
  private async executeBookingComTool(toolName: string, params: Record<string, any>): Promise<any> {
    const stripPrefix = (t: string) => (t.startsWith('car_rental.') ? t.slice('car_rental.'.length) : t);
    const op = stripPrefix(toolName);

    const pickupQuery = String(
      params.pickupQuery ?? params.pick_up_query ?? params.query ?? '',
    ).trim();
    const userQuery = String(params.query ?? params.naturalLanguage ?? pickupQuery).trim();
    const destParam =
      typeof params.destination === 'string' ? params.destination : null;
    const countryParam =
      typeof params.countryCode === 'string' ? params.countryCode : null;
    const chinaCar =
      isChinaHotelSearchScope({
        countryCode: countryParam,
        destination: destParam,
        placeHint: userQuery || pickupQuery,
      }) ||
      isChinaOtaMarketLoose({
        countryCode: countryParam,
        destination: destParam,
      }) ||
      // pickupQuery/location 被误填成国家码 CN 时也要识别为国内
      isChinaOtaMarketLoose({
        countryCode: /^[A-Za-z]{2}$/.test(pickupQuery) ? pickupQuery : null,
        destination: pickupQuery,
      }) ||
      isChinaOtaMarketLoose({
        countryCode:
          typeof params.location === 'string' && /^[A-Za-z]{2}$/.test(params.location)
            ? params.location
            : null,
        destination: typeof params.location === 'string' ? params.location : null,
      }) ||
      hasChinaFliggyHubHint(userQuery, pickupQuery, destParam);

    if (
      chinaCar &&
      this.fliggyDirectService?.isServiceAvailable() &&
      (op === 'search' || op === 'searchCarRentals')
    ) {
      const cleanQuery = stripClientContextAppendix(userQuery || pickupQuery);
      const pickupMatch = cleanQuery.match(
        /([\u4e00-\u9fff]{2,8})\s*租车|(?:在|从)\s*([\u4e00-\u9fff]{2,8})\s*(?:取车|租)/,
      );
      const city =
        pickupMatch?.[1] ||
        pickupMatch?.[2] ||
        resolveFliggyDestName({
          destination:
            destParam && !/^(CN|CHN|China|中国)$/i.test(destParam) ? destParam : null,
          placeHint: cleanQuery || pickupQuery,
          query: cleanQuery || pickupQuery,
        }) ||
        undefined;
      const fliggyQuery = city
        ? `${city} 租车`
        : /租车/.test(cleanQuery)
          ? cleanQuery
          : cleanQuery || '租车';
      const fliggy = await this.fliggyDirectService.searchCarRentals({
        query: fliggyQuery,
        cityHint: city,
        limit: typeof params.limit === 'number' ? params.limit : 6,
      });
      if (fliggy.carRentals.length) {
        this.logger.log(`[car_rental] 国内优先飞猪 keyword-search city=${city ?? '—'}`);
        return {
          car_rentals: fliggy.carRentals.map((c) => ({
            ...c,
            name: c.nameZh,
            nameZh: c.nameZh,
            cta_zh: c.cta_zh,
            source: 'fliggy',
          })),
          carRentals: fliggy.carRentals,
          meta: {
            source: 'fliggy',
            mode: 'fliggy_keyword',
            latency_ms: fliggy.latency_ms,
          },
        };
      }
      // 国内市场勿回落 Browserbase/海外 Booking（慢且易触发客户端 ~10s 断连）
      this.logger.warn(
        `[car_rental] 国内飞猪无结果，跳过海外回落 city=${city ?? '—'} err=${fliggy.error ?? 'empty'}`,
      );
      return {
        car_rentals: [],
        carRentals: [],
        meta: {
          source: 'fliggy',
          mode: 'fliggy_keyword_empty',
          latency_ms: fliggy.latency_ms,
          ...(fliggy.error ? { error: fliggy.error } : {}),
        },
      };
    }

    /** 无 Booking Key：Browserbase 探车行官网 + 静态目录（与活动预订同款） */
    if (!this.bookingComService?.isAvailable()) {
      if (this.carRentalDirectService?.isAvailable() && (op === 'search' || op === 'searchCarRentals')) {
        this.logger.log(
          '[car_rental] Booking.com 未配置 → CarRentalDirect（Browserbase/目录）',
        );
        return await this.carRentalDirectService.searchCarRentals({
          query: String(params.query ?? params.pickupQuery ?? params.pick_up_query ?? '').trim(),
          pickupQuery: String(params.pickupQuery ?? params.pick_up_query ?? 'Reykjavik').trim(),
          limit: typeof params.limit === 'number' ? params.limit : 4,
        });
      }
      throw new Error(
        'Booking.com 租车不可用：请配置 RAPIDAPI_BOOKING_COM_API_KEY（或启用 CarRentalDirect）',
      );
    }

    switch (op) {
      case 'search':
      case 'searchCarRentals': {
        const pickupQuery = String(params.pickupQuery ?? params.pick_up_query ?? 'Reykjavik').trim();
        const dropQuery = String(params.dropQuery ?? params.drop_off_query ?? pickupQuery).trim();
        const pickLoc = await this.bookingComService.searchCarLocation({ query: pickupQuery });
        const dropLoc =
          dropQuery === pickupQuery
            ? pickLoc
            : await this.bookingComService.searchCarLocation({ query: dropQuery });
        const rawPick = Array.isArray(pickLoc.data) && pickLoc.data[0] ? (pickLoc.data[0] as Record<string, unknown>) : null;
        const rawDrop = Array.isArray(dropLoc.data) && dropLoc.data[0] ? (dropLoc.data[0] as Record<string, unknown>) : null;
        const p0 = this.extractBookingCarLocationCoords(rawPick);
        const d0 = this.extractBookingCarLocationCoords(rawDrop);
        if (!p0 || !d0) {
          throw new Error('未解析到租车取/还点坐标，请调整 pickupQuery / 城市名');
        }
        return await this.bookingComService.searchCarRentals({
          pick_up_latitude: p0.lat,
          pick_up_longitude: p0.lng,
          drop_off_latitude: d0.lat,
          drop_off_longitude: d0.lng,
          pick_up_time: String(params.pick_up_time || '10:00'),
          drop_off_time: String(params.drop_off_time || '10:00'),
          driver_age: typeof params.driver_age === 'number' ? params.driver_age : 30,
          currency_code: params.currency_code || 'USD',
          location: params.location || 'US',
          pick_up_date: params.pick_up_date,
          drop_off_date: params.drop_off_date,
        });
      }
      case 'searchLocation':
      case 'searchCarLocation':
        return await this.bookingComService.searchCarLocation({
          query: String(params.query ?? params.pickupQuery ?? '').trim(),
        });

      default:
        throw new Error(`未知的 Booking.com 租车工具: ${toolName}`);
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
      case 'xiaohongshu':
      case 'xhs':
        return this.xiaohongshuDirectService?.isServiceAvailable() === true;
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
   * 使用高级地理编码服务（如果可用），否则使用基础策略
   * 
   * 策略：
   * 1. 如果高级地理编码服务可用，使用它（支持地标识别、相对位置、上下文理解等）
   * 2. 否则使用基础策略：
   *    - 检查常见的中文-英文映射（支持别名）
   *    - 检查地理编码缓存
   *    - Google Maps 地理编码
   *    - 返回原始名称（让天气服务自己处理）
   */
  private async normalizeLocationName(
    location: string,
    context?: { selectedDestination?: string; language?: string }
  ): Promise<string> {
    if (!location || typeof location !== 'string') {
      return location;
    }

    // 如果高级地理编码服务可用，优先使用它
    if (this.advancedGeocodingService) {
      try {
        const locationContext: LocationContext = {
          selectedDestination: context?.selectedDestination,
          language: context?.language || 'en',
        };

        const geocodeResult = await this.advancedGeocodingService.geocode(location, locationContext);
        
        if (geocodeResult.confidence >= 0.6) {
          this.logger.debug(`高级地理编码成功: "${location}" -> "${geocodeResult.normalizedName}" (confidence=${geocodeResult.confidence}, source=${geocodeResult.source})`);
          
          // 如果有坐标，可以返回坐标格式（某些服务支持）
          if (geocodeResult.coordinates) {
            // 对于天气服务，优先返回城市名称
            return geocodeResult.normalizedName;
          }
          
          return geocodeResult.normalizedName;
        } else {
          this.logger.debug(`高级地理编码置信度较低(${geocodeResult.confidence})，降级到基础策略`);
        }
      } catch (error: any) {
        this.logger.warn(`高级地理编码失败: "${location}", error: ${error.message}，降级到基础策略`);
      }
    }

    // 降级到基础策略
    return this.normalizeLocationNameBasic(location);
  }

  /**
   * 基础位置名称标准化（原有逻辑）
   */
  private async normalizeLocationNameBasic(location: string): Promise<string> {
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

  /**
   * 国家代码 → Airbnb 搜索用城市名（城市, 国家）
   * 当 location 为国家代码时，Airbnb 对坐标搜索常返回空结果，改用城市名可提高命中率
   */
  private readonly countryCodeToAirbnbCityMap: Record<string, string> = {
    IS: 'Reykjavik, Iceland',
    JP: 'Tokyo, Japan',
    TH: 'Bangkok, Thailand',
    IT: 'Rome, Italy',
    NZ: 'Auckland, New Zealand',
    ES: 'Madrid, Spain',
    CH: 'Zurich, Switzerland',
    MV: 'Malé, Maldives',
    CN: 'Beijing, China',
    US: 'New York, United States',
    GB: 'London, United Kingdom',
    FR: 'Paris, France',
    DE: 'Berlin, Germany',
    AU: 'Sydney, Australia',
    CA: 'Toronto, Canada',
    KR: 'Seoul, South Korea',
    SG: 'Singapore',
    MY: 'Kuala Lumpur, Malaysia',
    VN: 'Hanoi, Vietnam',
    GL: 'Nuuk, Greenland',
    SJ: 'Longyearbyen, Svalbard',
    AR: 'Buenos Aires, Argentina',
    NO: 'Oslo, Norway',
    NP: 'Kathmandu, Nepal',
    ID: 'Bali, Indonesia',
    PH: 'Manila, Philippines',
    IN: 'Mumbai, India',
    PT: 'Lisbon, Portugal',
    GR: 'Athens, Greece',
    TR: 'Istanbul, Turkey',
    NL: 'Amsterdam, Netherlands',
    BE: 'Brussels, Belgium',
    AT: 'Vienna, Austria',
    SE: 'Stockholm, Sweden',
    FI: 'Helsinki, Finland',
    DK: 'Copenhagen, Denmark',
    IE: 'Dublin, Ireland',
    PL: 'Warsaw, Poland',
    CZ: 'Prague, Czech Republic',
    HU: 'Budapest, Hungary',
    RU: 'Moscow, Russia',
    BR: 'Rio de Janeiro, Brazil',
    MX: 'Mexico City, Mexico',
    ZA: 'Cape Town, South Africa',
    AE: 'Dubai, United Arab Emirates',
  };

  /**
   * 从国家代码获取 Airbnb 搜索用城市名（城市, 国家）
   * 当 location 为国家代码时使用，提高 Airbnb 搜索命中率
   */
  private getAirbnbLocationFromCountryCode(countryCode: string): string | null {
    return this.countryCodeToAirbnbCityMap[countryCode.toUpperCase()] ?? null;
  }

  /** 国家边界框 [latMin, latMax, lngMin, lngMax]，用于过滤 Airbnb 结果 */
  private readonly countryBoundingBox: Record<string, [number, number, number, number]> = {
    IS: [63.2, 66.6, -24.6, -13.4],   // 冰岛
    US: [24.5, 49.4, -125, -66.9],    // 美国本土
    JP: [24.2, 45.5, 123, 154],      // 日本
    GB: [49.9, 60.9, -8.6, 1.8],     // 英国
  };

  private filterListingsByCountry(listings: any[], countryCode: string): any[] {
    const box = this.countryBoundingBox[countryCode.toUpperCase()];
    if (!box) return listings;
    const [latMin, latMax, lngMin, lngMax] = box;
    return listings.filter((l) => {
      const lat = l.demandStayListing?.location?.coordinate?.latitude ?? l.location?.lat;
      const lng = l.demandStayListing?.location?.coordinate?.longitude ?? l.location?.lng;
      if (lat == null || lng == null) return true; // 无坐标则保留
      return lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax;
    });
  }

  /** Haversine km；无坐标的 listing 保留 */
  private filterListingsNearAnchor(
    listings: any[],
    anchor: { lat: number; lng: number },
    maxKm: number,
  ): any[] {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    return listings.filter((l) => {
      const lat = Number(
        l.demandStayListing?.location?.coordinate?.latitude ?? l.location?.lat ?? l.listing_lat,
      );
      const lng = Number(
        l.demandStayListing?.location?.coordinate?.longitude ?? l.location?.lng ?? l.listing_lng,
      );
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
      const dLat = toRad(lat - anchor.lat);
      const dLng = toRad(lng - anchor.lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(anchor.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
      const km = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return km <= maxKm;
    });
  }

  /**
   * Airbnb：有入住窗时优先带价结果。
   * 房源页粗探默认关闭（避免拖垮 LIVE_TOOL）；设 HOTEL_INVENTORY_VERIFY=1 才开启。
   */
  private async verifyAirbnbStayInventory(
    listings: any[],
    opts: {
      checkIn?: string;
      checkOut?: string;
      adults?: number;
    },
  ): Promise<{ results: any[]; inventory_meta: HotelInventoryMeta }> {
    const hasStayDates = Boolean(opts.checkIn && opts.checkOut);
    const preferPriced =
      process.env.HOTEL_INVENTORY_REQUIRE_PRICE !== '0' &&
      process.env.HOTEL_INVENTORY_REQUIRE_PRICE !== 'false';
    let pool = preferPriced
      ? preferStayPricedAirbnbListings(listings, hasStayDates)
      : [...listings];
    /** 单晚场景尽快返回，最多保留 8 条 */
    pool = pool.slice(0, 8);

    const topNRaw = parseInt(process.env.HOTEL_INVENTORY_VERIFY_TOP_N ?? '', 10);
    const topN = Number.isFinite(topNRaw) && topNRaw > 0 ? Math.min(topNRaw, 5) : 3;
    const budgetRaw = parseInt(process.env.HOTEL_INVENTORY_VERIFY_MS ?? '', 10);
    const budgetMs =
      Number.isFinite(budgetRaw) && budgetRaw > 0 ? Math.min(budgetRaw, 8_000) : 4_000;
    const perProbeMs = Math.max(
      1_500,
      Math.floor(budgetMs / Math.max(1, Math.min(topN, pool.length))),
    );

    /** 默认关闭页探：搜索成功 + 价签过滤已够用；显式 HOTEL_INVENTORY_VERIFY=1 才开 */
    const enableProbe =
      process.env.HOTEL_INVENTORY_VERIFY === '1' ||
      process.env.HOTEL_INVENTORY_VERIFY === 'true';
    const disableProbe = !enableProbe || !hasStayDates || !this.airbnbService;

    let dropped = 0;
    let probed = 0;
    let verifiedCount = 0;
    const kept: any[] = [];

    const toProbe = disableProbe ? [] : pool.slice(0, topN);
    const rest = disableProbe ? pool : pool.slice(topN);

    if (toProbe.length > 0 && this.airbnbService) {
      const probePromise = Promise.all(
        toProbe.map(async (listing) => {
          const id = String(listing?.id || listing?.listingId || '').trim();
          if (!id) {
            return { listing, available: 'unknown' as const };
          }
          const hit = await this.airbnbService!.probeListingStayAvailability({
            listingId: id,
            checkin: opts.checkIn,
            checkout: opts.checkOut,
            adults: opts.adults ?? 1,
            timeoutMs: perProbeMs,
          });
          return { listing, available: hit.available };
        }),
      );
      const raced = await Promise.race([
        probePromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), budgetMs)),
      ]);

      if (raced) {
        probed = raced.length;
        for (const row of raced) {
          if (row.available === false) {
            dropped += 1;
            continue;
          }
          if (row.available === true) {
            verifiedCount += 1;
            kept.push(
              tagAirbnbInventoryFields(
                row.listing as Record<string, unknown>,
                'detail_verified',
                true,
              ),
            );
            continue;
          }
          const priced = listingHasStayPriceHint(row.listing);
          kept.push(
            tagAirbnbInventoryFields(
              row.listing as Record<string, unknown>,
              priced && hasStayDates ? 'stay_priced' : 'unverified',
              false,
            ),
          );
        }
      } else {
        this.logger.debug(`Airbnb 库存核验超时(${budgetMs}ms)，回退价签过滤结果`);
        for (const listing of toProbe) {
          const priced = listingHasStayPriceHint(listing);
          if (preferPriced && hasStayDates && !priced) {
            dropped += 1;
            continue;
          }
          kept.push(
            tagAirbnbInventoryFields(
              listing as Record<string, unknown>,
              priced && hasStayDates ? 'stay_priced' : 'unverified',
              false,
            ),
          );
        }
      }
    }

    for (const listing of rest) {
      const priced = listingHasStayPriceHint(listing);
      if (preferPriced && hasStayDates && !priced) {
        dropped += 1;
        continue;
      }
      kept.push(
        tagAirbnbInventoryFields(
          listing as Record<string, unknown>,
          priced && hasStayDates ? 'stay_priced' : 'unverified',
          false,
        ),
      );
    }

    /** 价签全空时勿清空结果：标 unverified 并降级给下游 */
    if (kept.length === 0 && listings.length > 0) {
      for (const listing of listings.slice(0, 8)) {
        kept.push(
          tagAirbnbInventoryFields(listing as Record<string, unknown>, 'unverified', false),
        );
      }
    }

    const inventory_verified = verifiedCount > 0;
    const inventory_mode = inventory_verified
      ? 'detail_verified'
      : hasStayDates && kept.some((r) => listingHasStayPriceHint(r))
        ? 'stay_priced'
        : 'unverified';
    const disclaimer_zh = inventory_verified
      ? `已对前 ${probed} 条做日期可订粗探，剔除 ${dropped} 条明确不可订；下单前仍请以平台实时为准。`
      : hasStayDates
        ? `已按入住窗优先保留带价房源（剔除 ${dropped} 条弱信号）；未完成逐条核验时下单前请确认可订性。`
        : '未指定入住日期，以下房源未做可订核验。';

    return {
      results: kept.slice(0, 12),
      inventory_meta: {
        inventory_verified,
        inventory_mode,
        verified_count: verifiedCount,
        dropped_unavailable: dropped,
        probed_count: probed,
        disclaimer_zh,
      },
    };
  }

  /**
   * 批量获取 Airbnb 房源详情（图片、地址），补充到搜索结果
   */
  private async enrichAirbnbResultsWithDetails(
    listings: any[],
    opts: { checkIn?: string; checkOut?: string; adults?: number; limit?: number }
  ): Promise<any[]> {
    const svc = this.airbnbService;
    if (!svc || listings.length === 0) return listings;
    const limit = opts.limit ?? 5;
    const toEnrich = listings.slice(0, limit);
    const results = await Promise.allSettled(
      toEnrich.map((l) => {
        const id = l.id || l.listingId;
        if (!id) return Promise.resolve(null);
        return svc.getListingDetails({
          listingId: String(id),
          checkin: opts.checkIn,
          checkout: opts.checkOut,
          adults: opts.adults ?? 1,
          ignoreRobotsText: true,
        });
      })
    );
    const enriched = [...listings];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status !== 'fulfilled' || !r.value?.content?.[0]?.text) continue;
      try {
        const raw = JSON.parse(r.value.content[0].text);
        const data = raw?.data ?? raw; // 兼容 { data: {...} } 包装
        const listing = enriched[i];
        if (!listing) continue;
        // 提取图片
        const photos: string[] = [];
        const rawPhotos = data.photos ?? data.listing?.photos ?? data.demandStayListing?.photos ?? data.images ?? [];
        for (const p of Array.isArray(rawPhotos) ? rawPhotos : []) {
          const url = typeof p === 'string' ? p : p?.url ?? p?.picture ?? p?.large ?? p?.medium;
          if (url && typeof url === 'string') photos.push(url);
        }
        if (photos.length > 0) {
          listing.contextualPictures = photos.map((url) => ({ picture: url, url }));
          listing.photos = photos.map((url) => ({ url }));
          listing.images = photos;
        }
        // 提取地址（仅当为真实地址，非 room specs）
        const addr =
          data.demandStayListing?.location?.address ??
          data.listing?.location?.address ??
          data.listing?.address ??
          data.address ??
          data.location?.address ??
          data.formatted_address;
        if (addr && typeof addr === 'string' && !/^\d+\s*(bedroom|bed|bath)/i.test(addr)) {
          listing._enrichedAddress = addr;
        }
      } catch (_) {}
    }
    return enriched;
  }

  /**
   * 从国家代码获取国家名称（用于地理编码）
   */
  private getCountryNameFromCode(countryCode: string): string {
    const countryCodeMap: Record<string, string> = {
      'IS': 'Iceland',
      'JP': 'Japan',
      'TH': 'Thailand',
      'IT': 'Italy',
      'NZ': 'New Zealand',
      'ES': 'Spain',
      'CH': 'Switzerland',
      'MV': 'Maldives',
      'CN': 'China',
      'US': 'United States',
      'GB': 'United Kingdom',
      'FR': 'France',
      'DE': 'Germany',
      'AU': 'Australia',
      'CA': 'Canada',
      'KR': 'South Korea',
      'SG': 'Singapore',
      'MY': 'Malaysia',
      'VN': 'Vietnam',
      'GL': 'Greenland',
      'SJ': 'Svalbard',
      'AR': 'Argentina',
      'NO': 'Norway',
      'NP': 'Nepal',
    };
    
    return countryCodeMap[countryCode.toUpperCase()] || countryCode;
  }

  /**
   * 获取预定义的国家中心坐标（降级方案）
   * 当 Google Maps API 超时或失败时使用
   */
  private getCountryCenterCoordinates(countryCode: string): { lat: number; lng: number } | null {
    const countryCenters: Record<string, { lat: number; lng: number }> = {
      // 冰岛 - 使用雷克雅未克附近（黄金圈区域）
      'IS': { lat: 64.9631, lng: -19.0208 },
      // 日本 - 东京
      'JP': { lat: 35.6762, lng: 139.6503 },
      // 泰国 - 曼谷
      'TH': { lat: 13.7563, lng: 100.5018 },
      // 意大利 - 罗马
      'IT': { lat: 41.9028, lng: 12.4964 },
      // 新西兰 - 奥克兰
      'NZ': { lat: -36.8485, lng: 174.7633 },
      // 西班牙 - 马德里
      'ES': { lat: 40.4168, lng: -3.7038 },
      // 瑞士 - 苏黎世
      'CH': { lat: 47.3769, lng: 8.5417 },
      // 马尔代夫 - 马累
      'MV': { lat: 4.1755, lng: 73.5093 },
      // 中国 - 北京
      'CN': { lat: 39.9042, lng: 116.4074 },
      // 美国 - 纽约
      'US': { lat: 40.7128, lng: -74.0060 },
      // 英国 - 伦敦
      'GB': { lat: 51.5074, lng: -0.1278 },
      // 法国 - 巴黎
      'FR': { lat: 48.8566, lng: 2.3522 },
      // 德国 - 柏林
      'DE': { lat: 52.5200, lng: 13.4050 },
      // 澳大利亚 - 悉尼
      'AU': { lat: -33.8688, lng: 151.2093 },
      // 加拿大 - 多伦多
      'CA': { lat: 43.6532, lng: -79.3832 },
      // 韩国 - 首尔
      'KR': { lat: 37.5665, lng: 126.9780 },
      // 新加坡
      'SG': { lat: 1.3521, lng: 103.8198 },
      // 马来西亚 - 吉隆坡
      'MY': { lat: 3.1390, lng: 101.6869 },
      // 越南 - 河内
      'VN': { lat: 21.0285, lng: 105.8542 },
      // 格陵兰
      'GL': { lat: 64.1814, lng: -51.6941 },
      // 斯瓦尔巴
      'SJ': { lat: 78.2232, lng: 15.6267 },
      // 阿根廷 - 布宜诺斯艾利斯
      'AR': { lat: -34.6037, lng: -58.3816 },
      // 挪威 - 奥斯陆
      'NO': { lat: 59.9139, lng: 10.7522 },
      // 尼泊尔 - 加德满都
      'NP': { lat: 27.7172, lng: 85.3240 },
    };
    
    const coords = countryCenters[countryCode.toUpperCase()];
    if (coords) {
      this.logger.debug(`使用预定义国家中心坐标: ${countryCode} -> (${coords.lat}, ${coords.lng})`);
      return coords;
    }
    
    return null;
  }
}
