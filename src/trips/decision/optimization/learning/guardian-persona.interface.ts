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
