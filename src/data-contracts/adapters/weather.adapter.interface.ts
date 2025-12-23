// src/data-contracts/adapters/weather.adapter.interface.ts

import { WeatherData, WeatherQuery } from '../interfaces/weather.interface';

/**
 * 天气适配器接口
 * 
 * 所有天气数据源适配器都必须实现这个接口
 */
export interface WeatherAdapter {
  /**
   * 获取天气数据
   * 
   * @param query 查询请求
   * @returns 天气数据
   */
  getWeather(query: WeatherQuery): Promise<WeatherData>;
  
  /**
   * 获取适配器支持的国家代码列表
   * 
   * @returns 国家代码数组（ISO 3166-1 alpha-2）
   */
  getSupportedCountries(): string[];
  
  /**
   * 获取适配器优先级（数字越小优先级越高）
   */
  getPriority(): number;
  
  /**
   * 获取适配器名称
   */
  getName(): string;
}

