/**
 * Rail Direct Service
 *
 * 直接使用 v6.db.transport.rest API，无需 OAuth 或 API Key
 * 覆盖德国及部分欧洲铁路（Deutsche Bahn 网络）
 * 限流：100 次/分钟
 *
 * @see https://v6.db.transport.rest/
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://v6.db.transport.rest';

export interface RailJourney {
  type: string;
  legs: Array<{
    origin: { name: string; id?: string };
    destination: { name: string; id?: string };
    departure?: string;
    plannedDeparture?: string;
    arrival?: string;
    plannedArrival?: string;
    line?: { name: string; product?: string };
    duration?: number;
  }>;
  refreshToken?: string;
  price?: { amount: number; currency: string };
}

export interface RailSearchResult {
  journeys?: RailJourney[];
  earlierRef?: string;
  laterRef?: string;
}

@Injectable()
export class RailDirectService {
  private readonly logger = new Logger(RailDirectService.name);
  private readonly http: AxiosInstance;
  readonly isAvailable = true; // 无需配置，总是可用

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      headers: { 'Accept': 'application/json' },
    });
  }

  /** 常见城市中英文映射（API 对英文支持更好） */
  private static readonly CITY_MAP: Record<string, string> = {
    巴黎: 'Paris', 伦敦: 'London', 柏林: 'Berlin', 慕尼黑: 'Munich', 汉堡: 'Hamburg',
    法兰克福: 'Frankfurt', 科隆: 'Cologne', 阿姆斯特丹: 'Amsterdam', 布鲁塞尔: 'Brussels',
    维也纳: 'Vienna', 苏黎世: 'Zurich', 米兰: 'Milan', 罗马: 'Rome', 马德里: 'Madrid',
    巴塞罗那: 'Barcelona', 北京: 'Beijing', 上海: 'Shanghai',
  };

  /** 德国主要车站优先查询词（DB API 对 Hbf 主站匹配更好） */
  private static readonly STATION_QUERY_MAP: Record<string, string> = {
    Berlin: 'Berlin Hbf',
    Munich: 'München Hbf',
    München: 'München Hbf',
    Frankfurt: 'Frankfurt (Main) Hbf',
    Hamburg: 'Hamburg Hbf',
    Cologne: 'Köln Hbf',
    Köln: 'Köln Hbf',
    Vienna: 'Wien Hbf',
    Wien: 'Wien Hbf',
    Zurich: 'Zürich HB',
    Amsterdam: 'Amsterdam Centraal',
    Brussels: 'Bruxelles Midi',
    Paris: 'Paris Gare du Nord',
    London: 'London St Pancras',
  };

  /**
   * 解析地点名称到车站 ID
   */
  private async resolveStationId(query: string, language = 'en'): Promise<string | null> {
    const trimmed = query.trim();
    const normalizedQuery = RailDirectService.CITY_MAP[trimmed] || trimmed;
    const searchQuery = RailDirectService.STATION_QUERY_MAP[normalizedQuery] || normalizedQuery;

    // 调用 API
    try {
      const { data } = await this.http.get('/locations', {
        params: {
          query: searchQuery,
          results: 5,
          stops: true,
          addresses: false,
          poi: false,
          language: language === 'zh' ? 'en' : language,
        },
      });

      const raw = data as any;
      const stops = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.locations)
          ? raw.locations
          : Array.isArray(raw?.stops)
            ? raw.stops
            : [];
      const stop = stops.find((s: any) => s.type === 'stop' && s.id) || stops.find((s: any) => s.id);
      return stop?.id || stops[0]?.id || null;
    } catch (err: any) {
      this.logger.warn(`解析车站失败: ${query} - ${err.message}`);
      return null;
    }
  }

  /** 巴黎↔伦敦（Eurostar）：DB API 不支持，返回引导卡片 */
  private static readonly EUROSTAR_PAIR = new Set(['paris', 'london', '巴黎', '伦敦', 'paris gare du nord', 'london st pancras']);

  /**
   * 搜索铁路路线（无需认证）
   */
  async searchRoutes(params: {
    origin: string;
    destination: string;
    date?: string;
    language?: string;
  }): Promise<RailSearchResult & { routes?: any[] }> {
    const { origin, destination, date, language = 'en' } = params;

    const fromNorm = (RailDirectService.CITY_MAP[origin.trim()] || origin).trim().toLowerCase();
    const toNorm = (RailDirectService.CITY_MAP[destination.trim()] || destination).trim().toLowerCase();
    const isParisLondon =
      RailDirectService.EUROSTAR_PAIR.has(fromNorm) && RailDirectService.EUROSTAR_PAIR.has(toNorm);

    if (isParisLondon) {
      const fromName = fromNorm.includes('paris') || fromNorm.includes('巴黎') ? 'Paris Gare du Nord' : 'London St Pancras';
      const toName = fromName.includes('Paris') ? 'London St Pancras' : 'Paris Gare du Nord';
      return {
        routes: [{
          origin: fromName,
          destination: toName,
          legs: [],
          price: undefined,
          bookingUrl: 'https://www.eurostar.com/',
          note: '巴黎–伦敦 Eurostar 列车。请通过 Eurostar 官网查询实时车次、票价并预订。',
        }],
        journeys: [],
      };
    }

    const fromId = await this.resolveStationId(origin, language);
    const toId = await this.resolveStationId(destination, language);

    if (!fromId || !toId) {
      throw new Error(
        `无法解析车站：${!fromId ? `出发地「${origin}」` : ''}${!fromId && !toId ? '、' : ''}${!toId ? `目的地「${destination}」` : ''}。请使用更具体的车站或城市名称。`
      );
    }

    const departureParam = date
      ? (date.match(/^\d{4}-\d{2}-\d{2}$/) ? `${date}T12:00:00` : date)
      : undefined;

    try {
      const { data } = await this.http.get<RailSearchResult>('/journeys', {
        params: {
          from: fromId,
          to: toId,
          ...(departureParam && { departure: departureParam }),
          results: 10,
          stopovers: false,
          language,
          bus: false, // 仅火车
        },
      });

      // 兼容规划助手期望的 routes 字段
      const journeys = data?.journeys || [];
      const routes = journeys.map((j: RailJourney) => {
        const dep = j.legs?.[0]?.departure || j.legs?.[0]?.plannedDeparture;
        const fromName = j.legs?.[0]?.origin?.name || origin;
        const toName = j.legs?.[j.legs.length - 1]?.destination?.name || destination;
        const bookingUrl = this.buildBookingUrl(fromName, toName, dep);
        return {
          origin: fromName,
          destination: toName,
          legs: j.legs,
          departure: dep,
          arrival: j.legs?.[j.legs.length - 1]?.arrival || j.legs?.[j.legs.length - 1]?.plannedArrival,
          duration: j.legs?.reduce((sum, leg) => sum + (leg.duration || 0), 0),
          price: j.price,
          bookingUrl,
        };
      });

      return {
        ...data,
        routes,
        journeys,
      };
    } catch (err: any) {
      this.logger.error(`铁路查询失败: ${err.message}`);
      throw err;
    }
  }

  /**
   * 构建铁路预订链接
   * - 巴黎↔伦敦（Eurostar）→ eurostar.com
   * - 德国及欧洲其他线路 → bahn.de 搜索页
   */
  private buildBookingUrl(fromStation: string, toStation: string, departureIso?: string): string {
    const from = fromStation.trim().toLowerCase();
    const to = toStation.trim().toLowerCase();
    const isParisLondon = (from.includes('paris') && to.includes('london')) || (from.includes('london') && to.includes('paris'));
    if (isParisLondon) return 'https://www.eurostar.com/';

    // 德国及欧洲：使用 bahn.de 主站搜索页（稳定可用）
    // reiseauskunft.bahn.de 已不稳定（502），改用 www.bahn.de
    const base = 'https://www.bahn.de/buchung/fahrplan/suche';
    const params = new URLSearchParams();
    params.set('S', from);
    params.set('Z', to);
    if (departureIso) {
      try {
        const d = new Date(departureIso);
        if (!isNaN(d.getTime())) {
          params.set('date', d.toISOString().slice(0, 10));
          params.set('time', `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
      } catch {
        // 忽略
      }
    }
    return `${base}?${params.toString()}`;
  }

  /**
   * 检查服务是否可用（用于规划助手）
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }
}
