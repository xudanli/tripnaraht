// src/trips/decision/interfaces/decision-support.interface.ts

/**
 * 决策支持接口定义
 * 
 * 核心原则：呈现选项而非推荐
 */

// Note: RouteDirectionData is imported where needed to avoid circular dependencies

/**
 * 路线选项
 */
export interface RouteOption {
  /** 路线ID */
  routeId: string | number;
  /** 路线名称 */
  routeName: string;
  /** 系统分析 */
  systemAnalysis: SystemAnalysis;
  /** 元数据 */
  metadata?: {
    countryCode?: string;
    tags?: string[];
    [key: string]: any;
  };
}

/**
 * 系统分析
 */
export interface SystemAnalysis {
  /** 路线特征 */
  characteristics: {
    distance?: number;
    elevationGain?: number;
    estimatedDuration?: number;
    difficultyLevel: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
    seasonSuitability: 'BEST' | 'GOOD' | 'ACCEPTABLE' | 'NOT_RECOMMENDED';
    experienceTypes: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  /** 匹配度分析 */
  matchingAnalysis: {
    fitnessMatch: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW';
    timeMatch: 'SUFFICIENT' | 'TIGHT' | 'INSUFFICIENT';
    experienceMatch: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW';
    costMatch: 'WITHIN' | 'SLIGHTLY_OVER' | 'OVER' | 'BELOW';
  };
  /** 风险评估 */
  riskAssessment: {
    safetyRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    physicalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    timeRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

/**
 * 路线对比
 */
export interface RouteComparison {
  /** 对比维度 */
  dimensions: Array<{
    name: string;
    values: Record<string, string | number>;
  }>;
  /** 对比说明 */
  comparisonNote: string;
}

/**
 * 决策选项
 */
export interface DecisionOptions {
  /** 选项列表 */
  options: RouteOption[];
  /** 对比信息 */
  comparison: RouteComparison;
  /** 用户指导 */
  userGuidance?: string | {
    message?: string;
    considerations?: string[];
    [key: string]: any;
  };
}

/**
 * 用户需求项
 */
export interface UserWantItem {
  /** 需求项 */
  item: string;
  /** 匹配状态 */
  matchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH';
  /** 说明 */
  explanation?: string;
}

/**
 * 用户需求
 */
export interface UserWant {
  /** 需求项列表 */
  items: UserWantItem[];
  /** 匹配状态（整体） */
  matchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH' | Record<string, 'MATCH' | 'PARTIAL' | 'MISMATCH'>;
}

/**
 * 用户担忧项
 */
export interface UserConcernItem {
  /** 担忧项 */
  item: string;
  /** 处理状态 */
  addressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED';
  /** 说明 */
  explanation?: string;
}

/**
 * 用户担忧
 */
export interface UserConcern {
  /** 担忧项列表 */
  items: UserConcernItem[];
  /** 处理状态（整体） */
  addressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED' | Record<string, 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED'>;
}

/**
 * 匹配度分析
 */
export interface MatchingAnalysis {
  /** 用户需求 */
  whatYouWant: {
    items: UserWantItem[];
    matchStatus: 'MATCH' | 'PARTIAL' | 'MISMATCH' | Record<string, 'MATCH' | 'PARTIAL' | 'MISMATCH'>;
  };
  /** 用户担忧 */
  yourConcerns: {
    items: UserConcernItem[];
    addressStatus: 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED' | Record<string, 'ADDRESSED' | 'PARTIAL' | 'NOT_ADDRESSED'>;
  };
  /** 综合判断 */
  overallJudgment: {
    statement: string;
    factors?: string[];
    confidence: number;
  };
  /** 后续建议 */
  nextSteps: Array<{
    action: string;
    reason: string;
    optional?: boolean;
  }>;
}

/**
 * 节奏选项
 */
export interface RhythmOption {
  /** 节奏类型 */
  type: 'RELAXED' | 'NORMAL' | 'TIGHT';
  /** 节奏ID */
  rhythmId?: string;
  /** 节奏名称 */
  rhythmName?: string;
  /** 节奏描述 */
  description?: string;
  /** 特征 */
  characteristics?: Record<string, any>;
  /** 系统分析 */
  systemAnalysis?: {
    suitability: 'MATCH' | 'SLIGHTLY_ABOVE' | 'ABOVE' | 'BELOW';
    explanation?: string;
  };
}

/**
 * 节奏对比
 */
export interface RhythmComparison {
  /** 对比维度 */
  dimensions: Array<{
    name: string;
    values: Record<string, string | number>;
  }>;
  /** 对比说明 */
  comparisonNote: string;
}

/**
 * 条件化支持
 */
export interface ConditionalSupport {
  /** 条件化场景 */
  scenarios: ConditionalScenario[];
  /** 用户问题 */
  userQuestions?: string[];
  /** 系统回答 */
  systemAnswers?: string[];
}

/**
 * 条件化场景
 */
export interface ConditionalScenario {
  /** 场景ID */
  scenarioId?: string;
  /** 场景名称 */
  scenarioName?: string;
  /** 条件描述 */
  condition: string;
  /** 结果 */
  outcome?: string;
  /** 概率 */
  probability?: number;
  /** 说明 */
  explanation?: string;
  /** 建议 */
  suggestion?: string;
  /** 适用路线 */
  applicableRoutes?: string[];
}

/**
 * 决策界面
 */
export interface DecisionInterface {
  /** 路线选择 */
  routeSelection: {
    options: RouteOption[];
    comparison: RouteComparison;
  };
  /** 节奏选择 */
  rhythmSelection: {
    options: RhythmOption[];
    comparison: RhythmComparison;
  };
  /** 条件化支持 */
  conditionalSupport: ConditionalSupport;
}
