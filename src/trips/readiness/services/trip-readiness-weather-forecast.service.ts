import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { DataSourceRouterService } from '../../../data-contracts/services/data-source-router.service';
import type { WeatherDailyForecast } from '../../../data-contracts/interfaces/weather.interface';
import type { SupportedLanguage } from '../types/readiness-pack.types';

export interface TripWeatherForecastSummary {
  available: boolean;
  reason?: 'beyond_horizon' | 'no_coordinates' | 'api_error' | 'empty';
  horizonDays: number;
  coveredDays: string[];
  source: string;
  lat?: number;
  lng?: number;
  /** 超出强判断时效的预报天数 */
  staleDayCount?: number;
}

export interface TripWeatherForecastDay {
  date: string;
  dayIndex?: number;
  condition: string;
  temperatureMin?: number;
  temperatureMax?: number;
  windSpeedMax?: number;
  windGustMax?: number;
  precipitationSum?: number;
  severity: 'high' | 'medium' | 'low';
  alerts: string[];
}

export interface TripWeatherForecastRisk {
  id: string;
  type: 'weather_extreme';
  sourceType: 'weather_forecast';
  severity: 'high' | 'medium' | 'low';
  summary: string;
  message: string;
  mitigations: string[];
  forecastDays: TripWeatherForecastDay[];
  sources: Array<{ authority: string; canonicalUrl: string; sourceId?: string }>;
}

const FORECAST_HORIZON_DAYS = 16;

@Injectable()
export class TripReadinessWeatherForecastService {
  private readonly logger = new Logger(TripReadinessWeatherForecastService.name);

  constructor(private readonly dataSourceRouter: DataSourceRouterService) {}

  async buildForecastRisksForTrip(
    trip: {
      startDate: Date;
      endDate: Date;
      TripDay?: Array<{
        date?: Date;
        ItineraryItem?: Array<{ Place?: { metadata?: unknown } | null }>;
      }>;
    },
    lang: SupportedLanguage,
  ): Promise<{ risks: TripWeatherForecastRisk[]; summary: TripWeatherForecastSummary }> {
    const emptySummary = (
      reason: TripWeatherForecastSummary['reason'],
      extra?: Partial<TripWeatherForecastSummary>,
    ): TripWeatherForecastSummary => ({
      available: false,
      reason,
      horizonDays: FORECAST_HORIZON_DAYS,
      coveredDays: [],
      source: 'open-meteo',
      ...extra,
    });

    const coords = this.extractTripCoordinates(trip);
    if (coords.length === 0) {
      return { risks: [], summary: emptySummary('no_coordinates') };
    }

    const center = this.averageCoordinates(coords);
    const tripStart = DateTime.fromJSDate(trip.startDate).startOf('day');
    const tripEnd = DateTime.fromJSDate(trip.endDate).startOf('day');
    const today = DateTime.now().startOf('day');
    const forecastEnd = today.plus({ days: FORECAST_HORIZON_DAYS - 1 });

    if (tripStart > forecastEnd) {
      return {
        risks: [],
        summary: emptySummary('beyond_horizon', { lat: center.lat, lng: center.lng }),
      };
    }

    const fetchStart = DateTime.max(today, tripStart);
    const fetchEnd = DateTime.min(tripEnd, forecastEnd);
    const startDate = fetchStart.toISODate();
    const endDate = fetchEnd.toISODate();
    if (!startDate || !endDate) {
      return { risks: [], summary: emptySummary('empty') };
    }

    try {
      const envelopes = await this.dataSourceRouter.getDailyWeatherForecastEvidence({
        lat: center.lat,
        lng: center.lng,
        startDate,
        endDate,
        timezone: 'auto',
      });
      const daily = envelopes.map((e) => e.value);

      if (!daily.length) {
        return {
          risks: [],
          summary: emptySummary('empty', { lat: center.lat, lng: center.lng }),
        };
      }

      const risk = this.buildConsolidatedForecastRisk(daily, trip, lang);
      const staleDayCount = envelopes.filter((e) => !e.freshness.strongJudgmentAllowed).length;
      return {
        risks: [risk],
        summary: {
          available: true,
          horizonDays: FORECAST_HORIZON_DAYS,
          coveredDays: daily.map((d) => d.date),
          source: 'open-meteo',
          lat: center.lat,
          lng: center.lng,
          staleDayCount: staleDayCount > 0 ? staleDayCount : undefined,
        },
      };
    } catch (error) {
      this.logger.warn(
        `Trip weather forecast failed: ${(error as Error).message}`,
      );
      return {
        risks: [],
        summary: emptySummary('api_error', { lat: center.lat, lng: center.lng }),
      };
    }
  }

