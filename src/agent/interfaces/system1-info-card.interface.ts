// src/agent/interfaces/system1-info-card.interface.ts

/**
 * System 1 信息卡片接口定义
 * 
 * 基于 AI_REASONING_SYSTEM_COMPLIANCE.md 的要求：
 * - System 1 不输出"推荐指数"，而是输出"基础信息卡片"
 * - 只呈现信息，不做推荐
 */

/**
 * 可靠性等级
 */
export type ReliabilityLevel = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * 匹配度等级
 */
export type MatchLevel =
  | 'MATCH'
  | 'SLIGHTLY_ABOVE'
  | 'ABOVE'
  | 'BELOW'
  | 'SUFFICIENT'
  | 'TIGHT'
  | 'INSUFFICIENT'
  | 'WITHIN'
  | 'SLIGHTLY_OVER'
  | 'OVER';

/**
 * 难度等级
 */
export type DifficultyLevel = 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';

/**
 * 风险等级
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 季节状态
 */
export type SeasonStatus = 'BEST' | 'GOOD' | 'ACCEPTABLE' | 'NOT_RECOMMENDED';

/**
 * 人流等级
 */
export type CrowdLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'VERY_HIGH';

/**
 * 当前条件
 */
export interface CurrentConditions {
  /** 天气条件 */
  weather: {
    /** 天气状况（晴朗、多云、降雨等） */
    condition: string;
    /** 温度范围（如"12-18°C"） */
    temperature: string;
    /** 可靠性 */
    reliability: ReliabilityLevel;
  };
  /** 人流情况 */
  crowd: {
    /** 人流等级 */
    level: CrowdLevel;
    /** 排队时间（分钟，可选） */
    queueTime?: number;
    /** 可靠性 */
    reliability: ReliabilityLevel;
  };
  /** 季节状态 */
  season: {
    /** 状态 */
    status: SeasonStatus;
    /** 可靠性 */
    reliability: ReliabilityLevel;
  };
  /** 交通情况 */
  transportation: {
    /** 是否可用 */
    available: boolean;
    /** 交通方式列表 */
    methods: string[];
    /** 可靠性 */
    reliability: ReliabilityLevel;
  };
}

/**
 * 匹配度信息（不是推荐，是信息）
 */
export interface YourMatch {
  /** 体力要求匹配度 */
  fitnessRequirement: {
    /** 相对于你的体力水平 */
    vsYourFitness: MatchLevel;
    /** 说明 */
    explanation: string;
  };
  /** 时间要求匹配度 */
  timeRequirement: {
    /** 相对于你的时间 */
    vsYourTime: MatchLevel;
    /** 说明 */
    explanation: string;
  };
  /** 难度要求匹配度 */
  difficultyRequirement: {
    /** 相对于你的经验 */
    vsYourExperience: MatchLevel;
    /** 说明 */
    explanation: string;
  };
  /** 成本要求匹配度 */
  costRequirement: {
    /** 相对于你的预算 */
    vsYourBudget: MatchLevel;
    /** 说明 */
    explanation: string;
  };
}

/**
 * 风险概览（信息呈现，非警告）
 */
export interface RiskOverview {
  /** 安全风险 */
  safetyRisk: RiskLevel;
  /** 体力风险 */
  physicalRisk: RiskLevel;
  /** 时间风险 */
  timeRisk: RiskLevel;
  /** 体验风险 */
  experienceRisk: RiskLevel;
  /** 成本风险 */
  costRisk: RiskLevel;
}

/**
 * System 1 信息卡片
 */
export interface System1InfoCard {
  /** 路线名称 */
  routeName: string;
  /** 距离（公里） */
  distance: number;
  /** 海拔爬升（米） */
  elevationGain: number;
  /** 预计时长（小时） */
  estimatedDuration: number;
  /** 难度等级 */
  difficultyLevel: DifficultyLevel;
  /** 当前条件 */
  currentConditions: CurrentConditions;
  /** 你的匹配度（不是推荐，是信息） */
  yourMatch: YourMatch;
  /** 风险概览（信息呈现，非警告） */
  riskOverview: RiskOverview;
  /** 总体（不是推荐，是信息总结） */
  summary: string;
  /** 路线ID（可选） */
  routeId?: string;
  /** 元数据（可选） */
  metadata?: Record<string, any>;
}

/**
 * System 1 结果（包含信息卡片）
 */
export interface System1Result {
  /** 是否成功 */
  success: boolean;
  /** 结果数据（信息卡片或其他结构化数据） */
  result: System1InfoCard | any;
  /** 答案文本（System 1不再返回文本回答，保留用于兼容） */
  answerText: string | null;
  /** 卡片类型 */
  cardType?: 'INFO_CARD' | 'API_RESULT' | 'RAG_RESULT';
}
