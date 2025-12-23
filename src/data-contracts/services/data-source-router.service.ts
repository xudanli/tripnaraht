// src/data-contracts/services/data-source-router.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RoadStatusAdapter } from '../adapters/road-status.adapter.interface';
import { WeatherAdapter } from '../adapters/weather.adapter.interface';
import { TransportAdapter } from '../adapters/transport.adapter.interface';
import { FerryAdapter } from '../adapters/ferry.adapter.interface';
import { RoadStatusQuery, RoadStatus } from '../interfaces/road-status.interface';
import { WeatherQuery, WeatherData } from '../interfaces/weather.interface';
import { TransportQuery, TransportSchedule } from '../interfaces/transport-schedule.interface';
import { FerryQuery, FerrySchedule } from '../interfaces/ferry-schedule.interface';

/**
 * 数据源路由器服务
 * 
 * 根据经纬度自动选择合适的数据适配器
 * 实现"按需触发"机制
 */
@Injectable()
export class DataSourceRouterService implements OnModuleInit {
  private readonly logger = new Logger(DataSourceRouterService.name);
  
  // 适配器注册表
  private roadStatusAdapters: RoadStatusAdapter[] = [];
  private weatherAdapters: WeatherAdapter[] = [];
  private transportAdapters: TransportAdapter[] = [];
  private ferryAdapters: FerryAdapter[] = [];
  
  // 国家代码到适配器的映射缓存
  private roadStatusAdapterCache: Map<string, RoadStatusAdapter> = new Map();
  private weatherAdapterCache: Map<string, WeatherAdapter> = new Map();
  private transportAdapterCache: Map<string, TransportAdapter> = new Map();
  private ferryAdapterCache: Map<string, FerryAdapter> = new Map();

  /**
   * 注册路况适配器
   */
  registerRoadStatusAdapter(adapter: RoadStatusAdapter): void {
    this.roadStatusAdapters.push(adapter);
    this.logger.log(`注册路况适配器: ${adapter.getName()}`);
  }

  /**
   * 注册天气适配器
   */
  registerWeatherAdapter(adapter: WeatherAdapter): void {
    this.weatherAdapters.push(adapter);
    this.logger.log(`注册天气适配器: ${adapter.getName()}`);
  }

  /**
   * 注册公共交通适配器
   */
  registerTransportAdapter(adapter: TransportAdapter): void {
    this.transportAdapters.push(adapter);
    this.logger.log(`注册公共交通适配器: ${adapter.getName()}`);
  }

  /**
   * 注册轮渡适配器
   */
  registerFerryAdapter(adapter: FerryAdapter): void {
    this.ferryAdapters.push(adapter);
    this.logger.log(`注册轮渡适配器: ${adapter.getName()}`);
  }

  /**
   * 获取路况状态
   * 根据经纬度自动选择适配器
   */
  async getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus> {
    const countryCode = await this.getCountryCode(query.lat, query.lng);
    const adapter = this.selectRoadStatusAdapter(countryCode);
    return adapter.getRoadStatus(query);
  }

