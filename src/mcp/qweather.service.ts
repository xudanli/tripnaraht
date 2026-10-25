/**
 * 和风天气（QWeather）最小客户端。
 * 文档: https://dev.qweather.com/docs/configuration/api-config/
 *
 * 能力：城市查询、实时天气、7 日预报、天气预警。
 *
 * 环境变量：
 * - QWEATHER_API_KEY（必填才可用）
 * - QWEATHER_API_HOST（控制台 → 设置中的 API Host，勿带协议）
 * - QWEATHER_ENABLED=false 可强制关闭
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export type QWeatherLocation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  adm1?: string;
  adm2?: string;
  country?: string;
  tz?: string;
  type?: string;
};

export type QWeatherNow = {
  obsTime?: string;
  temp?: number;
  feelsLike?: number;
  text?: string;
  icon?: string;
  wind360?: number;
  windDir?: string;
  windScale?: string;
  windSpeed?: number; // km/h（和风默认）
  humidity?: number;
  precip?: number;
  pressure?: number;
  vis?: number; // km
  cloud?: number;
  dew?: number;
  updateTime?: string;
  fxLink?: string;
  location: string;
};

export type QWeatherDaily = {
  fxDate: string;
  sunrise?: string;
  sunset?: string;
  tempMax?: number;
  tempMin?: number;
  textDay?: string;
  textNight?: string;
  iconDay?: string;
  iconNight?: string;
  windDirDay?: string;
  windScaleDay?: string;
  windSpeedDay?: number;
  precip?: number;
  humidity?: number;
  uvIndex?: number;
  vis?: number;
};

export type QWeatherWarning = {
  id: string;
  sender?: string;
  pubTime?: string;
  title: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  level?: string;
  severity?: string;
  type?: string;
  typeName?: string;
  text?: string;
};

export type QWeatherSnapshot = {
  source: 'qweather';
  location: QWeatherLocation;
  now: QWeatherNow | null;
  daily7d: QWeatherDaily[];
  warnings: QWeatherWarning[];
  fetchedAt: string;
};

type QWeatherCodeResponse = {
  code?: string;
  [key: string]: unknown;
};

@Injectable()
export class QWeatherService {
  private readonly logger = new Logger(QWeatherService.name);
  private readonly apiKey: string | null;
  private readonly apiHost: string | null;
  private readonly forceDisabled: boolean;
  private readonly http: AxiosInstance;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.apiKey = this.readEnv('QWEATHER_API_KEY');
    this.apiHost = this.normalizeHost(this.readEnv('QWEATHER_API_HOST'));
    const enabled =
      this.configService?.get<string>('QWEATHER_ENABLED') ??
      process.env.QWEATHER_ENABLED;
    this.forceDisabled = String(enabled ?? 'true').toLowerCase() === 'false';

    this.http = axios.create({
      timeout: 15_000,
      proxy: false,
      headers: {
        'User-Agent': 'TripNARA/1.0',
        Accept: 'application/json',
        ...(this.apiKey ? { 'X-QW-Api-Key': this.apiKey } : {}),
      },
      // 和风推荐 gzip；Node axios 会自动解压
      decompress: true,
    });

    if (this.isServiceAvailable()) {
      this.logger.log(`✅ QWeather 可用（host=${this.apiHost}）`);
    } else if (!this.forceDisabled) {
      this.logger.warn(
        '⚠️ QWeather 未就绪：请配置 QWEATHER_API_KEY 与 QWEATHER_API_HOST（https://dev.qweather.com/）',
      );
    }
  }

  isServiceAvailable(): boolean {
    if (this.forceDisabled) return false;
    return Boolean(this.apiKey && this.apiHost);
  }

  /**
   * 城市查询（GeoAPI）。location 可为城市名、LocationID，或「经度,纬度」。
   */
  async lookupCity(
    location: string,
    options?: { range?: string; number?: number; lang?: string; adm?: string },
  ): Promise<QWeatherLocation[]> {
    this.assertAvailable();
    const data = await this.getJson<QWeatherCodeResponse & { location?: any[] }>(
      '/geo/v2/city/lookup',
      {
        location: location.trim(),
        range: options?.range ?? 'cn',
        number: Math.min(Math.max(options?.number ?? 5, 1), 20),
        lang: options?.lang ?? 'zh',
        ...(options?.adm ? { adm: options.adm } : {}),
      },
    );
    return (data.location ?? []).map((row) => this.mapLocation(row));
  }

  /** 实时天气。location = LocationID 或「经度,纬度」。 */
  async getNow(location: string, lang = 'zh'): Promise<QWeatherNow> {
    this.assertAvailable();
    const loc = this.normalizeLocationParam(location);
    const data = await this.getJson<any>('/v7/weather/now', { location: loc, lang });
    const now = data.now ?? {};
    return {
      obsTime: now.obsTime,
      temp: toNum(now.temp),
      feelsLike: toNum(now.feelsLike),
      text: now.text,
      icon: now.icon,
      wind360: toNum(now.wind360),
      windDir: now.windDir,
      windScale: now.windScale,
      windSpeed: toNum(now.windSpeed),
      humidity: toNum(now.humidity),
      precip: toNum(now.precip),
      pressure: toNum(now.pressure),
      vis: toNum(now.vis),
      cloud: toNum(now.cloud),
      dew: toNum(now.dew),
      updateTime: data.updateTime,
      fxLink: data.fxLink,
      location: loc,
    };
  }

  /** 7 日预报。 */
  async getDaily7d(location: string, lang = 'zh'): Promise<QWeatherDaily[]> {
    this.assertAvailable();
    const loc = this.normalizeLocationParam(location);
    const data = await this.getJson<any>('/v7/weather/7d', { location: loc, lang });
    return (data.daily ?? []).map((d: any): QWeatherDaily => ({
      fxDate: d.fxDate,
      sunrise: d.sunrise,
      sunset: d.sunset,
      tempMax: toNum(d.tempMax),
      tempMin: toNum(d.tempMin),
      textDay: d.textDay,
      textNight: d.textNight,
      iconDay: d.iconDay,
      iconNight: d.iconNight,
      windDirDay: d.windDirDay,
      windScaleDay: d.windScaleDay,
      windSpeedDay: toNum(d.windSpeedDay),
      precip: toNum(d.precip),
      humidity: toNum(d.humidity),
      uvIndex: toNum(d.uvIndex),
      vis: toNum(d.vis),
    }));
  }

  /** 当前生效的天气预警。 */
  async getWarningNow(location: string, lang = 'zh'): Promise<QWeatherWarning[]> {
    this.assertAvailable();
    const loc = this.normalizeLocationParam(location);
    const data = await this.getJson<any>('/v7/warning/now', { location: loc, lang });
    return (data.warning ?? []).map((w: any): QWeatherWarning => ({
      id: String(w.id ?? ''),
      sender: w.sender,
      pubTime: w.pubTime,
      title: String(w.title ?? ''),
      startTime: w.startTime,
      endTime: w.endTime,
      status: w.status,
      level: w.level,
      severity: w.severity,
      type: w.type,
      typeName: w.typeName,
      text: w.text,
    }));
  }

  /**
   * 便利方法：城市名 → 首个匹配点 + now + 7d + warning。
   * 也可直接传 LocationID /「经度,纬度」。
   */
  async getSnapshot(
    query: string,
    options?: { range?: string; lang?: string },
  ): Promise<QWeatherSnapshot> {
    this.assertAvailable();
    const lang = options?.lang ?? 'zh';
    const trimmed = query.trim();
    if (!trimmed) {
      throw new Error('query 不能为空');
    }

    let location: QWeatherLocation;
    if (isLocationIdOrCoord(trimmed)) {
      const hits = await this.lookupCity(trimmed, {
        range: options?.range ?? 'cn',
        number: 1,
        lang,
      });
      location =
        hits[0] ??
        ({
          id: trimmed,
          name: trimmed,
          lat: NaN,
          lon: NaN,
        } satisfies QWeatherLocation);
    } else {
      const hits = await this.lookupCity(trimmed, {
        range: options?.range ?? 'cn',
        number: 1,
        lang,
      });
      if (!hits.length) {
        throw new Error(`未找到城市: ${trimmed}`);
      }
      location = hits[0];
    }

    const locKey = location.id || trimmed;
    const [now, daily7d, warnings] = await Promise.all([
      this.getNow(locKey, lang).catch((err) => {
        this.logger.warn(`getNow failed: ${err?.message ?? err}`);
        return null;
      }),
      this.getDaily7d(locKey, lang).catch((err) => {
        this.logger.warn(`getDaily7d failed: ${err?.message ?? err}`);
        return [] as QWeatherDaily[];
      }),
      this.getWarningNow(locKey, lang).catch((err) => {
        this.logger.warn(`getWarningNow failed: ${err?.message ?? err}`);
        return [] as QWeatherWarning[];
      }),
    ]);

    return {
      source: 'qweather',
      location,
      now,
      daily7d,
      warnings,
      fetchedAt: new Date().toISOString(),
    };
  }

  private assertAvailable(): void {
    if (!this.isServiceAvailable()) {
      throw new Error(
        'QWeather 不可用：请配置 QWEATHER_API_KEY、QWEATHER_API_HOST，并确认 QWEATHER_ENABLED 未关闭',
      );
    }
  }

  private async getJson<T extends QWeatherCodeResponse>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const url = `https://${this.apiHost}${path}`;
    const response = await this.http.get<T>(url, { params });
    const data = response.data;
    const code = String(data?.code ?? '');
    if (code && code !== '200') {
      throw new Error(`QWeather API error code=${code} path=${path}`);
    }
    return data;
  }

  private mapLocation(row: any): QWeatherLocation {
    return {
      id: String(row.id ?? ''),
      name: String(row.name ?? ''),
      lat: toNum(row.lat) ?? NaN,
      lon: toNum(row.lon) ?? NaN,
      adm1: row.adm1,
      adm2: row.adm2,
      country: row.country,
      tz: row.tz,
      type: row.type,
    };
  }

  /** 坐标保留最多 2 位小数（和风要求）。 */
  private normalizeLocationParam(location: string): string {
    const raw = location.trim();
    if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(raw)) {
      const [lon, lat] = raw.split(',').map((v) => Number(Number(v).toFixed(2)));
      return `${lon},${lat}`;
    }
    return raw;
  }

  private readEnv(key: string): string | null {
    const raw =
      this.configService?.get<string>(key) || process.env[key] || '';
    return raw.replace(/^["']|["']$/g, '').trim() || null;
  }

  private normalizeHost(host: string | null): string | null {
    if (!host) return null;
    return host
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .trim() || null;
  }
}

function toNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function isLocationIdOrCoord(value: string): boolean {
  if (/^\d{6,}$/.test(value)) return true;
  return /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value);
}
