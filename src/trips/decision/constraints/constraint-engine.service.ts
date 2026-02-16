// src/trips/decision/constraints/constraint-engine.service.ts

/**
 * Constraint Engine - 决策空间剪枝器
 *
 * Phase 0 交付物：isFeasible(plan) 统一入口
 *
 * 设计原则（EXPECTED_UTILITY_AND_CONSTRAINT_ENGINE_DESIGN.md）：
 * - 硬约束违规 → 方案直接淘汰，不进入 ExpectedUtility 评分
 * - LLM 不负责判断可行性，工程负责可行性
 */

import { Injectable, Optional } from '@nestjs/common';
import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
import {
  ConstraintChecker,
  ConstraintCheckResult,
  CheckerViolation,
  InfeasibilityExplanation,
} from './constraint-checker';

/**
 * 可行性检查结果
 *
 * 用于「约束前置」流程：Generate → Filter(isFeasible) → Score → Rank → LLM
 */
export interface FeasibilityResult {
  /** 是否可行（无硬约束违规） */
  feasible: boolean;

  /** 所有违规（含 error / warning / info） */
  violations: CheckerViolation[];

  /** 不可行时的结构化解释（供 LLM 说明为何不推荐） */
  infeasibilityExplanation?: InfeasibilityExplanation;

  /** 原始检查结果（供需要更多信息的调用方使用） */
  rawCheckResult: ConstraintCheckResult;
}

@Injectable()
export class ConstraintEngineService {
  constructor(
    @Optional() private readonly constraintChecker?: ConstraintChecker
  ) {}

  /**
   * 判断方案是否可行
   *
   * 硬约束违规（violations.severity === 'error'）→ feasible = false
   * 仅 warning/info → feasible = true（可参与评分，软约束转为 Penalty）
   *
   * @param state 旅行世界状态
   * @param plan 待检查的方案
   * @returns 可行性结果
   */
  async isFeasible(
    state: TripWorldState,
    plan: TripPlan
  ): Promise<FeasibilityResult> {
    if (!this.constraintChecker) {
      return {
        feasible: true,
        violations: [],
        rawCheckResult: {
          violations: [],
          isValid: true,
          summary: { errorCount: 0, warningCount: 0, infoCount: 0 },
        },
      };
    }

    const checkResult = await this.constraintChecker.checkPlan(state, plan);

    return {
      feasible: checkResult.isValid,
      violations: checkResult.violations,
      infeasibilityExplanation: checkResult.infeasibilityExplanation,
      rawCheckResult: checkResult,
    };
  }

  /**
   * 快速判断是否可行（仅 boolean，不返回详情）
   */
  async checkFeasible(state: TripWorldState, plan: TripPlan): Promise<boolean> {
    const result = await this.isFeasible(state, plan);
    return result.feasible;
  }
}
