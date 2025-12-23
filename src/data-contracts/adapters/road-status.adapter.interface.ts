// src/data-contracts/adapters/road-status.adapter.interface.ts

import { RoadStatus, RoadStatusQuery } from '../interfaces/road-status.interface';

/**
 * 路况适配器接口
 * 
 * 所有路况数据源适配器都必须实现这个接口
 */
export interface RoadStatusAdapter {
  /**
   * 获取路况状态
   * 
   * @param query 查询请求
   * @returns 路况状态
   */
  getRoadStatus(query: RoadStatusQuery): Promise<RoadStatus>;
  
  /**
   * 批量获取路段路况
   * 
   * @param query 查询请求（包含多个路段）
   * @returns 路段路况列表
   */
  getRoadStatuses(query: RoadStatusQuery): Promise<RoadStatus[]>;
  
  /**
   * 获取适配器支持的国家代码列表
   * 
   * @returns 国家代码数组（ISO 3166-1 alpha-2）
   */
  getSupportedCountries(): string[];
  
  /**
   * 获取适配器优先级（数字越小优先级越高）
   * 当多个适配器支持同一国家时，使用优先级最高的
   */
  getPriority(): number;
  
  /**
   * 获取适配器名称
   */
  getName(): string;
}

