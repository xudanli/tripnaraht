// Round 3: Self-Evolution Architecture Type Definitions
// 自进化架构类型定义

/**
 * 决策节点类型 - 用于 Shapley 归因
 */
export enum DecisionNodeType {
  DESTINATION = 'destination', // 目的地选择
  COMPANION = 'companion', // 搭子匹配
  BUDGET = 'budget', // 预算设定
  ITINERARY = 'itinerary', // 行程规划
  TIMING = 'timing', // 时间安排
  TRANSPORTATION = 'transportation', // 交通方式
  ACCOMMODATION = 'accommodation', // 住宿选择
  ACTIVITIES = 'activities', // 活动选择
  WEATHER_LUCK = 'weather_luck', // 天气运气
  EXTERNAL_FACTOR = 'external_factor', // 外部因素
}

/**
 * 决策节点 - Shapley Value 计算的基本单元
 */
export interface DecisionNode {
  id: string;
  type: DecisionNodeType;
  name: string;
  value: any; // 节点的具体值
  contribution?: number; // Shapley Value 贡献分数
}

/**
 * Shapley 归因结果
 */
export interface ShapleyAttribution {
  nodeId: string;
  nodeName: string;
  nodeType: DecisionNodeType;
  shapleyValue: number; // 贡献分数 (0-1)
  rank: number; // 排名
  confidence: number; // 置信度
  marginalContribution?: number; // 边际贡献
}

/**
 * 6 维 Trip Outcome Score
 */
export interface TripOutcomeDimensions {
  // 整体满意度 (权重 0.25)
  overallSatisfaction: {
    cognitiveEvaluation: number; // 认知评价
    positiveActivation: number; // 正向激活
    negativeActivation: number; // 负向激活
    score: number; // 综合分数
  };
  // 搭子关系满意度 (权重 0.20)
  companionSatisfaction: {
    willingnessToTravelAgain: number; // 愿意再次同行
    groupDynamics: number; // 群组动态
    score: number;
  };
  // 预算准确度 (权重 0.15)
  budgetAccuracy: {
    deviation: number; // 偏差百分比
    score: number; // 分数 (偏差越小分数越高)
  };
  // 行程完成质量 (权重 0.15)
  completionQuality: {
    p0CompletionRate: number; // P0 POI 完成率
    p1CompletionRate: number; // P1 POI 完成率
    depthVsBreadth: number; // 深度 vs 广度
    score: number;
  };
  // 安全/无事故 (权重 0.15)
  safety: {
    hasAccidents: boolean;
    stressEventCount: number;
    score: number;
  };
  // 复购/推荐意愿 (权重 0.10)
  repurchase: {
    nps: number; // NPS 分数
    recommendation: number; // 推荐意愿
    score: number;
  };
}

/**
 * 期望差距
 */
export interface ExpectationGap {
  preTripExpectation: number; // 旅行前期望 (0-10)
  postTripSatisfaction: number; // 旅行后满意度 (0-10)
  gap: number; // 差距 (正数=超出预期，负数=低于预期)
  referencePoints: {
    pastExperience: number; // 过往经验参考
    companionExpectation: number; // 同行者期望
    preTripExpectation: number; // 旅行前预期
  };
}

/**
 * 群组聚合策略
 */
export enum GroupAggregationStrategy {
  AVERAGE = 'average', // 简单平均
  LEAST_MISERY = 'least_misery', // 最小痛苦
  WEIGHTED_LEAST_MISERY = 'weighted_least_misery', // 加权最小痛苦
  SEQUENTIAL_FAIRNESS = 'sequential_fairness', // 序列公平
}

/**
 * 群组聚合结果
 */
export interface GroupAggregationResult {
  strategy: GroupAggregationStrategy;
  individualScores: Map<string, number>; // 个人满意度分数
  aggregatedScore: number; // 聚合后分数
  fairnessWeights: Map<string, number>; // 公平性权重
  satisfiedMembers: string[]; // 满意的成员
  unsatisfiedMembers: string[]; // 不满意的成员
  lmsThreshold: number; // LMS 阈值
}

/**
 * 记忆类型
 */
export enum MemoryType {
  EPISODIC = 'episodic', // 情景记忆
  SEMANTIC = 'semantic', // 语义记忆
}

/**
 * 情景记忆
 */
