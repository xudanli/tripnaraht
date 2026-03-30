// src/route-directions/interfaces/enhanced-risk-assessment.interface.ts

/**
 * 增强的风险评估接口定义
 * 
 * 基于 ROUTE_STRUCTURE_THEORY_COMPLIANCE.md 的P2要求：
 * - 成本风险评估
 * - 体验风险评估
 * - 风险应对策略矩阵
 */

/**
 * 风险类型
 */
export type RiskCategory = 'SAFETY' | 'PHYSICAL' | 'TIME' | 'EXPERIENCE' | 'COST';

/**
 * 风险等级
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 成本风险因素
 */
export interface CostRiskFactors {
  /** 预算超支风险 */
  budgetOverrun?: {
    probability: number; // 0-1
    estimatedOverrun: number; // 超支金额（CNY）
    reasons: string[];
  };
  /** 临时取消风险 */
  cancellationRisk?: {
    probability: number; // 0-1
    cancellationFee: number; // 取消费用（CNY）
    refundable: boolean;
    reasons: string[];
  };
  /** 汇率波动风险 */
  exchangeRateRisk?: {
    probability: number; // 0-1
    estimatedImpact: number; // 影响金额（CNY）
    currency: string;
    volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  /** 隐性成本风险 */
  hiddenCosts?: {
    items: Array<{
      type: string; // 'PARKING' | 'ENTRANCE_FEE' | 'EQUIPMENT_RENTAL' | 'GUIDE_FEE' | 'OTHER'
      description: string;
      estimatedCost: number;
      probability: number;
    }>;
    totalEstimated: number;
  };
  /** 旺季溢价风险 */
  peakSeasonSurcharge?: {
    isPeakSeason: boolean;
    surchargePercentage: number; // 0-100
    estimatedAdditionalCost: number;
  };
}

/**
 * 成本风险评估结果
 */
export interface CostRiskAssessment {
  /** 总体成本风险等级 */
  overallLevel: RiskLevel;
  /** 总体成本风险评分（0-1） */
  overallScore: number;
  /** 风险因素详情 */
  factors: CostRiskFactors;
  /** 风险摘要 */
  summary: string;
  /** 建议 */
  recommendations: string[];
  /** 预期总成本范围 */
  estimatedCostRange: {
    min: number;
    max: number;
    base: number;
  };
}

/**
 * 体验风险因素
 */
export interface ExperienceRiskFactors {
  /** 人流拥挤风险 */
  crowdingRisk?: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    peakTimes: string[];
    estimatedWaitTime: number; // 分钟
    impact: string;
  };
  /** 维护关闭风险 */
  maintenanceClosure?: {
    probability: number; // 0-1
    closureDates?: string[];
    alternativeOptions?: string[];
    impact: string;
  };
  /** 预期偏差风险 */
  expectationGap?: {
    probability: number; // 0-1
    potentialGaps: Array<{
      aspect: string; // 'SCENERY' | 'FACILITIES' | 'SERVICE' | 'WEATHER' | 'OTHER'
      description: string;
      severity: RiskLevel;
    }>;
    impact: string;
  };
  /** 季节性体验风险 */
  seasonalExperienceRisk?: {
    currentSeason: string;
    optimalSeason: string;
    experienceDifference: string;
    impact: string;
  };
  /** 天气影响体验风险 */
  weatherImpactRisk?: {
    weatherDependent: boolean;
    weatherSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
    impact: string;
  };
}

/**
 * 体验风险评估结果
 */
export interface ExperienceRiskAssessment {
  /** 总体体验风险等级 */
  overallLevel: RiskLevel;
  /** 总体体验风险评分（0-1） */
  overallScore: number;
  /** 风险因素详情 */
  factors: ExperienceRiskFactors;
  /** 风险摘要 */
  summary: string;
  /** 建议 */
  recommendations: string[];
  /** 预期体验质量 */
  expectedExperienceQuality: {
    score: number; // 0-1
    description: string;
  };
}

/**
 * 风险应对策略类型
 */
export type RiskMitigationStrategy = 'PREVENT' | 'MITIGATE' | 'ACCEPT' | 'TRANSFER' | 'AVOID';

/**
 * 风险应对措施
 */
export interface RiskMitigationMeasure {
  /** 策略类型 */
  strategy: RiskMitigationStrategy;
  /** 措施描述 */
  description: string;
  /** 具体行动 */
  actions: string[];
  /** 预期效果 */
  expectedEffect: string;
  /** 实施难度 */
  implementationDifficulty: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 成本影响 */
  costImpact: number; // CNY
}

/**
 * 风险应对策略矩阵
 */
export interface RiskMitigationMatrix {
  /** 风险类别 */
  riskCategory: RiskCategory;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 推荐的应对策略 */
  recommendedStrategies: RiskMitigationStrategy[];
  /** 具体应对措施 */
  measures: RiskMitigationMeasure[];
  /** 优先级 */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 综合风险评估结果
 */
export interface ComprehensiveRiskAssessment {
  /** 安全风险 */
  safety: {
    level: RiskLevel;
    score: number;
    details: string[];
  };
  /** 体力风险 */
  physical: {
    level: RiskLevel;
    score: number;
    details: string[];
  };
  /** 时间风险 */
  time: {
    level: RiskLevel;
    score: number;
    details: string[];
  };
  /** 体验风险 */
  experience: ExperienceRiskAssessment;
  /** 成本风险 */
  cost: CostRiskAssessment;
  /** 总体风险等级 */
  overallLevel: RiskLevel;
  /** 总体风险评分（0-1） */
  overallScore: number;
  /** 风险应对策略矩阵 */
  mitigationMatrix: RiskMitigationMatrix[];
  /** 风险摘要（格式化） */
  formattedSummary: string;
}
