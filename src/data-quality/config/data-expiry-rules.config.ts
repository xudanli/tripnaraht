// src/data-quality/config/data-expiry-rules.config.ts

/**
 * 数据过期规则配置
 */

export interface ExpiryRule {
  expiryDays?: number; // 过期天数（如果设置）
  checkIntegrity: boolean; // 检查数据完整性
  alertOnMissing: boolean; // 数据缺失时告警
}

/**
 * 数据过期规则配置
 */
export const EXPIRY_RULES: Record<string, ExpiryRule | Record<string, ExpiryRule>> = {
  // DEM数据：不设置过期时间，但监控数据完整性
  DEM: {
    checkIntegrity: true,
    alertOnMissing: true,
  },
  
  // 地理特征数据：根据数据类型设置不同的过期时间
  GEOGRAPHIC_FEATURES: {
    RIVERS: {
      expiryDays: 365, // 1年
      checkIntegrity: true,
      alertOnMissing: true,
    },
    MOUNTAINS: {
      expiryDays: 365, // 1年
      checkIntegrity: true,
      alertOnMissing: true,
    },
    ROADS: {
      expiryDays: 90, // 3个月
      checkIntegrity: true,
      alertOnMissing: true,
    },
    COASTLINES: {
      expiryDays: 365, // 1年
      checkIntegrity: true,
      alertOnMissing: true,
    },
    PORTS: {
      expiryDays: 90, // 3个月
      checkIntegrity: true,
      alertOnMissing: true,
    },
    RAILWAYS: {
      expiryDays: 180, // 6个月
      checkIntegrity: true,
      alertOnMissing: true,
    },
  },
  
  // 物理现实数据
  ROAD_STATUS: {
    expiryDays: 1, // 1天（道路状态需要频繁更新）
    checkIntegrity: true,
    alertOnMissing: true,
  },
  FERRY_SCHEDULES: {
    expiryDays: 7, // 7天（渡轮时刻表）
    checkIntegrity: true,
    alertOnMissing: true,
  },
  WEATHER_WINDOWS: {
    expiryDays: 1, // 1天（天气窗口需要频繁更新）
    checkIntegrity: true,
    alertOnMissing: true,
  },
};

/**
 * 检查数据是否过期
 */
export function isDataExpired(lastUpdated: Date, expiryDays?: number): boolean {
  if (!expiryDays) {
    return false; // 如果没有设置过期时间，则认为不过期
  }
  
  const now = new Date();
  const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  
  return daysSinceUpdate > expiryDays;
}