  /**
   * 批量获取路况状态
   */
  async getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]> {
    const countryCode = await this.getCountryCode(query.lat, query.lng);
    const adapter = this.selectRoadStatusAdapter(countryCode);
    return adapter.getRoadStatuses(query);
  }

  /**
   * 获取天气数据
   */
  async getWeather(query: WeatherQuery): Promise<WeatherData> {
    const countryCode = await this.getCountryCode(query.lat, query.lng);
    const adapter = this.selectWeatherAdapter(countryCode);
    return adapter.getWeather(query);
  }

  /**
   * 获取交通时刻表
   */
  async getTransportSchedule(query: TransportQuery): Promise<TransportSchedule[]> {
    // 优先使用站名/代码匹配，其次使用坐标
    let countryCode: string | undefined;
    
    if (query.from.coordinates) {
      countryCode = await this.getCountryCode(
        query.from.coordinates.lat,
        query.from.coordinates.lng
      );
    } else if (query.to.coordinates) {
      countryCode = await this.getCountryCode(
        query.to.coordinates.lat,
        query.to.coordinates.lng
      );
    }
    
    if (!countryCode) {
      // 如果没有坐标，尝试从站名推断（这里简化处理，实际可能需要更复杂的逻辑）
      throw new Error('无法确定国家代码，请提供坐标信息');
    }
    
    const adapter = this.selectTransportAdapter(countryCode);
    return adapter.getSchedule(query);
  }

  /**
   * 获取轮渡时刻表
   */
  async getFerrySchedule(query: FerryQuery): Promise<FerrySchedule[]> {
    let countryCode: string | undefined;
    
    if (query.from.coordinates) {
      countryCode = await this.getCountryCode(
        query.from.coordinates.lat,
        query.from.coordinates.lng
      );
    } else if (query.to.coordinates) {
      countryCode = await this.getCountryCode(
        query.to.coordinates.lat,
        query.to.coordinates.lng
      );
    }
    
    if (!countryCode) {
      throw new Error('无法确定国家代码，请提供坐标信息');
    }
    
    const adapter = this.selectFerryAdapter(countryCode);
    return adapter.getSchedule(query);
  }

  /**
   * 选择路况适配器
   */
  private selectRoadStatusAdapter(countryCode: string): RoadStatusAdapter {
    // 检查缓存
    if (this.roadStatusAdapterCache.has(countryCode)) {
      return this.roadStatusAdapterCache.get(countryCode)!;
    }

    // 查找支持该国家的适配器
    const candidates = this.roadStatusAdapters.filter(adapter =>
      adapter.getSupportedCountries().includes(countryCode) ||
      adapter.getSupportedCountries().includes('*') // '*' 表示支持所有国家
    );

    if (candidates.length === 0) {
      // 如果没有特定适配器，使用默认适配器（支持所有国家）
      const defaultAdapter = this.roadStatusAdapters.find(a => 
        a.getSupportedCountries().includes('*')
      );
      if (defaultAdapter) {
        this.roadStatusAdapterCache.set(countryCode, defaultAdapter);
        return defaultAdapter;
      }
      throw new Error(`未找到支持国家 ${countryCode} 的路况适配器`);
    }

    // 按优先级排序，选择优先级最高的
    candidates.sort((a, b) => a.getPriority() - b.getPriority());
    const selected = candidates[0];
    
    // 缓存结果
    this.roadStatusAdapterCache.set(countryCode, selected);
    
    this.logger.debug(`为 ${countryCode} 选择路况适配器: ${selected.getName()}`);
    return selected;
  }

  /**
   * 选择天气适配器
   */
  private selectWeatherAdapter(countryCode: string): WeatherAdapter {
    if (this.weatherAdapterCache.has(countryCode)) {
      return this.weatherAdapterCache.get(countryCode)!;
    }

    const candidates = this.weatherAdapters.filter(adapter =>
      adapter.getSupportedCountries().includes(countryCode) ||
      adapter.getSupportedCountries().includes('*')
    );

    if (candidates.length === 0) {
      const defaultAdapter = this.weatherAdapters.find(a => 
        a.getSupportedCountries().includes('*')
      );
      if (defaultAdapter) {
        this.weatherAdapterCache.set(countryCode, defaultAdapter);
        return defaultAdapter;
      }
      throw new Error(`未找到支持国家 ${countryCode} 的天气适配器`);
    }

    candidates.sort((a, b) => a.getPriority() - b.getPriority());
    const selected = candidates[0];
    
    this.weatherAdapterCache.set(countryCode, selected);
    this.logger.debug(`为 ${countryCode} 选择天气适配器: ${selected.getName()}`);
    return selected;
  }

  /**
   * 选择公共交通适配器
   */
  private selectTransportAdapter(countryCode: string): TransportAdapter {
    if (this.transportAdapterCache.has(countryCode)) {
      return this.transportAdapterCache.get(countryCode)!;
    }

    const candidates = this.transportAdapters.filter(adapter =>
      adapter.getSupportedCountries().includes(countryCode) ||
      adapter.getSupportedCountries().includes('*')
    );

    if (candidates.length === 0) {
      const defaultAdapter = this.transportAdapters.find(a => 
        a.getSupportedCountries().includes('*')
      );
      if (defaultAdapter) {
        this.transportAdapterCache.set(countryCode, defaultAdapter);
        return defaultAdapter;
      }
      throw new Error(`未找到支持国家 ${countryCode} 的公共交通适配器`);
    }

    candidates.sort((a, b) => a.getPriority() - b.getPriority());
    const selected = candidates[0];
    
    this.transportAdapterCache.set(countryCode, selected);
    this.logger.debug(`为 ${countryCode} 选择公共交通适配器: ${selected.getName()}`);
    return selected;
  }

  /**
   * 选择轮渡适配器
   */
  private selectFerryAdapter(countryCode: string): FerryAdapter {
    if (this.ferryAdapterCache.has(countryCode)) {
      return this.ferryAdapterCache.get(countryCode)!;
    }

    const candidates = this.ferryAdapters.filter(adapter =>
      adapter.getSupportedCountries().includes(countryCode) ||
      adapter.getSupportedCountries().includes('*')
    );

    if (candidates.length === 0) {
      const defaultAdapter = this.ferryAdapters.find(a => 
        a.getSupportedCountries().includes('*')
      );
      if (defaultAdapter) {
        this.ferryAdapterCache.set(countryCode, defaultAdapter);
        return defaultAdapter;
      }
      throw new Error(`未找到支持国家 ${countryCode} 的轮渡适配器`);
    }

    candidates.sort((a, b) => a.getPriority() - b.getPriority());
    const selected = candidates[0];
    
    this.ferryAdapterCache.set(countryCode, selected);
    this.logger.debug(`为 ${countryCode} 选择轮渡适配器: ${selected.getName()}`);
    return selected;
  }

  /**
   * 根据经纬度获取国家代码
   * 
   * TODO: 实现反向地理编码，可以使用 PostGIS 查询或外部 API
   * 目前简化实现，后续可以接入 Google Geocoding API 或使用 PostGIS
   */
  private async getCountryCode(lat: number, lng: number): Promise<string> {
    // TODO: 实现实际的地理编码逻辑
    // 这里先返回一个占位符，实际应该查询数据库或调用 API
    // 可以使用 PostGIS 的 ST_Within 查询，或者调用 Google Geocoding API
    
    // 临时实现：根据坐标范围粗略判断（仅用于演示）
    // 实际应该使用 PostGIS 或地理编码服务
    
    // 冰岛大致范围
    if (lat >= 63.0 && lat <= 67.0 && lng >= -25.0 && lng <= -13.0) {
      return 'IS';
    }
    
    // 挪威大致范围
    if (lat >= 57.0 && lat <= 71.0 && lng >= 4.0 && lng <= 32.0) {
      return 'NO';
    }
    
    // 新西兰大致范围
    if (lat >= -47.0 && lat <= -34.0 && lng >= 166.0 && lng <= 179.0) {
      return 'NZ';
    }
    
    // 中国大致范围
    if (lat >= 18.0 && lat <= 54.0 && lng >= 73.0 && lng <= 135.0) {
      return 'CN';
    }
    
    // 瑞士大致范围
    if (lat >= 45.0 && lat <= 48.0 && lng >= 5.0 && lng <= 11.0) {
      return 'CH';
    }
    
    // 日本大致范围
    if (lat >= 24.0 && lat <= 46.0 && lng >= 122.0 && lng <= 146.0) {
      return 'JP';
    }
    
    // 默认返回 'UNKNOWN'，会使用默认适配器
    return 'UNKNOWN';
  }

  /**
   * 模块初始化
   */
  onModuleInit() {
    this.logger.log('数据源路由器服务已初始化');
    this.logger.log(`已注册 ${this.roadStatusAdapters.length} 个路况适配器`);
    this.logger.log(`已注册 ${this.weatherAdapters.length} 个天气适配器`);
    this.logger.log(`已注册 ${this.transportAdapters.length} 个公共交通适配器`);
    this.logger.log(`已注册 ${this.ferryAdapters.length} 个轮渡适配器`);
  }
}