  mergeForecastIntoRisks<T extends { type?: string; category?: string; isGenericTemplate?: boolean }>(
    existingRisks: T[],
    forecastRisks: T[],
  ): T[] {
    if (!forecastRisks.length) {
      return existingRisks;
    }

    const weatherTypes = new Set(['weather_extreme', 'WEATHER', 'weather']);
    const filtered = existingRisks.filter((risk) => {
      const isWeather =
        risk.category === 'weather' ||
        (risk.type && weatherTypes.has(risk.type));
      if (!isWeather) {
        return true;
      }
      return !risk.isGenericTemplate;
    });

    return [...forecastRisks, ...filtered];
  }

  private buildConsolidatedForecastRisk(
    daily: WeatherDailyForecast[],
    trip: {
      startDate: Date;
      TripDay?: Array<{ date?: Date }>;
    },
    lang: SupportedLanguage,
  ): TripWeatherForecastRisk {
    const dayIndexByDate = this.buildDayIndexMap(trip);
    const forecastDays: TripWeatherForecastDay[] = daily.map((day) => {
      const severity = this.assessDaySeverity(day);
      return {
        date: day.date,
        dayIndex: dayIndexByDate.get(day.date),
        condition: day.condition,
        temperatureMin: day.temperatureMin,
        temperatureMax: day.temperatureMax,
        windSpeedMax: day.windSpeedMax,
        windGustMax: day.windGustMax,
        precipitationSum: day.precipitationSum,
        severity,
        alerts: (day.alerts || []).map((a) => a.description),
      };
    });

    const maxSeverity = this.maxSeverity(forecastDays.map((d) => d.severity));
    const tripStartLabel = DateTime.fromJSDate(trip.startDate).toFormat('M/d');
    const tripEndLabel = DateTime.fromJSDate(new Date(daily[daily.length - 1].date)).toFormat('M/d');

    const summary =
      lang === 'zh'
        ? `行程天气预报（${tripStartLabel}–${tripEndLabel}，Open-Meteo）`
        : `Trip weather forecast (${tripStartLabel}–${tripEndLabel}, Open-Meteo)`;

    const message = forecastDays.map((d) => this.formatDayLine(d, lang)).join('\n');
    const mitigations = this.buildMitigations(forecastDays, lang);

    return {
      id: 'trip-weather-forecast',
      type: 'weather_extreme',
      sourceType: 'weather_forecast',
      severity: maxSeverity,
      summary,
      message,
      mitigations,
      forecastDays,
      sources: [
        {
          authority: 'Open-Meteo',
          canonicalUrl: 'https://open-meteo.com/',
          sourceId: 'open-meteo-forecast',
        },
      ],
    };
  }

  private formatDayLine(day: TripWeatherForecastDay, lang: SupportedLanguage): string {
    const dateLabel = DateTime.fromISO(day.date).toFormat('M/d');
    const dayPrefix =
      day.dayIndex !== undefined
        ? lang === 'zh'
          ? `D${day.dayIndex} ${dateLabel}`
          : `Day ${day.dayIndex} ${dateLabel}`
        : dateLabel;

    const conditionLabel = this.conditionLabel(day.condition, lang);
    const temp =
      day.temperatureMin !== undefined && day.temperatureMax !== undefined
        ? `${Math.round(day.temperatureMin)}–${Math.round(day.temperatureMax)}°C`
        : '';

    const wind =
      day.windSpeedMax !== undefined
        ? lang === 'zh'
          ? `风速 ${day.windSpeedMax.toFixed(0)} m/s`
          : `wind ${day.windSpeedMax.toFixed(0)} m/s`
        : '';

    const precip =
      day.precipitationSum !== undefined && day.precipitationSum > 0
        ? lang === 'zh'
          ? `降水 ${day.precipitationSum.toFixed(0)} mm`
          : `${day.precipitationSum.toFixed(0)} mm rain`
        : '';

    const severityLabel =
      lang === 'zh'
        ? { high: '高风险', medium: '中风险', low: '低风险' }[day.severity]
        : { high: 'high', medium: 'medium', low: 'low' }[day.severity];

    const parts = [conditionLabel, temp, wind, precip, severityLabel].filter(Boolean);
    return `• ${dayPrefix}：${parts.join('，')}`;
  }

