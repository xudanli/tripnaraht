/**
 * Transitous Direct Service
 *
 * 使用 Transitous MOTIS 2 API，覆盖 55+ 国 GTFS 数据
 * 作为 RailDirectService 的欧洲 fallback（当 DB API 失败或路线不在德国网络时）
 * 无需 API Key，需设置 User-Agent（含联系方式）
 *
 * @see https://transitous.org/api/
 * @see https://api.transitous.org/api/
 */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

const BASE_URL = 'https://api.transitous.org/api';

export interface TransitousMatch {
  type?: string;
  name?: string;
  id?: string;
  lat?: number;
  lon?: number;
  modes?: string[];
}

export interface TransitousItinerary {
  duration?: number;
  startTime?: string;
  endTime?: string;
  transfers?: number;
  legs?: Array<{
    from?: { name?: string; lat?: number; lon?: number };
    to?: { name?: string; lat?: number; lon?: number };
    departure?: string;
    arrival?: string;
    line?: { name?: string; mode?: string };
    duration?: number;
  }>;
}

export interface TransitousPlanResponse {
  from?: { name?: string };
  to?: { name?: string };
  direct?: TransitousItinerary[];
  itineraries?: TransitousItinerary[];
}

@Injectable()
export class TransitousDirectService {
  private readonly logger = new Logger(TransitousDirectService.name);
  private readonly http: AxiosInstance;
  readonly isAvailable = true;

  constructor() {
    this.http = axios.create({
      baseURL: BASE_URL,
      timeout: 20000,
      headers: {
        Accept: 'application/json',
        'User-Agent':
          process.env.TRANSITOUS_USER_AGENT ||
          'TripNARA/1.0 (https://tripnara.com; rail-fallback)',
      },
    });
  }

  /** 城市中英文映射 */
  private static readonly CITY_MAP: Record<string, string> = {
    巴黎: 'Paris',
    伦敦: 'London',
    柏林: 'Berlin',
    慕尼黑: 'Munich',
    汉堡: 'Hamburg',
    法兰克福: 'Frankfurt',
    阿姆斯特丹: 'Amsterdam',
    布鲁塞尔: 'Brussels',
    维也纳: 'Vienna',
    苏黎世: 'Zurich',
    米兰: 'Milan',
    罗马: 'Rome',
    马德里: 'Madrid',
    巴塞罗那: 'Barcelona',
    里昂: 'Lyon',
    马赛: 'Marseille',
    都灵: 'Turin',
    那不勒斯: 'Naples',
    里斯本: 'Lisbon',
    奥斯陆: 'Oslo',
    斯德哥尔摩: 'Stockholm',
    哥本哈根: 'Copenhagen',
    华沙: 'Warsaw',
    布拉格: 'Prague',
    布达佩斯: 'Budapest',
  };

  /** 主站查询词（Transitous 对主站名匹配更准） */
  private static readonly STATION_QUERY_MAP: Record<string, string> = {
    Berlin: 'Berlin Hauptbahnhof',
    Munich: 'München Hauptbahnhof',
    München: 'München Hauptbahnhof',
    Frankfurt: 'Frankfurt (Main) Hbf',
    Hamburg: 'Hamburg Hbf',
    Vienna: 'Wien Hbf',
    Wien: 'Wien Hbf',
    Zurich: 'Zürich HB',
    Amsterdam: 'Amsterdam Centraal',
    Brussels: 'Bruxelles Midi',
    Paris: 'Paris Gare du Nord',
    London: 'London St Pancras',
    Milan: 'Milano Centrale',
    Rome: 'Roma Termini',
    Madrid: 'Madrid Atocha',
    Barcelona: 'Barcelona Sants',
  };

