// src/trips/decision/prediction/mobagel-forecast.interface.ts
/**
 * MoBagel 预测模型接口
 * 
 * MoBagel 作为"动态权重源"（Dynamic Weight Source）
 * 不直接输出路线，而是输出 Feature Flags / Meta Tags
 * 
 * 设计原则：
 * - 预测结果注入到 PhysicalRealityModel / ObjectiveWeights
 * - 让 Hard Core（Abu / Dr.Dre / Neptune）基于这些标签做确定性决策
 */

/**
 * 价格预测
 */
export interface PriceForecast {
  /** 国家代码 */
  countryCode: string;
  
  /** 月份（1-12） */
  month: number;
  
  /** 路线方向 ID（可选） */
  routeDirectionId?: string;
  
  /** 预测的预算区间（USD） */
  budgetRange: {
    min: number;
    max: number;
    median: number;
    percentile25: number;
    percentile75: number;
  };
  
  /** 成本分解 */
  costBreakdown: {
    flight?: { min: number; max: number; median: number };
    hotel?: { min: number; max: number; median: number };
    carRental?: { min: number; max: number; median: number };
    guide?: { min: number; max: number; median: number };
    food?: { min: number; max: number; median: number };
  };
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 数据来源 */
  dataSource: 'HISTORICAL' | 'THIRD_PARTY_API' | 'MODEL_PREDICTION';
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 拥挤度预测
 */
export interface CrowdForecast {
  /** 国家代码 */
  countryCode: string;
  
  /** 月份（1-12） */
  month: number;
  
  /** 区域或 POI ID（可选） */
  regionId?: string;
  poiId?: string;
  
  /** 拥挤度等级 */
  crowdLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  
  /** 拥挤度分数（0-1，1 表示最拥挤） */
  crowdScore: number;
  
  /** 预测的游客数量（如果可用） */
  estimatedVisitorCount?: number;
  
  /** 建议错峰月份 */
  recommendedOffPeakMonths?: number[];
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 路线风险预测
 */
export interface RouteRiskForecast {
  /** 国家代码 */
  countryCode: string;
  
  /** 月份（1-12） */
  month: number;
  
  /** 路线方向 ID */
  routeDirectionId: string;
  
  /** 路段 ID（可选，如果针对特定路段） */
  segmentId?: string;
  
  /** 封路概率（0-1） */
  closureProbability: number;
  
  /** 天气风险等级 */
  weatherRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  
  /** 天气风险分数（0-1，1 表示最高风险） */
  weatherRiskScore: number;
  
  /** 具体风险项 */
  riskItems: Array<{
    type: 'ROAD_CLOSURE' | 'WEATHER' | 'AVALANCHE' | 'FLOOD' | 'OTHER';
    probability: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
  }>;
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 路线放弃率预测
 */
export interface RouteAbandonmentForecast {
  /** 路线方向 ID */
  routeDirectionId: string;
  
  /** 用户画像（HumanCapabilityModel 的简化表示） */
  userProfile: {
    preferredPace?: 'SLOW' | 'MEDIUM' | 'FAST';
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    fitness?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  /** 放弃概率（0-1） */
  abandonmentProbability: number;
  
  /** 放弃原因预测 */
  predictedReasons: Array<{
    reason: string;
    probability: number;
  }>;
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 疲劳失败率预测
 */
export interface FatigueFailureForecast {
  /** 路线方向 ID */
  routeDirectionId: string;
  
  /** 用户能力参数 */
  humanCapability: {
    maxDailyAscentM: number;
    rollingAscent3DaysM: number;
    maxSlopePct: number;
  };
  
  /** 失败概率（0-1） */
  failureProbability: number;
  
  /** 预测的失败天数（如果失败） */
  predictedFailureDay?: number;
  
  /** 失败原因预测 */
  predictedFailureReason?: 'FATIGUE' | 'ALTITUDE_SICKNESS' | 'OVER_EXERTION';
  
  /** 置信度（0-1） */
  confidence: number;
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * MoBagel 预测服务接口
 */
export interface IMoBagelForecastService {
  /**
   * 获取价格预测
   */
  getPriceForecast(
    countryCode: string,
    month: number,
    routeDirectionId?: string
  ): Promise<PriceForecast>;

  /**
   * 获取拥挤度预测
   */
  getCrowdForecast(
    countryCode: string,
    month: number,
    regionId?: string,
    poiId?: string
  ): Promise<CrowdForecast>;

  /**
   * 获取路线风险预测
   */
  getRouteRiskForecast(
    countryCode: string,
    month: number,
    routeDirectionId: string,
    segmentId?: string
  ): Promise<RouteRiskForecast>;

  /**
   * 获取路线放弃率预测
   */
  getRouteAbandonmentForecast(
    routeDirectionId: string,
    userProfile: RouteAbandonmentForecast['userProfile']
  ): Promise<RouteAbandonmentForecast>;

  /**
   * 获取疲劳失败率预测
   */
  getFatigueFailureForecast(
    routeDirectionId: string,
    humanCapability: FatigueFailureForecast['humanCapability']
  ): Promise<FatigueFailureForecast>;
}

/**
 * 预测结果注入到 PhysicalRealityModel 的标签格式
 */
export interface PhysicalRealityTag {
  /** 标签类型 */
  type: 'PRICE' | 'CROWD' | 'RISK' | 'ABANDONMENT' | 'FATIGUE';
  
  /** 标签值 */
  value: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
    score: number; // 0-1
    probability?: number; // 0-1
    metadata?: Record<string, any>;
  };
  
  /** 来源 */
  source: 'MOBAGEL' | 'HISTORICAL' | 'THIRD_PARTY';
  
  /** 置信度 */
  confidence: number;
}

