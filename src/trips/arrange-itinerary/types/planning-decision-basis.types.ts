/**
 * 规划工作台决策依据卡 — 「发生了什么」+ 上下文六格
 * @see ARRANGE_ITINERARY_API.md § 决策依据
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
