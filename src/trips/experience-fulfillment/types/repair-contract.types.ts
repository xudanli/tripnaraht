/**
 * Repair Contract — PRD §12
 */

import type { ExperienceIntentPriority } from './experience-atom.types';
import type { DecisionRequest, Violation, VerificationScope } from './verification-result.types';

export type RepairActionKind =
  | 'REPLACE_ITEM'
  | 'REORDER_ITEMS'
  | 'SHORTEN_DWELL'
  | 'CHANGE_START_TIME'
  | 'SPLIT_PARTICIPANTS'
  | 'REMOVE_OPTIONAL_ITEM'
  | 'CHANGE_OVERNIGHT_NODE';

export interface ImmutableConstraint {
  field: string;
  value: unknown;
  reason: string;
}

export interface PreserveGoal {
  intent: string;
  minimumScore?: number;
  priority: ExperienceIntentPriority;
}

export interface RelaxableConstraint {
  field: string;
  currentValue: unknown;
  allowedRange?: unknown;
}

export interface ReplacementSearchSpace {
  geoBounds?: {
    centerPoiId?: string;
    maxRadiusKm?: number;
  };
  allowedPoiTypes?: string[];
  excludedPoiIds?: string[];
  vehicleAccess?: string[];
  availableTimeWindow?: { start: string; end: string };
  budgetLimit?: number;
  maxDetourMinutes?: number;
}

export interface RepairContract {
  contractId: string;
  scope: VerificationScope;
  targetIds: string[];
  trigger: {
    verificationRunId: string;
    generatedAt: string;
    ruleVersion: string;
  };
  violations: Violation[];
  immutableConstraints: ImmutableConstraint[];
  preserveGoals: PreserveGoal[];
  relaxableConstraints: RelaxableConstraint[];
  replacementSearchSpace: ReplacementSearchSpace;
  optimizationObjective: {
    primary: string;
    secondary: string[];
  };
  repairActionsAllowed: RepairActionKind[];
  userDecisionRequired?: DecisionRequest[];
  terminationConditions: {
    maxRepairRounds: number;
    minimumAcceptableScore: number;
  };
}
