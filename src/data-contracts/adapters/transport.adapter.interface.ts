// src/data-contracts/adapters/transport.adapter.interface.ts

import { TransportSchedule, TransportQuery } from '../interfaces/transport-schedule.interface';

/**
 * 公共交通适配器接口
 * 
 * 所有公共交通数据源适配器都必须实现这个接口
 */
export interface TransportAdapter {
  /**
   * 获取交通时刻表
   * 
   * @param query 查询请求
   * @returns 交通时刻表
   */
  getSchedule(query: TransportQuery): Promise<TransportSchedule[]>;
  
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