  /**
   * 解析地点到 Transitous 可用的 fromPlace/toPlace 格式
   * 优先使用 stop id，否则使用 lat,lon
   */
  private async resolvePlace(query: string): Promise<string | null> {
    const trimmed = (TransitousDirectService.CITY_MAP[query.trim()] || query).trim();
    const searchQuery = TransitousDirectService.STATION_QUERY_MAP[trimmed] || trimmed;
    if (!searchQuery) return null;

    try {
      const { data } = await this.http.get<TransitousMatch[]>('/v1/geocode', {
        params: {
          text: searchQuery,
          type: 'STOP', // 优先车站，便于铁路查询
        },
      });

      const matches = Array.isArray(data) ? data : [];
      // 优先使用 stop id（MOTIS plan 支持）
      const stop = matches.find((m) => m.id && (m.type === 'STOP' || (m as any).modes?.length));
      if (stop?.id) return stop.id;

      // 无 stop 时使用坐标
      const withCoords = matches.find((m) => m.lat != null && m.lon != null);
      if (withCoords) return `${withCoords.lat},${withCoords.lon}`;

      // 若 type=STOP 无结果，放宽为全部类型
      if (matches.length === 0) {
        const { data: fallback } = await this.http.get<TransitousMatch[]>('/v1/geocode', {
          params: { text: searchQuery },
        });
        const fallbackMatches = Array.isArray(fallback) ? fallback : [];
        const fb = fallbackMatches.find((m) => m.id || (m.lat != null && m.lon != null));
        if (fb?.id) return fb.id;
        if (fb?.lat != null && fb?.lon != null) return `${fb.lat},${fb.lon}`;
      }
      return null;
    } catch (err: any) {
      this.logger.warn(`Transitous 解析地点失败: ${searchQuery} - ${err.message}`);
      return null;
    }
  }

  /**
   * 搜索铁路/公交路线（与 RailDirectService 兼容的返回格式）
   */
  async searchRoutes(params: {
    origin: string;
    destination: string;
    date?: string;
    language?: string;
  }): Promise<{ routes?: any[]; journeys?: any[] }> {
    const { origin, destination, date } = params;

    const fromPlace = await this.resolvePlace(origin);
    const toPlace = await this.resolvePlace(destination);

    if (!fromPlace || !toPlace) {
      throw new Error(
        `无法解析车站：${!fromPlace ? `出发地「${origin}」` : ''}${!fromPlace && !toPlace ? '、' : ''}${!toPlace ? `目的地「${destination}」` : ''}。请使用更具体的车站或城市名称。`
      );
    }

    const timeParam = date
      ? date.match(/^\d{4}-\d{2}-\d{2}$/)
        ? `${date}T12:00:00`
        : date
      : undefined;

    try {
      const { data } = await this.http.get<TransitousPlanResponse>('/v5/plan', {
        params: {
          fromPlace,
          toPlace,
          ...(timeParam && { time: timeParam }),
          maxTransfers: 3,
        },
      });

      const itineraries = data?.itineraries || [];
      const routes = itineraries.slice(0, 10).map((it: TransitousItinerary) => {
        const firstLeg = it.legs?.[0];
        const lastLeg = it.legs?.[it.legs?.length - 1];
        const fromName = firstLeg?.from?.name || origin;
        const toName = lastLeg?.to?.name || destination;
        const dep = firstLeg?.departure;
        return {
          origin: fromName,
          destination: toName,
          legs: it.legs,
          departure: dep,
          arrival: lastLeg?.arrival,
          duration: it.duration,
          price: undefined,
          bookingUrl: this.buildBookingUrl(fromName, toName, dep),
        };
      });

      return {
        routes,
        journeys: itineraries,
      };
    } catch (err: any) {
      this.logger.error(`Transitous 铁路查询失败: ${err.message}`);
      throw err;
    }
  }

  private buildBookingUrl(fromStation: string, toStation: string, departureIso?: string): string {
    const from = fromStation.trim().toLowerCase();
    const to = toStation.trim().toLowerCase();
    const isParisLondon =
      (from.includes('paris') && to.includes('london')) ||
      (from.includes('london') && to.includes('paris'));
    if (isParisLondon) return 'https://www.eurostar.com/';

    const base = 'https://www.bahn.de/buchung/fahrplan/suche';
    const params = new URLSearchParams();
    params.set('S', fromStation);
    params.set('Z', toStation);
    if (departureIso) {
      try {
        const d = new Date(departureIso);
        if (!isNaN(d.getTime())) {
          params.set('date', d.toISOString().slice(0, 10));
          params.set('time', `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
      } catch {
        // ignore
      }
    }
    return `${base}?${params.toString()}`;
  }

  isServiceAvailable(): boolean {
    return this.isAvailable;
  }
}
