/**
 * 统一的世界模型接口（整合所有护城河扩展）
 * 
 * 这是护城河扩展的统一接口，整合了：
 * 1. 原有能力（PhysicalRealityModel, HumanCapabilityModel, RouteDirectionWithPhilosophy）
 * 2. 护城河扩展能力（实时状态、预测数据、自适应参数、学习后的能力）
 */

import { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import type { DataProvenance } from '../world-model-provenance.types';

/**
 * 实时天气预警
 */
export interface WeatherAlert {
  id?: string;
  title?: string;
  description?: string;
  region: string;
  alertType: 'WIND' | 'SNOW' | 'FLOOD' | 'VOLCANIC' | 'RAIN' | 'FOG' | 'HEAT' | 'COLD' | 'STORM';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'info' | 'warning' | 'critical';
  startTime: Date;
  endTime: Date;
  impact?: string;
  source?: string;
}

/**
 * 实时道路状态更新
 */
export interface RoadStatusUpdate {
  roadId: string;
  currentStatus: 'OPEN' | 'CLOSED' | 'CONDITIONAL';
  lastUpdate: Date;
  source: 'official' | 'user_report' | 'weather_api' | 'google_traffic_api' | 'road_is_api';
  confidence: number; // 0-1
  metadata?: any; // 可选元数据
}

/**
 * 实时POI状态更新
 */
export interface PoiStatusUpdate {
  poiId: string;
  /** @deprecated 使用 status；保留以兼容旧消费者 */
  currentStatus?: 'OPEN' | 'CLOSED' | 'CROWDED' | 'UNKNOWN';
  status: 'OPEN' | 'CLOSED' | 'CROWDED' | 'UNKNOWN';
  provenance: DataProvenance;
  waitTime?: number; // 等待时间（分钟）
  lastUpdate: Date;
}

/**
 * 实时世界状态
 */
export interface RealtimeWorldState {
  weatherAlerts: WeatherAlert[];
  roadStatusUpdates: RoadStatusUpdate[];
  poiStatusUpdates: PoiStatusUpdate[];
}

/**
 * 天气状况类型
 */
export type WeatherCondition = 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY' | 'FOGGY' | 'WINDY' | 'STORMY' | 'HAZY' | 'UNKNOWN';

/**
 * 天气预测
 */
export interface WeatherPrediction {
  id?: string;
  date: Date;
  temperature: number;
  windSpeed: number;
  precipitation: number;
  visibility?: number;
  accessibilityScore?: number; // 0-1
  riskFactors?: string[];
  // 扩展字段（支持多种天气服务）
  condition?: WeatherCondition;
  windDirection?: number;
  humidity?: number;
  source?: string;
  region?: string;
  confidence: {
    lower: number;
    upper: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
  } | number; // 支持简单数值或详细对象
}

/**
 * 道路状态预测
 */
export interface RoadStatusPrediction {
  roadId: string;
  date: Date;
  predictedStatus: 'OPEN' | 'CLOSED' | 'CONDITIONAL';
  probability: number; // 0-1
  reason: string;
  confidence: {
    lower: number;
    upper: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

/**
 * 失败风险预测
 */
export interface FailureRiskPrediction {
  routeDirectionId: string;
  date: Date;
  predictions: {
    day: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    riskFactors: string[];
    mitigation: string[];
    confidence: {
      lower: number;
      upper: number;
      level: 'LOW' | 'MEDIUM' | 'HIGH';
    };
  }[];
}

/**
 * 预测数据
 */
export interface PredictionData {
  weather: WeatherPrediction[];
  roadStatus: RoadStatusPrediction[];
  failureRisk: FailureRiskPrediction | null;
}

/**
 * 自适应参数
 */
export interface AdaptiveParameters {
  routeDifficultyAdjustment: number; // 路线难度调整系数
  timeEstimateAdjustment: number; // 时间估算调整系数
  riskAssessmentAdjustment: number; // 风险评估调整系数
}

/**
 * 学习后的用户能力
 */
export interface LearnedUserCapability {
  userId: string;
  actualMaxAscent: number; // 实际最大爬升（vs 预估）
  actualRiskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
  actualPace: 'slow' | 'moderate' | 'fast';
  preferredPOITypes: string[];
  predictionAccuracy: {
    ascentPrediction: number; // 0-1
    timePrediction: number; // 0-1
    difficultyPrediction: number; // 0-1
  };
}

/**
 * 路线难度修正
 */
export interface RouteDifficultyCorrection {
  routeDirectionId: string;
  actualDifficulty: number; // 实际难度（基于用户反馈）
  estimatedDifficulty: number; // 预估难度
  correctionFactor: number; // 修正系数
  userCount: number; // 基于多少用户反馈
}

/**
 * 学习后的能力
 */
export interface LearnedCapabilities {
  userCapability: LearnedUserCapability | null;
  routeDifficultyCorrection: RouteDifficultyCorrection | null;
  // 用户实际能力指标（来自因果推理）
  actualMaxAscent?: number;       // 实际最大爬升能力（米）
  actualRiskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';  // 实际风险承受能力
  actualPace?: 'slow' | 'moderate' | 'fast';        // 实际行进节奏
}

/**
 * 多模态感知数据（护城河扩展）
 */
export interface MultimodalPerceptionData {
  poiId?: string;
  routeDirectionId?: string;
  images: Array<{
    imageUrl: string;
    location?: { lat: number; lng: number; confidence: number };
    sceneType?: 'NATURAL' | 'URBAN' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
    detectedObjects?: string[];
    weatherConditions?: 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY';
    crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    accessibility?: 'ACCESSIBLE' | 'MODERATE' | 'CHALLENGING';
    timestamp?: Date;
    confidence: number;
  }>;
  texts: Array<{
    text: string;
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    keywords: string[];
    topics: string[];
    difficultyMentioned?: 'EASY' | 'MODERATE' | 'HARD';
    weatherMentioned?: string[];
    riskFactors?: string[];
    recommendations?: string[];
    confidence: number;
  }>;
  aggregatedInsights: {
    averageSentiment: number; // -1 to 1
    commonKeywords: string[];
    commonTopics: string[];
    difficultyConsensus?: 'EASY' | 'MODERATE' | 'HARD';
    weatherPatterns?: string[];
    riskFactors?: string[];
  };
  confidence: number;
}

/**
 * Layer 1（事实锚点）：Geo / Weather 等硬约束在策略合并时优先于体验/预算提案
 */
export interface WorldModelFactLayerAnchor {
  geoPinned?: boolean;
  weatherPinned?: boolean;
  /** ISO 时间：锚定时刻（便于审计） */
  pinnedAt?: string;
}

/**
 * 体验侧策略提案（多智能体策略层，可与预算侧冲突）
 */
export interface ExperienceStrategyProposal {
  agentId: string;
  tier: 'STANDARD' | 'PREMIUM' | 'ULTRA';
  /** 0–1，与 Decision DNA / 慢思考权重联动时可覆盖 */
  reasoningWeight: number;
  confidence: number;
  narrative?: string;
  /** 如：极光玻璃屋、高端野奢等 */
  anchorLabels?: string[];
}

/**
 * 预算侧策略提案
 */
export interface BudgetStrategyProposal {
  agentId: string;
  expectedSpend: number;
  softCeiling?: number;
  currency: string;
  overrunVsCeiling: boolean;
  reasoningWeight: number;
  confidence: number;
}

/**
 * Layer 2（策略层）：体验 vs 预算等可仲裁提案 + 协作摘要
 */
export interface WorldModelStrategyLayer {
  experienceProposal?: ExperienceStrategyProposal;
  budgetProposal?: BudgetStrategyProposal;
  /** 由 MultiAgentCollaborationService 聚合冲突后写入，供 UI / Narrator */
  consensusSummary?: string;
}

/**
 * 统一的世界模型（整合所有护城河扩展）
 */
export interface UnifiedWorldModel extends WorldModelContext {
  /** 实时世界状态（护城河扩展） */
  realtimeState: RealtimeWorldState;

  /** 预测数据（护城河扩展） */
  predictions: PredictionData;

  /** 自适应参数（护城河扩展） */
  adaptiveParameters: AdaptiveParameters;

  /** 学习后的能力（护城河扩展） */
  learnedCapabilities: LearnedCapabilities;

  /** 多模态感知数据（护城河扩展） */
  multimodalPerception?: MultimodalPerceptionData;

  /** Layer 1：事实锚（地理/气象硬约束底座） */
  factLayerAnchor?: WorldModelFactLayerAnchor;

  /** Layer 2：策略层（体验/预算提案与共识摘要） */
  strategyLayer?: WorldModelStrategyLayer;

  /** 协作数据（护城河扩展） */
  collaborativeData?: {
    contributions: Array<{
      id: string;
      userId: string;
      type: string;
      targetId: string;
      data: any;
      qualityScore: number;
      verifiedByExpert: boolean;
      status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';
    }>;
    averageQualityScore: number;
  };

  /** 因果推理数据（护城河扩展） */
  causalReasoning?: {
    causalChains: Array<{
      id: string;
      sourceType: string;
      targetType: string;
      factors: string[];
      confidence: number;
    }>;
    rootCauses: string[];
    effects: string[];
    overallConfidence: number;
    counterfactuals?: Array<{
      id: string;
      scenario: string;
      originalOutcome: string;
      counterfactualOutcome: string;
      changedFactors: Array<{
        factor: string;
        originalValue: any;
        counterfactualValue: any;
      }>;
      confidence: number;
      explanation: string;
    }>;
  };

  /** 多智能体协作数据（护城河扩展） */
  multiAgentCollaboration?: {
    contributions: Array<{
      agentId: string;
      agentType: string;
      confidence: number;
      timestamp: Date;
    }>;
    conflicts: Array<{
      id: string;
      conflictType: string;
      agents: string[];
      resolution?: {
        resolutionType: string;
        confidence: number;
        explanation: string;
      };
    }>;
    consensusConfidence: number;
    /** 面向 UI 的一句话共识 / 待仲裁摘要 */
    consensusSummary?: string;
    /** 未解决冲突数量（含 STRATEGY_CONFLICT） */
    openConflictCount?: number;
  };

  /** 版本管理数据（护城河扩展） */
  versionInfo?: {
    versionId: string;
    version: string;
    isActive: boolean;
    createdAt: Date;
    performanceMetrics?: {
      userSatisfaction: number;
      predictionAccuracy: number;
      usageCount: number;
      averageConfidence: number;
    };
  };
}

/**
 * 统一的世界模型构建请求
 */
export interface UnifiedWorldModelRequest {
  tripId?: string;
  countryCode?: string;
  season?: number;
  duration?: number;
  partyProfile?: {
    fitness?: 'low' | 'medium' | 'high';
    pace?: 'slow' | 'moderate' | 'fast';
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  routeDirectionId?: string;
  poiId?: string;
  userId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}
