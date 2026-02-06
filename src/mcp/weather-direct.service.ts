/**
 * Weather Direct Service
 * 
 * 直接使用 Open-Meteo API，不依赖 Python MCP 服务
 * 无需 API Key，免费使用
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
}

interface CurrentWeatherResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  current_units: {
    time: string;
    interval: string;
    temperature_2m: string;
    relative_humidity_2m: string;
    apparent_temperature: string;
    weather_code: string;
    wind_speed_10m: string;
    wind_direction_10m: string;
  };
  current: {
    time: string;
    interval: number;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
}

interface ForecastResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: {
    time: string;
    temperature_2m: string;
    weather_code: string;
    precipitation: string;
    wind_speed_10m: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation: number[];
    wind_speed_10m: number[];
  };
}

@Injectable()
export class WeatherDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeatherDirectService.name);
  private axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://api.open-meteo.com/v1';
  private isAvailable: boolean = true; // Open-Meteo 无需配置，总是可用

  constructor() {
    this.axiosInstance = null as any; // 延迟初始化
  }

  async onModuleInit() {
    // 初始化 HTTP 客户端（支持代理）
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;

    const httpsAgent = proxyUrl
      ? new HttpsProxyAgent<string>(proxyUrl)
      : new https.Agent({
          keepAlive: true,
          family: 4, // 强制 IPv4
          rejectUnauthorized: true,
        });

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      httpsAgent,
      proxy: false,
      headers: {
        'User-Agent': 'TripNARA/1.0',
      },
    });

    this.isAvailable = true;
    this.logger.log('Weather Direct Service initialized (Open-Meteo API)');
  }

  async onModuleDestroy() {
    this.logger.log('Weather Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * 地理编码：根据城市名称获取坐标
   */
  async geocode(city: string): Promise<GeocodingResult> {
    try {
      // Open-Meteo 地理编码 API 端点
      const response = await this.axiosInstance.get('https://geocoding-api.open-meteo.com/v1/search', {
        params: {
          name: city,
          count: 1,
          language: 'en',
          format: 'json',
        },
      });

      const results = response.data.results;
      if (!results || results.length === 0) {
        throw new Error(`City "${city}" not found`);
      }

      return results[0];
    } catch (error: any) {
      this.logger.error(`Geocoding failed for "${city}": ${error.message}`);
      throw new Error(`Failed to geocode city "${city}": ${error.message}`);
    }
  }

  /**
   * 获取当前天气
   */
  async getCurrentWeather(city: string): Promise<any> {
    try {
      // 先获取坐标
      const location = await this.geocode(city);

      // 获取当前天气
      const response = await this.axiosInstance.get('/forecast', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          current: [
            'temperature_2m',
            'relative_humidity_2m',
            'apparent_temperature',
            'weather_code',
            'wind_speed_10m',
            'wind_direction_10m',
          ].join(','),
          timezone: 'auto',
        },
      });

      const data: CurrentWeatherResponse = response.data;
      const weatherCode = this.mapWeatherCode(data.current.weather_code);

      return {
        city: location.name,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: data.timezone,
        current: {
          time: data.current.time,
          temperature: data.current.temperature_2m,
          apparent_temperature: data.current.apparent_temperature,
          humidity: data.current.relative_humidity_2m,
          weather_code: data.current.weather_code,
          weather_description: weatherCode.description,
          wind_speed: data.current.wind_speed_10m,
          wind_direction: data.current.wind_direction_10m,
        },
        units: {
          temperature: data.current_units.temperature_2m,
          wind_speed: data.current_units.wind_speed_10m,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to get current weather for "${city}": ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取日期范围内的天气
   */
  async getWeatherByDatetimeRange(
    city: string,
    startDate: string,
    endDate: string,
  ): Promise<any> {
    try {
      // 先获取坐标
      const location = await this.geocode(city);

      // 获取预报
      const response = await this.axiosInstance.get('/forecast', {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          hourly: [
            'temperature_2m',
            'weather_code',
            'precipitation',
            'wind_speed_10m',
          ].join(','),
          start_date: startDate,
          end_date: endDate,
          timezone: 'auto',
        },
      });

      const data: ForecastResponse = response.data;

      // 处理小时数据
      const hourlyData = data.hourly.time.map((time, index) => ({
        time,
        temperature: data.hourly.temperature_2m[index],
        weather_code: data.hourly.weather_code[index],
        weather_description: this.mapWeatherCode(data.hourly.weather_code[index]).description,
        precipitation: data.hourly.precipitation[index],
        wind_speed: data.hourly.wind_speed_10m[index],
      }));

      return {
        city: location.name,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: data.timezone,
        start_date: startDate,
        end_date: endDate,
        hourly: hourlyData,
        summary: {
          min_temperature: Math.min(...data.hourly.temperature_2m),
          max_temperature: Math.max(...data.hourly.temperature_2m),
          avg_temperature:
            data.hourly.temperature_2m.reduce((a, b) => a + b, 0) /
            data.hourly.temperature_2m.length,
          total_precipitation: data.hourly.precipitation.reduce((a, b) => a + b, 0),
        },
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to get weather forecast for "${city}" (${startDate} to ${endDate}): ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * 获取当前日期时间（指定时区）
   */
  async getCurrentDateTime(timezone?: string): Promise<any> {
    try {
      // 如果没有指定时区，使用 UTC
      const tz = timezone || 'UTC';

      // 使用 Open-Meteo 的时区 API 或直接返回当前时间
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const dateTimeStr = `${parts.find((p) => p.type === 'year')?.value}-${
        parts.find((p) => p.type === 'month')?.value
      }-${parts.find((p) => p.type === 'day')?.value}T${
        parts.find((p) => p.type === 'hour')?.value
      }:${parts.find((p) => p.type === 'minute')?.value}:${
        parts.find((p) => p.type === 'second')?.value
      }`;

      return {
        timezone: tz,
        current_time: dateTimeStr,
        utc_time: now.toISOString(),
        timestamp: now.getTime(),
      };
    } catch (error: any) {
      this.logger.error(`Failed to get current datetime for timezone "${timezone}": ${error.message}`);
      throw error;
    }
  }

  /**
   * 映射天气代码到描述
   * WMO Weather interpretation codes (WW)
   */
  private mapWeatherCode(code: number): { description: string; icon: string } {
    const weatherCodes: Record<number, { description: string; icon: string }> = {
      0: { description: 'Clear sky', icon: '☀️' },
      1: { description: 'Mainly clear', icon: '🌤️' },
      2: { description: 'Partly cloudy', icon: '⛅' },
      3: { description: 'Overcast', icon: '☁️' },
      45: { description: 'Foggy', icon: '🌫️' },
      48: { description: 'Depositing rime fog', icon: '🌫️' },
      51: { description: 'Light drizzle', icon: '🌦️' },
      53: { description: 'Moderate drizzle', icon: '🌦️' },
      55: { description: 'Dense drizzle', icon: '🌦️' },
      56: { description: 'Light freezing drizzle', icon: '🌨️' },
      57: { description: 'Dense freezing drizzle', icon: '🌨️' },
      61: { description: 'Slight rain', icon: '🌧️' },
      63: { description: 'Moderate rain', icon: '🌧️' },
      65: { description: 'Heavy rain', icon: '🌧️' },
      66: { description: 'Light freezing rain', icon: '🌨️' },
      67: { description: 'Heavy freezing rain', icon: '🌨️' },
      71: { description: 'Slight snow fall', icon: '❄️' },
      73: { description: 'Moderate snow fall', icon: '❄️' },
      75: { description: 'Heavy snow fall', icon: '❄️' },
      77: { description: 'Snow grains', icon: '❄️' },
      80: { description: 'Slight rain showers', icon: '🌦️' },
      81: { description: 'Moderate rain showers', icon: '🌦️' },
      82: { description: 'Violent rain showers', icon: '🌦️' },
      85: { description: 'Slight snow showers', icon: '🌨️' },
      86: { description: 'Heavy snow showers', icon: '🌨️' },
      95: { description: 'Thunderstorm', icon: '⛈️' },
      96: { description: 'Thunderstorm with slight hail', icon: '⛈️' },
      99: { description: 'Thunderstorm with heavy hail', icon: '⛈️' },
    };

    return (
      weatherCodes[code] || {
        description: `Unknown weather code: ${code}`,
        icon: '❓',
      }
    );
  }
}
