// src/data-contracts/adapters/ferry.adapter.interface.ts

import { FerrySchedule, FerryQuery } from '../interfaces/ferry-schedule.interface';

/**
 * 轮渡适配器接口
 * 
 * 所有轮渡数据源适配器都必须实现这个接口
 */
export interface FerryAdapter {
  /**
   * 获取轮渡时刻表
   * 
   * @param query 查询请求
   * @returns 轮渡时刻表
   */
  getSchedule(query: FerryQuery): Promise<FerrySchedule[]>;
  
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

