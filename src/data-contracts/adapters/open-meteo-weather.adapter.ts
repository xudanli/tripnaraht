// src/data-contracts/adapters/open-meteo-weather.adapter.ts

import { Injectable } from '@nestjs/common';
import { WeatherAdapter } from './weather.adapter.interface';
import {
  WeatherData,
  WeatherQuery,
  WeatherAlert,
  WeatherForecastQuery,
  WeatherDailyForecast,
} from '../interfaces/weather.interface';
import { BaseAdapter } from './base.adapter';

@Injectable()
export class OpenMeteoWeatherAdapter extends BaseAdapter implements WeatherAdapter {
  constructor() {
    super(OpenMeteoWeatherAdapter.name, {
      baseURL: 'https://api.open-meteo.com/v1',
      timeout: 12000,
      headers: {
        'User-Agent': 'TripNARA/1.0 (+https://tripnara.com)',
      },
    });

    this.httpClient.defaults.proxy = false;
    if (this.httpClient.defaults.httpAgent) {
      delete this.httpClient.defaults.httpAgent;
    }
    if (this.httpClient.defaults.httpsAgent) {
      delete this.httpClient.defaults.httpsAgent;
    }
  }

  async getDailyForecast(query: WeatherForecastQuery): Promise<WeatherDailyForecast[]> {
    try {
      const response = await this.httpClient.get('/forecast', {
        params: {
          latitude: query.lat,
          longitude: query.lng,
          daily: [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'precipitation_sum',
            'wind_speed_10m_max',
            'wind_gusts_10m_max',
          ].join(','),
          wind_speed_unit: 'ms',
          precipitation_unit: 'mm',
          timezone: query.timezone || 'auto',
          start_date: query.startDate,
          end_date: query.endDate,
        },
      });

      const daily = response.data?.daily;
      if (!daily?.time?.length) {
        return [];
      }

      return daily.time.map((date: string, index: number) => {
        const windSpeedMax = this.toNumber(daily.wind_speed_10m_max?.[index]);
        const windGustMax = this.toNumber(daily.wind_gusts_10m_max?.[index]);
        const precipitationSum = this.toNumber(daily.precipitation_sum?.[index]);
        const weatherCode = this.toNumber(daily.weather_code?.[index]);

        return {
          date,
          temperatureMin: this.toNumber(daily.temperature_2m_min?.[index]),
          temperatureMax: this.toNumber(daily.temperature_2m_max?.[index]),
          windSpeedMax,
          windGustMax,
          precipitationSum,
          weatherCode,
          condition: this.mapWeatherCode(weatherCode),
          alerts: this.extractDailyAlerts(windSpeedMax, windGustMax, precipitationSum, date),
          source: 'open-meteo',
        };
      });
    } catch (error: any) {
      this.logger.error(`获取 Open-Meteo 逐日预报失败: ${error.message}`);
      throw error;
    }
  }

  async getWeather(query: WeatherQuery): Promise<WeatherData> {
    try {
      const response = await this.httpClient.get('/forecast', {
        params: {
          latitude: query.lat,
          longitude: query.lng,
          current: [
            'temperature_2m',
            'relative_humidity_2m',
            'apparent_temperature',
            'precipitation',
            'weather_code',
            'cloud_cover',
            'wind_speed_10m',
            'wind_direction_10m',
          ].join(','),
          wind_speed_unit: 'ms',
          precipitation_unit: 'mm',
          timezone: query.timezone || 'auto',
        },
      });

      const current = response.data?.current;
      if (!current) {
        throw new Error('Open-Meteo 未返回 current 天气数据');
      }

      const windSpeed = this.toNumber(current.wind_speed_10m);
      const precipitation = this.toNumber(current.precipitation);
      const weatherData: WeatherData = {
        temperature: this.toNumber(current.temperature_2m) ?? 0,
        feelsLikeTemperature: this.toNumber(current.apparent_temperature),
        condition: this.mapWeatherCode(this.toNumber(current.weather_code)),
        windSpeed,
        windDirection: this.toNumber(current.wind_direction_10m),
        humidity: this.toNumber(current.relative_humidity_2m),
        alerts: this.extractAlerts(windSpeed, precipitation, current.time),
        lastUpdated: current.time ? new Date(current.time) : new Date(),
        source: 'open-meteo',
        metadata: {
          sourceAuthority: 'open-data',
          providerName: 'Open-Meteo',
          endpoint: 'https://api.open-meteo.com/v1/forecast',
          precipitation,
          cloudCover: this.toNumber(current.cloud_cover),
          timezone: response.data?.timezone,
          rawData: response.data,
          query,
        },
      };

      return weatherData;
    } catch (error: any) {
      this.logger.error(`获取 Open-Meteo 天气数据失败: ${error.message}`);
      throw error;
    }
  }

  getSupportedCountries(): string[] {
    return ['*'];
  }

  getPriority(): number {
    return 80;
  }

  getName(): string {
    return 'Open-Meteo';
  }

  private toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private mapWeatherCode(code: number | undefined): string {
    if (code === undefined) {
      return 'unknown';
    }
    if ([0, 1].includes(code)) {
      return 'sunny';
    }
    if ([2, 3].includes(code)) {
      return 'cloudy';
    }
    if ([45, 48].includes(code)) {
      return 'foggy';
    }
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      return 'rainy';
    }
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
      return 'snowy';
    }
    if (code >= 95 && code <= 99) {
      return 'stormy';
    }
    return 'unknown';
  }

  private extractDailyAlerts(
    windSpeedMax: number | undefined,
    windGustMax: number | undefined,
    precipitationSum: number | undefined,
    date: string,
  ): WeatherAlert[] {
    const effectiveTime = new Date(`${date}T12:00:00`);
    const peakWind = Math.max(windSpeedMax ?? 0, windGustMax ?? 0);
    const alerts: WeatherAlert[] = [];

    if (peakWind > 18) {
      alerts.push({
        type: 'wind',
        severity: peakWind > 25 ? 'critical' : 'warning',
        title: peakWind > 25 ? '极端强风' : '强风',
        description: `最大风速 ${windSpeedMax ?? '?'} m/s，阵风 ${windGustMax ?? '?'} m/s`,
        effectiveTime,
      });
    }

    if (precipitationSum !== undefined && precipitationSum > 5) {
      alerts.push({
        type: 'precipitation',
        severity: precipitationSum > 15 ? 'critical' : 'warning',
        title: precipitationSum > 15 ? '强降水' : '降水',
        description: `日降水 ${precipitationSum} mm`,
        effectiveTime,
      });
    }

    return alerts;
  }

  private extractAlerts(
    windSpeed: number | undefined,
    precipitation: number | undefined,
    time: string | undefined,
  ): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];
    const effectiveTime = time ? new Date(time) : new Date();

    if (windSpeed !== undefined && windSpeed > 18) {
      alerts.push({
        type: 'wind',
        severity: windSpeed > 25 ? 'critical' : 'warning',
        title: windSpeed > 25 ? '极端强风警告' : '强风警告',
        description: `风速 ${windSpeed} m/s，请注意户外和行车安全`,
        effectiveTime,
      });
    }

    if (precipitation !== undefined && precipitation > 5) {
      alerts.push({
        type: 'precipitation',
        severity: precipitation > 15 ? 'critical' : 'warning',
        title: precipitation > 15 ? '强降水警告' : '降水提醒',
        description: `当前降水 ${precipitation} mm，请关注道路湿滑和能见度变化`,
        effectiveTime,
      });
    }

    return alerts;
  }
}