  private buildMitigations(
    days: TripWeatherForecastDay[],
    lang: SupportedLanguage,
  ): string[] {
    const hasHighWind = days.some(
      (d) => (d.windSpeedMax ?? 0) > 18 || (d.windGustMax ?? 0) > 22,
    );
    const hasHeavyRain = days.some((d) => (d.precipitationSum ?? 0) > 8);
    const hasStorm = days.some((d) => d.condition === 'stormy');

    const tips: string[] = [];
    if (lang === 'zh') {
      tips.push('出发前查看 vedur.is / Open-Meteo 最新预报，强风或降水日优先调整户外与 F 路行程');
      if (hasHighWind) {
        tips.push('强风日避免冰川、黑沙滩等开阔区域，驾车注意横风');
      }
      if (hasHeavyRain || hasStorm) {
        tips.push('降水或雷暴日预留缓冲，关注道路湿滑与能见度');
      }
    } else {
      tips.push('Recheck vedur.is / Open-Meteo before departure; reschedule exposed activities on windy or wet days');
      if (hasHighWind) {
        tips.push('Avoid open areas (glaciers, black sand beaches) on high-wind days; watch for crosswinds while driving');
      }
      if (hasHeavyRain || hasStorm) {
        tips.push('Allow slack on rainy or stormy days; expect slippery roads and reduced visibility');
      }
    }
    return tips;
  }

  private conditionLabel(condition: string, lang: SupportedLanguage): string {
    const zh: Record<string, string> = {
      sunny: '晴',
      cloudy: '多云',
      rainy: '雨',
      snowy: '雪',
      stormy: '雷暴',
      foggy: '雾',
      unknown: '未知',
    };
    const en: Record<string, string> = {
      sunny: 'Clear',
      cloudy: 'Cloudy',
      rainy: 'Rain',
      snowy: 'Snow',
      stormy: 'Storm',
      foggy: 'Fog',
      unknown: 'Unknown',
    };
    return (lang === 'zh' ? zh : en)[condition] || condition;
  }

  private assessDaySeverity(day: WeatherDailyForecast): 'high' | 'medium' | 'low' {
    const wind = Math.max(day.windSpeedMax ?? 0, day.windGustMax ?? 0);
    const precip = day.precipitationSum ?? 0;

    if (wind > 25 || precip > 20 || day.condition === 'stormy') {
      return 'high';
    }
    if (wind > 18 || precip > 8 || day.condition === 'snowy') {
      return 'medium';
    }
    return 'low';
  }

  private maxSeverity(severities: Array<'high' | 'medium' | 'low'>): 'high' | 'medium' | 'low' {
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }

  private buildDayIndexMap(trip: {
    startDate: Date;
    TripDay?: Array<{ date?: Date }>;
  }): Map<string, number> {
    const map = new Map<string, number>();
    const tripStart = DateTime.fromJSDate(trip.startDate).startOf('day');

    trip.TripDay?.forEach((day, index) => {
      const dateKey = day.date
        ? DateTime.fromJSDate(day.date).toISODate()
        : tripStart.plus({ days: index }).toISODate();
      if (dateKey) {
        map.set(dateKey, index + 1);
      }
    });

    return map;
  }

  private extractTripCoordinates(trip: {
    TripDay?: Array<{
      ItineraryItem?: Array<{ Place?: { metadata?: unknown } | null }>;
    }>;
  }): Array<{ lat: number; lng: number }> {
    const coords: Array<{ lat: number; lng: number }> = [];

    trip.TripDay?.forEach((day) => {
      day.ItineraryItem?.forEach((item) => {
        const place = item.Place;
        if (!place) return;
        const parsed = this.extractPlaceCoordinates(place);
        if (parsed) {
          coords.push(parsed);
        }
      });
    });

    return coords;
  }

  private extractPlaceCoordinates(place: {
    metadata?: unknown;
  }): { lat: number; lng: number } | null {
    const metadata = (place.metadata as Record<string, unknown>) || {};
    if (typeof metadata.lat === 'number' && typeof metadata.lng === 'number') {
      return { lat: metadata.lat, lng: metadata.lng };
    }
    if (Array.isArray(metadata.coordinates) && metadata.coordinates.length >= 2) {
      const [lng, lat] = metadata.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number') {
        return { lat, lng };
      }
    }
    return null;
  }

  private averageCoordinates(
    coords: Array<{ lat: number; lng: number }>,
  ): { lat: number; lng: number } {
    const sum = coords.reduce(
      (acc, c) => ({ lat: acc.lat + c.lat, lng: acc.lng + c.lng }),
      { lat: 0, lng: 0 },
    );
    return {
      lat: sum.lat / coords.length,
      lng: sum.lng / coords.length,
    };
  }
}
