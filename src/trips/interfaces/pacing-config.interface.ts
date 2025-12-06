// src/trips/interfaces/pacing-config.interface.ts

/**
 * 体能配置接口（木桶效应计算结果）
 * 
 * 这是前端通过"木桶算法"算出后传给后端的最终决策配置
 */
export interface PacingConfig {
  /** 全日总能量 (HP上限，默认 100) */
  max_daily_hp: number;
  
  /** 休息回血倍率 (每次休息恢复的HP百分比，默认 0.4 = 40%) */
  hp_recovery_rate: number;
  
  /** 步行速度系数 (1.0 = 标准, 1.5 = 慢, 0.8 = 快) */
  walk_speed_factor: number;
  
  /** 爬楼梯的消耗倍率 (脆皮=1.5, 膝盖不好=999, 正常=1.0) */
  stairs_penalty_factor: number;
  
  /** 强制休息间隔 (分钟，超过此时间必须休息) */
  forced_rest_interval_min: number;
  
  /** 地形限制 */
  terrain_filter: 'ALL' | 'NO_STAIRS' | 'WHEELCHAIR_ONLY' | 'ELEVATOR_REQUIRED';
  
  /** 描述信息 */
  desc?: string;
  
  /** 最小体力阈值 (低于此值必须休息，默认 20) */
  min_hp_threshold?: number;
}

/**
 * 体能画像定义 (Persona Definitions)
 */
export enum MobilityProfile {
  /** 特种兵：能走、能爬、续航长 */
  IRON_LEGS = 'IRON_LEGS',
  
  /** 银发徒步：能走但膝盖不好，不能爬楼梯 */
  ACTIVE_SENIOR = 'ACTIVE_SENIOR',
  
  /** 城市脆皮：续航短，需要频繁休息 */
  CITY_POTATO = 'CITY_POTATO',
  
  /** 行动不便：轮椅/助行器 */
  LIMITED = 'LIMITED',
}

/**
 * 兴趣维度（年龄/身份）
 */
export enum InterestProfile {
  /** 老人 */
  ELDERLY = 'ELDERLY',
  
  /** 青年 */
  ADULT = 'ADULT',
  
  /** 儿童 */
  CHILD = 'CHILD',
}

/**
 * 旅行者信息（双轴模型）
 */
export interface TravelerInfo {
  /** 兴趣维度（年龄/身份） */
  interestProfile: InterestProfile;
  
  /** 体能维度（用户画像） */
  mobilityProfile: MobilityProfile;
  
  /** 数量 */
  count: number;
}

