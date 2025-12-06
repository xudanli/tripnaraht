// src/transport/interfaces/transport.interface.ts

/**
 * 交通方式枚举
 */
export enum TransportMode {
  /** 步行 */
  WALKING = 'WALKING',
  
  /** 公共交通（地铁、公交） */
  TRANSIT = 'TRANSIT',
  
  /** 打车（出租车、Uber） */
  TAXI = 'TAXI',
  
  /** 铁路/高铁（城市间） */
  RAIL = 'RAIL',
  
  /** 长途巴士（城市间） */
  BUS = 'BUS',
  
  /** 飞机（城市间） */
  FLIGHT = 'FLIGHT',
}

/**
 * 交通选项
 * 
 * 包含一种交通方式的完整信息
 */
export interface TransportOption {
  /** 交通方式 */
  mode: TransportMode;
  
  /** 预计时长（分钟） */
  durationMinutes: number;
  
  /** 费用（元） */
  cost: number;
  
  /** 步行距离（米） */
  walkDistance: number;
  
  /** 换乘次数（仅公共交通） */
  transfers?: number;
  
  /** 痛苦指数（越低越好，由算法计算） */
  score?: number;
  
  /** 推荐理由 */
  recommendationReason?: string;
  
  /** 警告信息 */
  warnings?: string[];
  
  /** 详细描述 */
  description?: string;
}

/**
 * 用户上下文
 * 
 * 影响交通决策的用户画像和环境因素
 */
export interface UserContext {
  /** 是否带着行李移动（如：换酒店日） */
  hasLuggage: boolean;
  
  /** 是否有老人同行 */
  hasElderly: boolean;
  
  /** 是否正在下雨 */
  isRaining: boolean;
  
  /** 预算敏感度 */
  budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 时间敏感度 */
  timeSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 是否有行动不便成员 */
  hasLimitedMobility?: boolean;
  
  /** 当前城市代码 */
  currentCity?: string;
  
  /** 目标城市代码 */
  targetCity?: string;
  
  /** 是否为换酒店日 */
  isMovingDay?: boolean;
}

/**
 * 交通推荐结果
 */
export interface TransportRecommendation {
  /** 推荐选项（已排序，第一个为最优） */
  options: TransportOption[];
  
  /** 推荐理由 */
  recommendationReason: string;
  
  /** 特殊建议（如行李寄存） */
  specialAdvice?: string[];
}

