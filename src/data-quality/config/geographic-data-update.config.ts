// src/data-quality/config/geographic-data-update.config.ts

/**
 * 地理数据更新策略配置
 */

export enum UpdateFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

export interface GeographicDataUpdateConfig {
  frequency: UpdateFrequency;
  monitorIntegrity: boolean; // 监控数据完整性
  alertOnMissing: boolean; // 数据缺失时告警
  types?: string[]; // 数据类型列表（用于地理特征）
}

/**
 * 地理数据更新策略配置
 */
export const GEOGRAPHIC_DATA_UPDATE_CONFIG: Record<string, GeographicDataUpdateConfig> = {
  DEM: {
    frequency: UpdateFrequency.YEARLY, // 年度更新
    monitorIntegrity: true, // 监控数据完整性
    alertOnMissing: true, // 数据缺失时告警
  },
  GEOGRAPHIC_FEATURES: {
    frequency: UpdateFrequency.QUARTERLY, // 季度更新
    monitorIntegrity: true,
    alertOnMissing: true,
    types: ['RIVERS', 'MOUNTAINS', 'ROADS', 'COASTLINES', 'PORTS', 'RAILWAYS'],
  },
  OSM: {
    frequency: UpdateFrequency.WEEKLY, // 周度更新（如果使用OSM数据源）
    monitorIntegrity: true,
    alertOnMissing: false,
  },
};

/**
 * 获取更新频率对应的毫秒数
 */
export function getFrequencyMs(frequency: UpdateFrequency): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  
  switch (frequency) {
    case UpdateFrequency.DAILY:
      return msPerDay;
    case UpdateFrequency.WEEKLY:
      return msPerDay * 7;
    case UpdateFrequency.MONTHLY:
      return msPerDay * 30;
    case UpdateFrequency.QUARTERLY:
      return msPerDay * 90;
    case UpdateFrequency.YEARLY:
      return msPerDay * 365;
    default:
      return msPerDay; // 默认每天
  }
}

/**
 * 检查是否需要更新（基于上次更新时间）
 */
export function shouldUpdate(
  lastUpdated: Date,
  frequency: UpdateFrequency
): boolean {
  const now = new Date();
  const timeSinceUpdate = now.getTime() - lastUpdated.getTime();
  const frequencyMs = getFrequencyMs(frequency);
  
  return timeSinceUpdate >= frequencyMs;
}