export interface EpisodicMemory {
  id: string;
  userId: string;
  tripId: string;
  type: MemoryType.EPISODIC;
  content: string; // 自然语言摘要
  embedding: number[]; // 向量嵌入
  activationScore: number; // ACT-R 激活度
  lastAccessedAt: Date;
  accessHistory: Date[]; // 访问历史
  seasonalityFactor: {
    season: string;
    activation: number;
  };
  socialCorrection: {
    companionId: string;
    correctionFactor: number;
  }[];
  confidence: number;
  metadata: {
    attribution: ShapleyAttribution[];
    outcome: TripOutcomeDimensions;
    timestamp: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 语义记忆
 */
export interface SemanticMemory {
  id: string;
  userId: string;
  type: MemoryType.SEMANTIC;
  content: string; // 抽象模式总结
  embedding: number[];
  activationScore: number;
  lastAccessedAt: Date;
  accessHistory: Date[];
  confidence: number;
  sourceMemoryIds: string[]; // 源情景记忆 ID
  metadata: {
    pattern: string;
    frequency: number;
    lastConfirmed: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ACT-R 衰减参数
 */
export interface ActrDecayParams {
  d: number; // 衰减参数 (典型值 0.5)
  baseActivation: number; // 基础激活度
  eventTriggerReset: boolean; // 是否启用事件触发重置
  seasonalReinforcement: boolean; // 是否启用季节性强化
  socialCorrection: boolean; // 是否启用社交修正
}

/**
 * 生活事件类型（触发记忆重置）
 */
export enum LifeEventType {
  MARRIAGE = 'marriage',
  CHILDBIRTH = 'childbirth',
  RETIREMENT = 'retirement',
  RELOCATION = 'relocation',
  CAREER_CHANGE = 'career_change',
}

/**
 * 校准曲线
 */
export interface CalibrationCurve {
  predictions: number[]; // 预测值
  actuals: number[]; // 实际值
  calibrated: number[]; // 校准后的值
  temperature: number; // 温度缩放参数
  accuracy: number; // 准确度
}

/**
 * 兼容性维度（10 维）
 */
export enum CompatibilityDimension {
  BUDGET = 'budget', // 预算与消费风格
  TRAVEL_PACE = 'travel_pace', // 旅行节奏
  INTERACTION_MODE = 'interaction_mode', // 交互模式
  SKILL_REQUIREMENT = 'skill_requirement', // 技能需求
  RISK_TOLERANCE = 'risk_tolerance', // 风险容忍度
  SOCIAL_STYLE = 'social_style', // 社交风格
  TEAM_BALANCE = 'team_balance', // 团队平衡
  PAST_COLLABORATION = 'past_collaboration', // 过往合作
  REPUTATION_SCORE = 'reputation_score', // 信用评分
  MBTI_COMPATIBILITY = 'mbti_compatibility', // MBTI 兼容性
}

/**
 * 分维度校准结果
 */
export interface DimensionCalibration {
  dimension: CompatibilityDimension;
  curve: CalibrationCurve;
  accuracy: number;
  needsRetraining: boolean;
}

/**
 * 搭子校准记录
 */
export interface CompanionCalibrationRecord {
  id: string;
  postId: string;
  applicationId: string;
  preTripPrediction: number; // 0-1
  postTripSatisfaction: number; // 0-1
  calibrationCurve: CalibrationCurve;
  dimensionScores: Map<CompatibilityDimension, DimensionCalibration>;
  calibrationAccuracy: number;
  needsRetraining: boolean;
  tripId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 冷启动阶段
 */
export enum ColdStartPhase {
  QUESTIONNAIRE = 'questionnaire', // 问卷阶段 (0 次)
  HEURISTIC = 'heuristic', // 启发式归因 (1-4 次)
  OFFLINE_SHAPLEY = 'offline_shapley', // 离线 Shapley (5-9 次)
  REALTIME_CALIBRATION = 'realtime_calibration', // 实时归因 + 校准 (10+ 次)
}

/**
 * 冷启动策略配置
 */
export interface ColdStartConfig {
  questionnaireThreshold: number; // 问卷阈值 (0)
  heuristicThreshold: number; // 启发式阈值 (5)
  offlineShapleyThreshold: number; // 离线 Shapley 阈值 (10)
  realtimeThreshold: number; // 实时阈值 (11)
}

/**
 * 学习信号
 */
export interface LearningSignal {
  tripId: string;
  userId: string;
  attribution: ShapleyAttribution[];
  outcome: TripOutcomeDimensions;
  expectationGap: ExpectationGap;
  memorySnapshot: {
    episodic: EpisodicMemory[];
    semantic: SemanticMemory[];
  };
  calibration: CompanionCalibrationRecord[];
  confidence: number;
  timestamp: Date;
}

/**
 * 自进化闭环状态
 */
export interface SelfEvolutionState {
  userId: string;
  tripCount: number;
  coldStartPhase: ColdStartPhase;
  learningSignals: LearningSignal[];
  attributionAccuracy: number;
  calibrationAccuracy: number;
  memoryQuality: number;
  lastUpdatedAt: Date;
}
