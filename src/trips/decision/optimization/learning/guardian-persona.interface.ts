// src/trips/decision/optimization/learning/guardian-persona.interface.ts
/**
 * Guardian 人格接口定义
 * 
 * Phase 3 核心：将 Abu/Dre/Neptune 从"策略模块"升级为"推理人格"
 * 
 * 三种人格本质：
 * - Abu: 风险最小化人格（Risk Minimizer）
 * - Dre: 资源调度人格（Resource Scheduler）
 * - Neptune: 结构守恒人格（Structure Conservator）
 * 
 * 这三种人格可以：
 * - 独立评估计划
 * - 相互辩论
 * - 协商投票
 */

import { RoutePlanDraft, WorldModelContext } from '../../shared/world-model.types';
import { ObjectiveEvaluationResult, ObjectiveFunctionWeights } from '../objective-function.interface';

/**
 * Guardian 人格类型
 */
export type GuardianPersonaType = 'ABU' | 'DRE' | 'NEPTUNE';

/**
 * 人格核心价值观
 */
export interface PersonaValues {
  /** 人格类型 */
  persona: GuardianPersonaType;
  
  /** 核心目标 */
  coreObjective: string;
  
  /** 优先考虑的维度 */
  priorityDimensions: (keyof ObjectiveFunctionWeights)[];
  
  /** 权重偏好（相对于默认权重的调整） */
  weightBias: Partial<ObjectiveFunctionWeights>;
  
  /** 风险容忍度 */
  riskTolerance: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  
  /** 决策风格 */
  decisionStyle: 'ANALYTICAL' | 'INTUITIVE' | 'BALANCED';
}

/**
 * Abu 的核心价值观
 */
export const ABU_VALUES: PersonaValues = {
  persona: 'ABU',
  coreObjective: '确保旅行者安全，最小化不可接受的风险',
  priorityDimensions: ['safety', 'weatherRisk', 'fatigueRisk'],
  weightBias: {
    safety: 0.35,         // 提高安全权重
    weatherRisk: 0.10,    // 提高天气风险权重
    experienceDensity: -0.05, // 降低体验密度权重（安全优先）
  },
  riskTolerance: 'CONSERVATIVE',
  decisionStyle: 'ANALYTICAL',
};

/**
 * Dre 的核心价值观
 */
export const DRE_VALUES: PersonaValues = {
  persona: 'DRE',
  coreObjective: '优化时间和体力分配，确保可持续的节奏',
  priorityDimensions: ['fatigueRisk', 'pacingVariance', 'timeSlack'],
  weightBias: {
    fatigueRisk: 0.25,    // 提高疲劳风险权重
    pacingVariance: 0.15, // 提高节奏方差权重
    timeSlack: 0.10,      // 提高时间余量权重
    experienceDensity: -0.05, // 略降体验密度
  },
  riskTolerance: 'MODERATE',
  decisionStyle: 'BALANCED',
};

/**
 * Neptune 的核心价值观
 */
export const NEPTUNE_VALUES: PersonaValues = {
  persona: 'NEPTUNE',
  coreObjective: '守护路线哲学，保持旅行体验的完整性和意义',
  priorityDimensions: ['philosophyAlignment', 'experienceDensity'],
  weightBias: {
    philosophyAlignment: 0.25, // 提高哲学匹配权重
    experienceDensity: 0.15,   // 提高体验密度权重
    safety: -0.05,             // 略降安全权重（接受一定风险换取体验）
  },
  riskTolerance: 'MODERATE',
  decisionStyle: 'INTUITIVE',
};

/**
 * 人格评估结果
 */
export interface PersonaEvaluation {
  /** 人格类型 */
  persona: GuardianPersonaType;
  
  /** 基于人格价值观的效用评估 */
  utility: number;
  
  /** 核心关注点 */
  primaryConcerns: string[];
  
  /** 支持的方面 */
  positiveAspects: string[];
  
