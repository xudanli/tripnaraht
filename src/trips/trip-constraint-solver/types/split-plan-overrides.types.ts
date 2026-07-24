import type { DecisionCheckerSplitLogisticsDto } from './decision-checker.types';
import type { PlanningDaySplitDto } from './planning-conflicts.types';

export interface SplitPlanGroupOverride {
  id: string;
  label?: string;
  activityTitle?: string;
}

export interface SplitPlanOverrides {
  logistics?: Partial<DecisionCheckerSplitLogisticsDto>;
  groups?: SplitPlanGroupOverride[];
  daySplit?: {
    title?: string;
    stats?: { meetupTime?: string };
    rejoin?: { title?: string; placeName?: string; startTime?: string };
  };
  emergencyNote?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type SplitPlanOverridesMap = Record<string, SplitPlanOverrides>;
