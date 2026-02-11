// src/trips/decision/optimization/realtime/realtime-world-state.interface.ts
/**
 * 实时世界状态更新接口
 * 
 * 中期功能：支持世界状态的实时更新和推送
 * 
 * 核心能力：
 * 1. WebSocket 实时推送
 * 2. 贝叶斯更新（融合新观测）
 * 3. 预测状态演变
 * 4. 变化检测和告警
 */

import { ProbabilisticWorldModelContext } from '../probabilistic/probabilistic-world-model.interface';
import { Distribution } from '../probabilistic/distribution.interface';

/**
 * 观测来源
 */
export type ObservationSource = 
  | 'USER_REPORT'      // 用户报告
  | 'WEATHER_API'      // 天气 API
  | 'ROAD_AUTHORITY'   // 道路管理局
  | 'SENSOR'           // 传感器（如可穿戴设备）
  | 'PREDICTION'       // 预测模型
  | 'CROWD_SOURCE';    // 众包数据

/**
 * 观测数据
 */
export interface WorldObservation {
  /** 观测 ID */
  observationId: string;
  
  /** 观测类型 */
  type: 'WEATHER' | 'ROAD_STATUS' | 'HAZARD' | 'HUMAN_STATE' | 'TRANSPORT';
  
  /** 观测来源 */
  source: ObservationSource;
  
  /** 观测时间 */
  timestamp: string;
  
  /** 位置（如适用） */
  location?: {
    lat: number;
    lng: number;
    segmentId?: string;
  };
  
  /** 观测数据 */
  data: Record<string, any>;
  
  /** 观测置信度 */
  confidence: number;
  
  /** 有效期（小时） */
  validityHours: number;
}

/**
 * 天气观测
 */
export interface WeatherObservation extends WorldObservation {
  type: 'WEATHER';
  data: {
    windSpeedMs?: number;
    precipitationMm?: number;
    visibilityM?: number;
    temperatureC?: number;
    condition?: string;
  };
}

/**
 * 道路状态观测
 */
export interface RoadStatusObservation extends WorldObservation {
  type: 'ROAD_STATUS';
  data: {
    roadId: string;
    status: 'OPEN' | 'RESTRICTED' | 'CLOSED';
    reason?: string;
    expectedReopenTime?: string;
  };
}

/**
 * 危险区域观测
 */
export interface HazardObservation extends WorldObservation {
  type: 'HAZARD';
  data: {
    hazardType: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    affectedArea?: { lat: number; lng: number; radiusM: number };
    description: string;
  };
}

/**
 * 人体状态观测
 */
export interface HumanStateObservation extends WorldObservation {
  type: 'HUMAN_STATE';
  data: {
    userId: string;
    fatigueLevel?: number;
    heartRate?: number;
    pace?: number;
    altitude?: number;
  };
}

/**
 * 状态变化事件
 */
export interface StateChangeEvent {
  /** 事件 ID */
  eventId: string;
  
  /** 变化类型 */
  changeType: 'WEATHER_CHANGE' | 'ROAD_CLOSURE' | 'HAZARD_ALERT' | 'FATIGUE_WARNING' | 'SCHEDULE_DRIFT';
  
  /** 严重程度 */
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  
  /** 影响的计划部分 */
  affectedSegments: string[];
  
  /** 变化描述 */
  description: string;
  
  /** 建议的行动 */
  recommendedActions: string[];
  
  /** 发生时间 */
  timestamp: string;
  
  /** 预计影响时长（小时） */
  expectedDurationHours?: number;
}

/**
 * 实时状态更新
 */
export interface RealtimeStateUpdate {
  /** 更新 ID */
  updateId: string;
  
  /** 行程 ID */
  tripId: string;
  
  /** 更新时间 */
  timestamp: string;
  
  /** 更新后的概率世界模型 */
  updatedWorldModel: ProbabilisticWorldModelContext;
  
  /** 触发的事件 */
  events: StateChangeEvent[];
  
  /** 是否需要重新规划 */
  requiresReplan: boolean;
  
  /** 重规划原因 */
  replanReason?: string;
  
  /** 下次预计更新时间 */
  nextUpdateExpected: string;
}

/**
 * 订阅配置
 */
export interface SubscriptionConfig {
  /** 行程 ID */
  tripId: string;
  
  /** 用户 ID */
  userId: string;
  
  /** 订阅的事件类型 */
  eventTypes: StateChangeEvent['changeType'][];
  
  /** 最小严重程度（只推送此级别及以上） */
  minSeverity: StateChangeEvent['severity'];
  
  /** 更新频率（秒） */
  updateIntervalSeconds: number;
  
  /** 是否包含预测更新 */
  includePredictions: boolean;
}

/**
 * 贝叶斯更新配置
 */
export interface BayesianUpdateConfig {
  /** 先验权重（0-1，越高越信任先验） */
  priorWeight: number;
  
  /** 观测衰减因子（旧观测权重衰减） */
  observationDecay: number;
  
  /** 最大融合观测数 */
  maxObservationsToFuse: number;
  
  /** 异常值阈值（标准差倍数） */
  outlierThreshold: number;
}

/**
 * 实时世界状态服务接口
 */
export interface IRealtimeWorldStateService {
  /**
   * 订阅状态更新
   */
  subscribe(config: SubscriptionConfig): Promise<string>; // 返回订阅 ID
  
  /**
   * 取消订阅
   */
  unsubscribe(subscriptionId: string): Promise<void>;
  
  /**
   * 提交观测
   */
  submitObservation(observation: WorldObservation): Promise<void>;
  
  /**
   * 获取当前状态
   * @returns 返回当前状态，如未初始化则返回 null
   */
  getCurrentState(tripId: string): Promise<ProbabilisticWorldModelContext | null>;
  
  /**
   * 检查状态是否存在
   */
  hasState(tripId: string): boolean;
  
  /**
   * 贝叶斯更新
   */
  bayesianUpdate(
    currentState: ProbabilisticWorldModelContext,
    observations: WorldObservation[],
    config?: BayesianUpdateConfig,
  ): ProbabilisticWorldModelContext;
  
  /**
   * 预测未来状态
   */
  predictFutureState(
    currentState: ProbabilisticWorldModelContext,
    hoursAhead: number,
  ): ProbabilisticWorldModelContext;
  
  /**
   * 检测状态变化
   */
  detectChanges(
    previousState: ProbabilisticWorldModelContext,
    currentState: ProbabilisticWorldModelContext,
  ): StateChangeEvent[];
}
