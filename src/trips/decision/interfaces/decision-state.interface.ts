// src/trips/decision/interfaces/decision-state.interface.ts

/**
 * 决策状态接口定义
 * 
 * 用于追踪决策完成度和功能禁用状态
 */

/**
 * 决策阶段
 */
export type DecisionStage =
  | 'INTENTION'      // 意图阶段
  | 'EXPLORATION'    // 探索阶段
  | 'EVALUATION'     // 评估阶段
  | 'CONFIRMATION'   // 确认阶段
  | 'EXECUTION';     // 执行阶段

/**
 * 决策完成步骤
 */
export interface DecisionSteps {
  /** 路线选择 */
  routeSelection: boolean;
  /** 节奏选择 */
  rhythmSelection: boolean;
  /** 风险确认 */
  riskAcknowledgment: boolean;
  /** 最终确认 */
  finalConfirmation: boolean;
}

/**
 * 功能禁用标志
 */
export interface FeaturesDisabled {
  /** 决策完成前禁用预订 */
  booking: boolean;
  /** 决策完成前禁用购买 */
  purchase: boolean;
  /** 决策完成前禁用执行 */
  execution: boolean;
}

/**
 * 决策状态
 */
export interface DecisionState {
  /** Trip ID */
  tripId: string;
  /** User ID */
  userId: string;
  /** 决策完成状态 */
  decisionCompleted: boolean;
  /** 决策完成时间 */
  decisionCompletedAt?: Date;
  /** 决策完成度（0-100） */
  decisionCompletionPercentage: number;
  /** 当前决策阶段 */
  currentStage: DecisionStage;
  /** 决策完成度追踪 */
  completedSteps: DecisionSteps;
  /** 功能禁用标志 */
  featuresDisabled: FeaturesDisabled;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 决策状态更新请求
 */
export interface DecisionStateUpdateRequest {
  /** 要更新的步骤 */
  step?: keyof DecisionSteps;
  /** 新的阶段 */
  stage?: DecisionStage;
  /** 是否完成决策 */
  decisionCompleted?: boolean;
  /** 元数据 */
  metadata?: Record<string, any>;
}