  /** 建议的调整 */
  suggestedAdjustments: string[];
  
  /** 对计划的立场 */
  stance: 'STRONG_SUPPORT' | 'SUPPORT' | 'NEUTRAL' | 'CONCERN' | 'STRONG_OPPOSE';
  
  /** 置信度 */
  confidence: number;
  
  /** 详细理由 */
  reasoning: string;
}

/**
 * 辩论论点
 */
export interface DebateArgument {
  /** 提出论点的人格 */
  fromPersona: GuardianPersonaType;
  
  /** 论点类型 */
  type: 'SUPPORT' | 'OPPOSE' | 'CONDITIONAL' | 'QUESTION';
  
  /** 论点内容 */
  content: string;
  
  /** 论点强度 (0-1) */
  strength: number;
  
  /** 支撑证据 */
  evidence: string[];
  
  /** 目标人格（如果是回应） */
  targetPersona?: GuardianPersonaType;
  
  /** 回应的论点 ID（如果是回应） */
  inResponseTo?: string;
}

/**
 * 辩论轮次
 */
export interface DebateRound {
  /** 轮次编号 */
  roundNumber: number;
  
  /** 本轮论点 */
  arguments: DebateArgument[];
  
  /** 本轮后的共识度变化 */
  consensusShift: number;
  
  /** 本轮关键分歧 */
  keyDisagreements: string[];
}

/**
 * 投票结果
 */
export interface VoteResult {
  /** 人格 */
  persona: GuardianPersonaType;
  
  /** 投票：赞成/反对/弃权 */
  vote: 'APPROVE' | 'REJECT' | 'ABSTAIN';
  
  /** 投票权重（基于领域相关性） */
  weight: number;
  
  /** 投票理由 */
  rationale: string;
  
  /** 附加条件（如果投票通过） */
  conditions?: string[];
}

/**
 * 协商结果
 */
export interface NegotiationResult {
  /** 最终决定 */
  decision: 'APPROVE' | 'REJECT' | 'CONDITIONAL_APPROVE' | 'REQUIRES_HUMAN';
  
  /** 各人格评估 */
  evaluations: PersonaEvaluation[];
  
  /** 辩论记录 */
  debateRounds: DebateRound[];
  
  /** 投票结果 */
  votes: VoteResult[];
  
  /** 最终共识度 (0-1) */
  consensusLevel: number;
  
  /** 达成共识的关键权衡 */
  keyTradeoffs: string[];
  
  /** 条件（如果是条件通过） */
  conditions?: string[];
  
  /** 需要人类判断的问题（如果需要人类介入） */
  humanDecisionPoints?: string[];
  
  /** TDFPM 疲劳预测（按天） */
  fatiguePrediction?: Array<{
    dayIndex: number;
    fatigueScore: number;
    riskLevel: string;
    recommendation: string;
    confidence?: number;
  }>;
  
  /** 协商摘要 */
  summary: string;
}

/**
 * Guardian 人格接口
 */
export interface IGuardianPersona {
  /** 人格类型 */
  readonly personaType: GuardianPersonaType;
  
  /** 人格价值观 */
  readonly values: PersonaValues;
  
  /**
   * 评估计划
   */
  evaluate(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    baseEvaluation: ObjectiveEvaluationResult
  ): PersonaEvaluation;
  
  /**
   * 生成辩论论点
   */
  generateArgument(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    otherEvaluations: PersonaEvaluation[],
    previousArguments: DebateArgument[]
  ): DebateArgument;
  
  /**
   * 回应其他人格的论点
   */
  respondToArgument(
    argument: DebateArgument,
    plan: RoutePlanDraft,
    world: WorldModelContext
  ): DebateArgument | null;
  
  /**
   * 投票
   */
  vote(
    plan: RoutePlanDraft,
    world: WorldModelContext,
    debateHistory: DebateRound[],
    ownEvaluation: PersonaEvaluation
  ): VoteResult;
}

/**
 * 协商配置
 */
