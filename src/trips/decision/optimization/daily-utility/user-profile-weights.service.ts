/**
 * User Profile to Weights 映射服务
 *
 * Phase 2 扩展：w = f(user_profile)
 *
 * 用户类型映射（设计文档）：
 * - 背包客：w_cost ↑, w_comfort ↓
 * - 家庭旅行：w_safety ↑, w_comfort ↑
 * - 豪华旅行：w_exp ↑, w_cost ↓
 */

import { Injectable } from '@nestjs/common';
import {
  DailyUtilityWeights,
  DEFAULT_DAILY_UTILITY_WEIGHTS,
} from './daily-utility.interface';
import { TripWorldState } from '../../world-model';
import { ConstraintDSL } from '../../constraints/constraint-dsl.types';

export type InferredUserType = 'backpacker' | 'family' | 'luxury' | 'balanced';

/** 预设权重模板 */
const WEIGHT_PROFILES: Record<InferredUserType, DailyUtilityWeights> = {
  backpacker: {
    w_exp: 0.3,
    w_cost: 0.35,
    w_time: 0.2,
    w_comfort: 0.05,
    w_safety: 0.1,
  },
  family: {
    w_exp: 0.25,
    w_cost: 0.15,
    w_time: 0.15,
    w_comfort: 0.25,
    w_safety: 0.2,
  },
  luxury: {
    w_exp: 0.45,
    w_cost: 0.1,
    w_time: 0.2,
    w_comfort: 0.15,
    w_safety: 0.1,
  },
  balanced: DEFAULT_DAILY_UTILITY_WEIGHTS,
};

@Injectable()
export class UserProfileWeightsService {
  /**
   * 从 state + constraintDSL 推断个性化权重
   */
  inferWeights(
    state: TripWorldState,
    constraintDSL?: ConstraintDSL | null
  ): { weights: DailyUtilityWeights; userType: InferredUserType } {
    const prefs = state?.context?.preferences;
    const soft = constraintDSL?.soft_constraints;

    const pace = prefs?.pace || soft?.pace?.preference || 'moderate';
    const riskTolerance =
      prefs?.riskTolerance || soft?.risk_tolerance?.level || 'medium';
    const costSensitivity = soft?.cost_sensitivity?.level || 'medium';
    const comfortLevel = soft?.comfort_level?.hotel_quality || 'medium';

    // 背包客：省钱 + 可接受低舒适
    const backpackerScore =
      (costSensitivity === 'high' ? 2 : costSensitivity === 'medium' ? 1 : 0) +
      (comfortLevel === 'low' ? 1 : 0) +
      (pace === 'intense' ? 1 : 0);

    // 家庭：安全 + 舒适
    const familyScore =
      (riskTolerance === 'low' ? 2 : 0) +
      (comfortLevel === 'high' ? 2 : comfortLevel === 'medium' ? 1 : 0);

    // 豪华：不敏感成本 + 重视体验
    const luxuryScore =
      (costSensitivity === 'low' ? 2 : 0) +
      (pace === 'relaxed' ? 1 : 0) +
      (comfortLevel === 'high' ? 1 : 0);

    let userType: InferredUserType = 'balanced';
    if (backpackerScore >= 2 && backpackerScore >= familyScore && backpackerScore >= luxuryScore) {
      userType = 'backpacker';
    } else if (familyScore >= 2 && familyScore >= luxuryScore) {
      userType = 'family';
    } else if (luxuryScore >= 2) {
      userType = 'luxury';
    }

    const weights = { ...WEIGHT_PROFILES[userType] };
    return { weights, userType };
  }

  /**
   * 获取指定用户类型的预设权重
   */
  getWeightsForUserType(userType: InferredUserType): DailyUtilityWeights {
    return { ...WEIGHT_PROFILES[userType] };
  }
}
