// src/agent/policy/trip-policy.types.ts
/**
 * Policy Layer：当前任务约束与执行偏好（中期，通常一次行程周期内演化）。
 */
export type TripStyle = 'self_drive' | 'guided' | 'mixed';
export type RiskToleranceBand = 'low' | 'medium' | 'high';
export type BudgetLevel = 'economy' | 'comfort' | 'luxury';

export interface TripExecutionPolicyV1 {
  tripStyle: TripStyle;
  riskTolerance: RiskToleranceBand;
  budgetLevel: BudgetLevel;
  vehiclePreference?: string;
  avoidLongDrivingDays?: boolean;
}
