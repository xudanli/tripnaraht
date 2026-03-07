/**
 * Travel World Model Phase 5: Travel Simulation 接口
 *
 * 预测单点/整日体验分数，供决策与优化使用
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import type { ExperienceVector } from '../../places/interfaces/experience-vector.interface';

export interface TravelSimulationInput {
  placeId: number;
  /** ISO 日期时间或小时 0-23 */
  visitTime: string;
  placeSnapshot?: {
    bestVisitTime?: 'morning' | 'afternoon' | 'evening' | 'any';
    category?: string;
    rating?: number;
  };
  userProfile?: { fitnessLevel?: string; preferences?: ExperienceVector };
  weather?: { accessibilityScore?: number };
  crowd?: { level?: number };
}

export interface TravelSimulationOutput {
  predictedExperienceScore: number;
  factors: { crowd?: number; weather?: number; timing?: number };
  suggestion?: string;
}
