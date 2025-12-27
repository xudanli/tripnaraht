// src/trips/decision/interfaces/weather-decision-evidence.interface.ts
/**
 * 🌪️ WeatherDecisionEvidence（一级否决者）
 * 
 * 天气决策证据系统
 * 这是 Agent 和普通行程规划器的断代差距
 */

/**
 * 天气违规类型
 */
export type WeatherViolationType = 'HARD' | 'SOFT' | 'NONE';

/**
 * 天气决策证据
 */
export interface WeatherDecisionEvidence {
  /** 路段 ID */
  segmentId: string;
  /** 日期 */
  date: string;
  /** 风速（m/s） */
  windSpeed: number;
  /** 风向（度） */
  windDirection: number;
  /** 降水量（mm） */
  precipitation: number;
  /** 能见度（km） */
  visibility: number;
  /** 温度下降（°C） */
  temperatureDrop: number;
  /** 侧风风险 */
  crosswindRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** 违规类型 */
  violation: WeatherViolationType;
  /** 解释 */
  explanation: string;
  /** 建议行动 */
  suggestedAction?: 'DELAY' | 'REROUTE' | 'CANCEL' | 'PROCEED';
  /** 元数据 */
  metadata?: {
    /** 天气窗口可用性 */
    weatherWindowAvailable?: boolean;
    /** 预测可靠性 */
    forecastReliability?: 'HIGH' | 'MEDIUM' | 'LOW';
    /** 历史风险数据 */
    historicalRiskLevel?: 'HIGH' | 'MEDIUM' | 'LOW';
  };
}

/**
 * 天气决策管道结果
 */
export interface WeatherEvidencePipelineResult {
  /** 路段证据列表 */
  segmentEvidences: WeatherDecisionEvidence[];
  /** 是否有硬违规 */
  hasHardViolation: boolean;
  /** 是否有软违规 */
  hasSoftViolation: boolean;
  /** 是否可以通过 */
  canProceed: boolean;
  /** 可解释的失败原因 */
  explainableFailure?: {
    reason: string;
    affectedDays: number[];
    userImpact: string;
  };
}

/**
 * 天气决策规则
 */
export interface WeatherDecisionRules {
  /** 最大允许风速（m/s） */
  maxWindSpeed?: number;
  /** 侧风最大允许风速（m/s） */
  maxCrosswindSpeed?: number;
  /** 最大允许降水量（mm/day） */
  maxPrecipitation?: number;
  /** 最小能见度（km） */
  minVisibility?: number;
  /** 最大温度下降（°C） */
  maxTemperatureDrop?: number;
  /** 是否要求天气窗口 */
  weatherWindowRequired?: boolean;
}

