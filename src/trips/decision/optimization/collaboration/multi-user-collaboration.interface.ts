// src/trips/decision/optimization/collaboration/multi-user-collaboration.interface.ts
/**
 * 多用户协同接口
 * 
 * 中期功能：支持家庭/团队的协同决策
 * 
 * 核心场景：
 * 1. 家庭出行（不同体能、不同偏好）
 * 2. 团队探险（领队 + 队员）
 * 3. 混合能力组（老人 + 儿童 + 成人）
 */

import { ObjectiveFunctionWeights } from '../objective-function.interface';
import { PersonaEvaluation, NegotiationResult } from '../learning/guardian-persona.interface';

/**
 * 用户角色
 */
export type UserRole = 'LEADER' | 'MEMBER' | 'OBSERVER';

/**
 * 决策权重模式
 */
export type DecisionWeightMode = 
  | 'EQUAL'           // 平等投票
  | 'LEADER_PRIORITY' // 领队优先
  | 'CAPABILITY_BASED' // 基于能力（最弱者优先）
  | 'EXPERIENCE_BASED' // 基于经验
  | 'CUSTOM';         // 自定义

/**
 * 团队成员
 */
export interface TeamMember {
  /** 用户 ID */
  userId: string;
  
  /** 显示名称 */
  displayName: string;
  
  /** 角色 */
  role: UserRole;
  
  /** 决策权重 (0-1) */
  decisionWeight: number;
  
  /** 体能等级 */
  fitnessLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  
  /** 经验等级 */
  experienceLevel: 'NOVICE' | 'SOME_EXPERIENCE' | 'EXPERIENCED' | 'EXPERT';
  
  /** 个人权重偏好 */
  personalWeights: ObjectiveFunctionWeights;
  
  /** 特殊约束 */
  specialConstraints?: {
    /** 最大日爬升 */
    maxDailyAscentM?: number;
    /** 最大日行程时间 */
    maxDailyHours?: number;
    /** 海拔限制 */
    altitudeLimit?: number;
    /** 必需休息频率 */
    restFrequency?: 'LOW' | 'MEDIUM' | 'HIGH';
    /** 特殊需求 */
    specialNeeds?: string[];
  };
  
  /** 加入时间 */
  joinedAt: string;
}

/**
 * 团队配置
 */
export interface TeamConfig {
  /** 团队 ID */
  teamId: string;
  
  /** 团队名称 */
  name: string;
  
  /** 团队类型 */
  type: 'FAMILY' | 'FRIENDS' | 'EXPEDITION' | 'TOUR_GROUP' | 'CUSTOM';
  
  /** 决策权重模式 */
  decisionWeightMode: DecisionWeightMode;
  
  /** 成员列表 */
  members: TeamMember[];
  
  /** 团队级约束（优先于个人） */
  teamConstraints: {
    /** 使用最保守成员的约束 */
    useWeakestLink: boolean;
    /** 最大可接受分歧度 */
    maxAcceptableDisagreement: number;
    /** 需要一致同意的决策类型 */
    unanimityRequired: string[];
  };
  
  /** 创建时间 */
  createdAt: string;
  
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 成员评估结果
 */
export interface MemberEvaluation {
  /** 成员 ID */
  memberId: string;
  
  /** 成员名称 */
  memberName: string;
  
  /** 个人效用评估 */
  personalUtility: number;
  
  /** 对计划的立场 */
  stance: 'APPROVE' | 'CONCERN' | 'REJECT';
  
  /** 主要关注点 */
  concerns: string[];
  
  /** 建议调整 */
  suggestions: string[];
  
  /** 风险评估 */
  riskAssessment: {
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    fatigueRisk: number;
    safetyRisk: number;
    enjoymentRisk: number;
  };
  
  /** 特殊警告 */
  warnings?: string[];
}

/**
 * 团队冲突
 */
export interface TeamConflict {
  /** 冲突 ID */
  conflictId: string;
  
  /** 冲突类型 */
  type: 'CAPABILITY_MISMATCH' | 'PREFERENCE_CONFLICT' | 'CONSTRAINT_VIOLATION' | 'PACE_DISAGREEMENT';
  
  /** 涉及成员 */
  involvedMembers: string[];
  
  /** 冲突描述 */
  description: string;
  
  /** 严重程度 */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  /** 可能的解决方案 */
  possibleResolutions: Array<{
    id: string;
    description: string;
    impact: string;
    acceptability: number;
  }>;
}

/**
 * 团队协商结果
 */
export interface TeamNegotiationResult {
  /** 团队决策 */
  decision: 'APPROVE' | 'REJECT' | 'CONDITIONAL_APPROVE' | 'SPLIT_REQUIRED' | 'REQUIRES_DISCUSSION';
  
  /** 共识水平 */
  consensusLevel: number;
  
  /** 各成员评估 */
  memberEvaluations: MemberEvaluation[];
  
  /** 团队综合权重 */
  teamWeights: ObjectiveFunctionWeights;
  
  /** 团队综合效用 */
  teamUtility: number;
  
  /** 检测到的冲突 */
  conflicts: TeamConflict[];
  
  /** 推荐的计划调整 */
  recommendedAdjustments: Array<{
    type: string;
    description: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    beneficiaries: string[];
  }>;
  
  /** 分组建议（如果需要分开行动） */
  splitSuggestion?: {
    needed: boolean;
    reason: string;
    groups: Array<{
      groupId: string;
      members: string[];
      adjustedPlan: string;
    }>;
  };
  
  /** 需要人工决策的点 */
  humanDecisionPoints: Array<{
    id: string;
    question: string;
    options: string[];
    recommendation: string;
  }>;
  
  /** 摘要 */
  summary: string;
}

/**
 * 团队协同服务接口
 */
export interface ITeamCollaborationService {
  /**
   * 创建团队
   */
  createTeam(config: Omit<TeamConfig, 'teamId' | 'createdAt' | 'updatedAt'>): Promise<TeamConfig>;
  
  /**
   * 添加成员
   */
  addMember(teamId: string, member: Omit<TeamMember, 'joinedAt'>): Promise<TeamConfig>;
  
  /**
   * 移除成员
   */
  removeMember(teamId: string, userId: string): Promise<TeamConfig>;
  
  /**
   * 计算团队综合权重
   */
  calculateTeamWeights(team: TeamConfig): ObjectiveFunctionWeights;
  
  /**
   * 计算团队综合约束
   */
  calculateTeamConstraints(team: TeamConfig): TeamMember['specialConstraints'];
  
  /**
   * 团队协商
   */
  negotiateAsTeam(
    teamId: string,
    plan: any,
    world: any,
  ): Promise<TeamNegotiationResult>;
  
  /**
   * 检测冲突
   */
  detectConflicts(team: TeamConfig, memberEvaluations: MemberEvaluation[]): TeamConflict[];
  
  /**
   * 生成分组建议
   */
  generateSplitSuggestion(
    team: TeamConfig,
    conflicts: TeamConflict[],
  ): TeamNegotiationResult['splitSuggestion'];
}
