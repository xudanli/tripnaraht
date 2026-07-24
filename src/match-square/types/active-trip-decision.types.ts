/** PRD 3.12 — Active Trip 行中 Decision 学习环 Schema */

export const ACTIVE_TRIP_DECISION_LOOP_VERSION = 'active_trip_decision_loop_v1' as const;

export type TripDecisionEventType = 'route_rollback';

export type RouteRollbackAction = 'propose' | 'confirm' | 'protest';

export type RouteRollbackStatus = 'pending' | 'confirmed' | 'protested' | 'cancelled';

export interface RouteRollbackProposalView {
  proposalId: string;
  proposedByUserId: string;
  planBRef: string;
  milestoneId: string | null;
  evidenceRefs: string[];
  note: string | null;
  proposedAt: string;
  status: RouteRollbackStatus;
  confirmations: string[];
  protests: string[];
  requiredConfirmations: number;
  confirmLatencyMs: number | null;
}

export interface ActiveTripDecisionEventRecord {
  eventId: string;
  type: TripDecisionEventType;
  action: RouteRollbackAction;
  actorUserId: string;
  at: string;
  proposalId: string | null;
  planBRef?: string | null;
  milestoneId?: string | null;
  note?: string | null;
}

export interface ActiveTripDecisionLoopMetadata {
  version: typeof ACTIVE_TRIP_DECISION_LOOP_VERSION;
  pendingRollback: RouteRollbackProposalView | null;
  eventLog: ActiveTripDecisionEventRecord[];
}

export interface ActiveTripDecisionStateView {
  tripId: string;
  loop: ActiveTripDecisionLoopMetadata;
  pendingRollback: RouteRollbackProposalView | null;
  eventLog: ActiveTripDecisionEventRecord[];
}

export interface ActiveTripDecisionEventResultView {
  tripId: string;
  type: TripDecisionEventType;
  action: RouteRollbackAction;
  pendingRollback: RouteRollbackProposalView | null;
  event: ActiveTripDecisionEventRecord;
  dnaScheduled: boolean;
  /** 前端：是否应展示队员确认弹窗 */
  awaitingMemberConfirmations: boolean;
}
