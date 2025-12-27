// src/agent/memory/interfaces/trip-outcome-feedback.interface.ts

/**
 * L4: 行为反馈记忆（TripOutcomeFeedback）
 * 
 * 把"对/错"变成数据，用于学习
 */

export interface TripOutcomeFeedback {
  tripId: string;
  userId: string;

  overallSuccess: boolean;
  fatigueLevel?: number; // 1~5
  satisfaction?: number; // 1~5
  abandoned: boolean;

  failurePoints: string[];
  notes?: string;

  createdAt: Date;
}

/**
 * 从反馈中提取学习信号
 */
export interface LearningSignal {
  profileUpdate?: {
    pacePreference?: 'SLOW' | 'MODERATE' | 'FAST';
    altitudeTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  healthUpdate?: {
    routeDirectionId: number;
    countryCode: string;
    success: boolean;
    failureReason?: string;
    repair?: string;
  };
}

/**
 * 从反馈中提取学习信号
 */
export function extractLearningSignals(feedback: TripOutcomeFeedback): LearningSignal {
  const signal: LearningSignal = {};

  // 如果疲劳度高或满意度低，可能需要调整 pace
  if (feedback.fatigueLevel && feedback.fatigueLevel >= 4) {
    signal.profileUpdate = {
      ...signal.profileUpdate,
      pacePreference: 'SLOW',
    };
  }

  // 如果放弃或失败，记录到健康度
  if (feedback.abandoned || !feedback.overallSuccess) {
    // 这里需要从 trip 中获取 routeDirectionId，暂时留空
    // 实际使用时需要从 TripDecisionEngineService 的 log 中获取
  }

  return signal;
}

