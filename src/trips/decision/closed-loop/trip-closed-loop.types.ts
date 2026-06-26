import type { ISODate, ISOTime } from '../world-model';
import type { PlanSlot, TripPlan } from '../plan-model';

export type TripActionType =
  | 'ADD_SLOT'
  | 'REMOVE_SLOT'
  | 'MOVE_SLOT'
  | 'REPLACE_SLOT'
  | 'CHANGE_PACE'
  | 'ACCEPT_RISK'
  | 'ADD_CONSTRAINT';

export interface TripActionBase {
  id?: string;
  type: TripActionType;
  actor?: 'user' | 'system';
  reason?: string;
  timestamp?: string;
}

export interface AddSlotAction extends TripActionBase {
  type: 'ADD_SLOT';
  targetDate: ISODate;
  slot: PlanSlot;
}

export interface RemoveSlotAction extends TripActionBase {
  type: 'REMOVE_SLOT';
  slotId: string;
}

export interface MoveSlotAction extends TripActionBase {
  type: 'MOVE_SLOT';
  slotId: string;
  targetDate: ISODate;
  targetTime?: ISOTime;
}

export interface ReplaceSlotAction extends TripActionBase {
  type: 'REPLACE_SLOT';
  slotId: string;
  replacement: PlanSlot;
}

export interface ChangePaceAction extends TripActionBase {
  type: 'CHANGE_PACE';
  pace: 'relaxed' | 'moderate' | 'intense';
}

export interface AcceptRiskAction extends TripActionBase {
  type: 'ACCEPT_RISK';
  issueIds: string[];
}

export interface AddConstraintAction extends TripActionBase {
  type: 'ADD_CONSTRAINT';
  constraint: {
    key: string;
    value: unknown;
    severity?: 'hard' | 'soft';
  };
}

export type TripAction =
  | AddSlotAction
  | RemoveSlotAction
  | MoveSlotAction
  | ReplaceSlotAction
  | ChangePaceAction
  | AcceptRiskAction
  | AddConstraintAction;

export type TripDecisionStatus = 'safe' | 'risky' | 'blocked';

export type TripDecisionIssueDomain =
  | 'safety'
  | 'pace'
  | 'spatial'
  | 'weather'
  | 'transport'
  | 'opening_hours'
  | 'budget'
  | 'uncertainty';

export interface TripDecisionIssue {
  id: string;
  domain: TripDecisionIssueDomain;
  severity: 'hard' | 'soft' | 'info';
  title: string;
  detail: string;
  date?: ISODate;
  slotId?: string;
  affectedSlotIds?: string[];
  evidenceRefs?: string[];
  repairHint?: string;
}

export interface TripRepairSuggestion {
  id: string;
  mode: 'safer' | 'lighter' | 'spatial_repair' | 'evidence_needed';
  title: string;
  rationale: string;
  actions: TripAction[];
}

export interface TripStateMetrics {
  dayCount: number;
  slotCount: number;
  estActiveMinutes?: number;
  estTravelMinutes?: number;
  robustnessScore?: number;
  maxDailySlotCount: number;
  maxDailyTravelMinutes: number;
}

export interface ClosedLoopTripState {
  tripId?: string;
  plan: TripPlan;
  actionHistory: TripAction[];
  acceptedRiskIssueIds: string[];
  constraints: Record<string, unknown>;
  metrics: TripStateMetrics;
}

export interface TripDecisionReport {
  status: TripDecisionStatus;
  score: number;
  hardViolations: TripDecisionIssue[];
  softRisks: TripDecisionIssue[];
  uncertainty: TripDecisionIssue[];
  repairSuggestions: TripRepairSuggestion[];
  simulatedState: ClosedLoopTripState;
  appliedAction?: TripAction;
}

export interface TripFailureEvent {
  tripId?: string;
  actionId?: string;
  eventType:
    | 'USER_REJECTED_REPAIR'
    | 'USER_REMOVED_SLOT'
    | 'USER_REPORTED_TOO_TIRING'
    | 'EXECUTION_FAILED'
    | 'EVIDENCE_INVALIDATED'
    | 'RISK_ACCEPTED';
  failedReason?: string;
  affectedIssueIds?: string[];
  affectedSlotIds?: string[];
  stateSnapshot?: Pick<ClosedLoopTripState, 'tripId' | 'metrics' | 'constraints'>;
  timestamp: string;
}

export interface ClosedLoopUiIssueHint {
  id: string;
  severity: 'block' | 'warn' | 'info';
  domain: TripDecisionIssueDomain;
  title: string;
  detail: string;
  date?: ISODate;
  affectedSlotIds?: string[];
  evidenceRefs?: string[];
}

export interface ClosedLoopUiActionHint {
  id: string;
  label: string;
  mode: TripRepairSuggestion['mode'];
  rationale: string;
  actionCount: number;
}

export interface ClosedLoopUiHints {
  status: TripDecisionStatus;
  score: number;
  tone: 'positive' | 'caution' | 'danger';
  headline: string;
  summary: string;
  primaryIssues: ClosedLoopUiIssueHint[];
  actionHints: ClosedLoopUiActionHint[];
  counts: {
    hard: number;
    soft: number;
    uncertainty: number;
  };
}