export interface NegotiationConfig {
  /** 最大辩论轮数 */
  maxDebateRounds: number;
  
  /** 共识阈值（达到此值提前结束辩论） */
  consensusThreshold: number;
  
  /** 是否需要一致同意 */
  requireUnanimity: boolean;
  
  /** 投票权重模式 */
  votingWeightMode: 'EQUAL' | 'DOMAIN_BASED' | 'CONFIDENCE_BASED';
  
  /** 是否允许条件通过 */
  allowConditionalApproval: boolean;
  
  /** 人类介入阈值（分歧超过此值需要人类判断） */
  humanInterventionThreshold: number;
}

/**
 * 默认协商配置
 */
export const DEFAULT_NEGOTIATION_CONFIG: NegotiationConfig = {
  maxDebateRounds: 3,
  consensusThreshold: 0.8,
  requireUnanimity: false,
  votingWeightMode: 'DOMAIN_BASED',
  allowConditionalApproval: true,
  humanInterventionThreshold: 0.4,
};

/**
 * 驾驶时间估算配置（可配置，非硬编码）
 * 通过 GUARDIAN_DRIVING_SPEED_KMH 环境变量覆盖默认值
 */
export const DRIVING_ESTIMATION_CONFIG = {
  /** 默认平均车速 km/h（混合路况） */
  defaultSpeedKmH: Number(process.env.GUARDIAN_DRIVING_SPEED_KMH) || 50,
  /** 道路类型关键词 → 车速 km/h（从 world.routeDirection.metadata 推断时使用） */
  roadTypeSpeedMap: {
    gravel: 35,
    '砂石': 35,
    highway: 70,
    '高速': 70,
    'motorway': 70,
    paved: 55,
    '柏油': 55,
  } as Record<string, number>,
};

/**
 * 道路类型 → 驾驶强度系数（TDFPM Intensity）
 * 用于 DrivingLoad = DrivingHours × Intensity
 */
export const ROAD_INTENSITY_MAP: Record<string, number> = {
  highway: 1.0,
  '高速': 1.0,
  motorway: 1.0,
  paved: 1.2,
  '柏油': 1.2,
  gravel: 1.8,
  '砂石': 1.8,
  'F路': 1.8,
  '山路': 1.8,
  // 可扩展：city_traffic: 1.5, extreme_weather: 2.2
};

/**
 * 道路类型 → 疲劳系数（RoadFactor）
 * 路况越复杂，安全驾驶能力下降
 */
export const ROAD_FATIGUE_FACTOR_MAP: Record<string, number> = {
  highway: 1.0,
  '高速': 1.0,
  motorway: 1.0,
  paved: 0.9,
  '柏油': 0.9,
  gravel: 0.75,
  '砂石': 0.75,
  'F路': 0.75,
  '山路': 0.75,
};

/**
 * 驾驶疲劳与安全模型（基于人体工效学与 2-15-8 法则）
 *
 * 参考标准：
 * - 普通人安全驾驶上限 ≈ 8h/天，超过 10h 事故率明显上升
 * - TripNara：超过 6h 应提示「今日行程偏紧，建议拆分」
 * - 2-15-8 法则：每 2h 一停、15min 休息、8h 上限
 *
 * 疲劳公式：DrivingCapacity = Base × SleepFactor × RoadFactor × BreakFactor × StressFactor × AgeFactor
 * 当缺少 Sleep/Break/Stress 数据时，使用默认 1.0
 */
export const DRIVING_SAFETY_CONFIG = {
  /** 基础安全驾驶能力 h */
  baseSafeHours: 8,
  /** 建议拆分比例（effectiveSafeHours × 0.75，默认 6h） */
  warningRatio: 0.75,
  /** 危险区比例（effectiveSafeHours × 1.25，默认 10h） */
  dangerRatio: 1.25,
  /** 物理极限 h（纯驾驶时间超过此值单日无法完成） */
  physicalLimitHours: 24,
};
