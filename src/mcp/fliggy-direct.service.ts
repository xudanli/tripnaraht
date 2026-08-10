/**
 * 飞猪 FlyAI Direct：封装官方 @fly-ai/flyai-cli（Fliggy MCP）。
 * Quick Start: https://open.fly.ai/docs/quickstart
 *
 * 环境变量：
 * - FLYAI_API_KEY（可选，提高配额；Console 申请）
 * - FLYAI_CLI_PATH（可选，覆盖 CLI 二进制路径）
 * - FLYAI_ENABLED=false 可强制关闭
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildFliggyCliArgs,
  isFliggyCliAvailable,
  isFliggyRateLimitError,
  runFliggyCli,
} from './fliggy-cli.runner';
import { stripClientContextAppendix } from './fliggy-dest.util';
import {
  mapFliggyActivityRows,
  mapFliggyCommerceRows,
  mapFliggyFlightRows,
  mapFliggyHotelRows,
  type FliggyActivityCard,
  type FliggyCommerceCard,
  type FliggyFlightCard,
  type FliggyHotelCard,
} from './fliggy-result.mapper';

export type FliggyHotelSearchParams = {
  destName: string;
  keyWords?: string;
  poiName?: string;
  checkInDate?: string;
  checkOutDate?: string;
  maxPrice?: number;
  hotelStars?: string;
  sort?: string;
  limit?: number;
};

export type FliggyPoiSearchParams = {
  cityName: string;
  keyword?: string;
  category?: string;
  poiLevel?: number;
  limit?: number;
};

export type FliggyFlightSearchParams = {
  origin: string;
  destination?: string;
  depDate?: string;
  backDate?: string;
  sortType?: number | string;
  maxPrice?: number;
  limit?: number;
};

@Injectable()
export class FliggyDirectService {
  private readonly logger = new Logger(FliggyDirectService.name);
  private readonly apiKey: string | null;
  private readonly forceDisabled: boolean;

  constructor(@Optional() private readonly configService?: ConfigService) {
    const raw =
      this.configService?.get<string>('FLYAI_API_KEY') ||
      process.env.FLYAI_API_KEY ||
      '';
    this.apiKey = raw.replace(/^["']|["']$/g, '').trim() || null;
    const en =
      this.configService?.get<string>('FLYAI_ENABLED') ??
      process.env.FLYAI_ENABLED;
    this.forceDisabled = String(en ?? 'true').toLowerCase() === 'false';
    if (this.isServiceAvailable()) {
      this.logger.log(
        `✅ Fliggy FlyAI 可用（CLI）${this.apiKey ? '，已配置 FLYAI_API_KEY' : '，未配置 API Key（试用额度）'}`,
      );
    } else if (!this.forceDisabled) {
      this.logger.warn(
        '⚠️ Fliggy FlyAI CLI 未就绪：请 npm i @fly-ai/flyai-cli，文档 https://open.fly.ai/docs/quickstart',
      );
    }
  }

  isServiceAvailable(): boolean {
    if (this.forceDisabled) return false;
    return isFliggyCliAvailable();
  }

  async searchHotels(params: FliggyHotelSearchParams): Promise<{
    success: boolean;
    results: FliggyHotelCard[];
    totalResults: number;
    source: 'fliggy';
    error?: string;
    latency_ms?: number;
    rateLimited?: boolean;
    attempts?: number;
  }> {
    if (!this.isServiceAvailable()) {
      return {
        success: false,
        results: [],
        totalResults: 0,
        source: 'fliggy',
        error: 'Fliggy FlyAI CLI 不可用',
      };
    }
    const dest = String(params.destName ?? '').trim();
    if (!dest) {
      return {
        success: false,
        results: [],
        totalResults: 0,
        source: 'fliggy',
        error: 'destName 必填',
      };
    }
    const args = buildFliggyCliArgs('search-hotel', {
      '--dest-name': dest,
      '--key-words': params.keyWords,
      '--poi-name': params.poiName,
      '--check-in-date': params.checkInDate,
      '--check-out-date': params.checkOutDate,
      '--max-price': params.maxPrice,
      '--hotel-stars': params.hotelStars,
      '--sort': params.sort ?? 'rate_desc',
    });
    const run = await runFliggyCli(args, { apiKey: this.apiKey });
    if (!run.ok) {
      const rateLimited =
        run.rateLimited === true || isFliggyRateLimitError(run.error);
      this.logger.warn(
        `飞猪酒店搜索失败${rateLimited ? '（限流）' : ''}` +
          `${run.attempts ? ` attempts=${run.attempts}` : ''}: ${run.error}`,
      );
      return {
        success: false,
        results: [],
        totalResults: 0,
        source: 'fliggy',
        error: run.error,
        latency_ms: run.latencyMs,
        rateLimited,
        attempts: run.attempts,
      };
    }
    const results = mapFliggyHotelRows(run.data, {
      limit: params.limit ?? 12,
      checkInDate: params.checkInDate,
      checkOutDate: params.checkOutDate,
    });
    return {
      success: results.length > 0,
      results,
      totalResults: results.length,
      source: 'fliggy',
      latency_ms: run.latencyMs,
      attempts: run.attempts,
      ...(results.length ? {} : { error: '飞猪酒店无结果' }),
    };
  }

  async searchPois(params: FliggyPoiSearchParams): Promise<{
    success: boolean;
    activities: FliggyActivityCard[];
    totalResults: number;
    source: 'fliggy';
    error?: string;
    latency_ms?: number;
  }> {
    if (!this.isServiceAvailable()) {
      return {
        success: false,
        activities: [],
        totalResults: 0,
        source: 'fliggy',
        error: 'Fliggy FlyAI CLI 不可用',
      };
    }
    const city = String(params.cityName ?? '').trim();
    if (!city) {
      return {
        success: false,
        activities: [],
        totalResults: 0,
        source: 'fliggy',
        error: 'cityName 必填',
      };
    }
    const args = buildFliggyCliArgs('search-poi', {
      '--city-name': city,
      '--keyword': params.keyword,
      '--category': params.category,
      '--poi-level': params.poiLevel,
    });
    const run = await runFliggyCli(args, { apiKey: this.apiKey });
    if (!run.ok) {
      this.logger.warn(`飞猪景点搜索失败: ${run.error}`);
      return {
        success: false,
        activities: [],
        totalResults: 0,
        source: 'fliggy',
        error: run.error,
        latency_ms: run.latencyMs,
      };
    }
    const activities = mapFliggyActivityRows(run.data, {
      limit: params.limit ?? 6,
    });
    return {
      success: activities.length > 0,
      activities,
      totalResults: activities.length,
      source: 'fliggy',
      latency_ms: run.latencyMs,
      ...(activities.length ? {} : { error: '飞猪景点无结果' }),
    };
  }

  async searchFlights(params: FliggyFlightSearchParams): Promise<{
    success: boolean;
    flights: FliggyFlightCard[];
    totalResults: number;
    source: 'fliggy';
    error?: string;
    latency_ms?: number;
  }> {
    if (!this.isServiceAvailable()) {
      return {
        success: false,
        flights: [],
        totalResults: 0,
        source: 'fliggy',
        error: 'Fliggy FlyAI CLI 不可用',
      };
    }
    const origin = String(params.origin ?? '').trim();
    if (!origin) {
      return {
        success: false,
        flights: [],
        totalResults: 0,
        source: 'fliggy',
        error: 'origin 必填',
      };
    }
    const args = buildFliggyCliArgs('search-flight', {
      '--origin': origin,
      '--destination': params.destination,
      '--dep-date': params.depDate,
      '--back-date': params.backDate,
      '--sort-type': params.sortType ?? 3,
      '--max-price': params.maxPrice,
    });
    const run = await runFliggyCli(args, { apiKey: this.apiKey });
    if (!run.ok) {
      this.logger.warn(`飞猪机票搜索失败: ${run.error}`);
      return {
        success: false,
        flights: [],
        totalResults: 0,
        source: 'fliggy',
        error: run.error,
        latency_ms: run.latencyMs,
      };
    }
    const flights = mapFliggyFlightRows(run.data, { limit: params.limit ?? 6 });
    return {
      success: flights.length > 0,
      flights,
      totalResults: flights.length,
      source: 'fliggy',
      latency_ms: run.latencyMs,
      ...(flights.length ? {} : { error: '飞猪机票无结果' }),
    };
  }

  /** 泛搜（酒店/门票/机票/租车/美食等），适合自然语言 */
  async keywordSearch(query: string, limit = 8): Promise<{
    success: boolean;
    hotels: FliggyHotelCard[];
    activities: FliggyActivityCard[];
    flights: FliggyFlightCard[];
    carRentals: FliggyCommerceCard[];
    restaurants: FliggyCommerceCard[];
    source: 'fliggy';
    error?: string;
    latency_ms?: number;
    raw?: unknown;
  }> {
    if (!this.isServiceAvailable()) {
      return {
        success: false,
        hotels: [],
        activities: [],
        flights: [],
        carRentals: [],
        restaurants: [],
        source: 'fliggy',
        error: 'Fliggy FlyAI CLI 不可用',
      };
    }
    const q = String(query ?? '').trim();
    if (!q) {
      return {
        success: false,
        hotels: [],
        activities: [],
        flights: [],
        carRentals: [],
        restaurants: [],
        source: 'fliggy',
        error: 'query 必填',
      };
    }
    const args = buildFliggyCliArgs('keyword-search', { '--query': q });
    const run = await runFliggyCli(args, { apiKey: this.apiKey });
    if (!run.ok) {
      return {
        success: false,
        hotels: [],
        activities: [],
        flights: [],
        carRentals: [],
        restaurants: [],
        source: 'fliggy',
        error: run.error,
        latency_ms: run.latencyMs,
      };
    }
    const hotelsAll = mapFliggyHotelRows(run.data, { limit });
    const activities = mapFliggyActivityRows(run.data, { limit });
    // keyword-search 门票 SKU 也长得像 hotel 行：按标题剔除，避免木格措门票误进酒店卡
    const hotels = hotelsAll.filter(
      (h) => !/(门票|观光车|入场券|成人票|风景区-)/i.test(String(h.name ?? '')),
    );
    const flights = mapFliggyFlightRows(run.data, { limit });
    const carRentals = mapFliggyCommerceRows(run.data, {
      limit,
      category: 'car_rental',
    });
    const restaurants = mapFliggyCommerceRows(run.data, {
      limit,
      category: 'restaurant',
    });
    return {
      success:
        hotels.length +
          activities.length +
          flights.length +
          carRentals.length +
          restaurants.length >
        0,
      hotels,
      activities,
      flights,
      carRentals,
      restaurants,
      source: 'fliggy',
      latency_ms: run.latencyMs,
      raw: run.data,
    };
  }

  /** 国内租车：keyword-search「{城} 租车」 */
  async searchCarRentals(params: {
    query: string;
    cityHint?: string | null;
    limit?: number;
  }): Promise<{
    success: boolean;
    carRentals: FliggyCommerceCard[];
    source: 'fliggy';
    error?: string;
    latency_ms?: number;
  }> {
    const city = String(params.cityHint ?? '').trim();
    const q0 = stripClientContextAppendix(String(params.query ?? ''));
    // 有城市锚点时用短查询，避免客户端 [日程] 附录把结果带偏成酒店/民宿
    const q = city
      ? `${city} 租车`
      : /租车/.test(q0)
        ? q0
        : q0
          ? `${q0} 租车`
          : '租车';
    const r = await this.keywordSearch(q, params.limit ?? 6);
    return {
      success: r.carRentals.length > 0,
      carRentals: r.carRentals,
      source: 'fliggy',
      latency_ms: r.latency_ms,
      ...(r.carRentals.length ? {} : { error: r.error || '飞猪租车无结果' }),
    };
  }

  /** 国内餐厅：keyword-search「{城} 美食/餐厅」 */
  async searchRestaurants(params: {
    query: string;
    cityHint?: string | null;
    limit?: number;
  }): Promise<{
    success: boolean;
    restaurants: FliggyCommerceCard[];
    source: 'fliggy';
    error?: string;
    latency_ms?: number;
  }> {
    const city = String(params.cityHint ?? '').trim();
    const q0 = String(params.query ?? '').trim();
    const q = /餐|美食|饭店|吃/.test(q0)
      ? q0
      : city
        ? `${city} 美食餐厅`
        : q0
          ? `${q0} 美食`
          : '美食餐厅';
    const r = await this.keywordSearch(q, params.limit ?? 6);
    return {
      success: r.restaurants.length > 0,
      restaurants: r.restaurants,
      source: 'fliggy',
      latency_ms: r.latency_ms,
      ...(r.restaurants.length ? {} : { error: r.error || '飞猪餐厅无结果' }),
    };
  }
}
