/**
 * 规划工作台决策依据卡 — 前端类型 SSOT
 */

export type PlanningDecisionBasisFieldIcon =
  | 'travel_time'
  | 'buffer'
  | 'dwell'
  | 'reservation'
  | 'lunch'
  | 'validity';

export interface PlanningWhatHappened {
  headline: string;
  narrative: string;
  conflictId?: string;
  dayIndex?: number;
}

export interface PlanningDecisionBasisField {
  id: string;
  key: string;
  label: string;
  value: string;
  subtext?: string;
  icon: PlanningDecisionBasisFieldIcon;
  tone?: 'good' | 'neutral' | 'warn';
  itemId?: string;
  placeId?: number;
}

export interface PlanningDecisionBasis {
  schema: 'tripnara.planning_decision_basis@v1';
  tripId: string;
  conflictId?: string;
  proposalId?: string;
  generatedAt: string;
  whatHappened: PlanningWhatHappened;
  contextFields: PlanningDecisionBasisField[];
  dataValidUntil?: string;
  updatedAt?: string;
  optionCount?: number;
  refreshUrl: string;
}

export const DECISION_BASIS_FIELD_ICON_KEYS: Record<
  PlanningDecisionBasisFieldIcon,
  string
> = {
  travel_time: 'car',
  buffer: 'clock',
  dwell: 'hourglass',
  reservation: 'ticket',
  lunch: 'utensils',
  validity: 'shield-check',
};
