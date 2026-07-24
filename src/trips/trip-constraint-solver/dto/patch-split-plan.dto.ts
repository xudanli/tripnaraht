import type { SplitPlanOverrides } from '../types/split-plan-overrides.types';

export interface PatchSplitPlanBody {
  constraintsVersion?: number;
  logistics?: SplitPlanOverrides['logistics'];
  groups?: SplitPlanOverrides['groups'];
  daySplit?: SplitPlanOverrides['daySplit'];
  emergencyNote?: string;
}

export interface PatchSplitPlanResponse {
  splitPlanId: string;
  constraintsVersion: number;
  overrides: SplitPlanOverrides;
  splitPlan: import('../types/decision-checker.types').DecisionCheckerSplitPlanDto;
  daySplit: import('../types/planning-conflicts.types').PlanningDaySplitDto;
}
